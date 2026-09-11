"""Service tests for LLMService — all HTTP is faked by patching
httpx.Client.post, mirroring how the transcribe tests fake their seams."""
import json

import httpx
import pytest

import app.models as models
import app.schemas as schemas
from app.llm_defaults import (DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
                              DEFAULT_TEMPERATURE)
from app.services.llm_service import (llm_service, LLMConfigError,
                                      LLMConnectionError, LLMResponseError)


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def _content_response(content: str) -> FakeResponse:
    return FakeResponse(payload={"choices": [{"message": {"content": content}}]})


def _settings(api_url="https://api.test/v1", api_key="sk-test", model="test-model",
              temperature=None):
    return models.LLMSettings(id=1, api_url=api_url, api_key=api_key,
                              model_name=model, temperature=temperature)


def _patch_post(monkeypatch, responses):
    """Patch httpx.Client.post to pop canned responses (a single item loops)."""
    queue = list(responses)
    captured = {"payloads": [], "headers": []}

    def fake_post(self, url, json=None, headers=None):
        # copy the payload: the service pops "response_format" for its retry,
        # and we need the pre-retry shape intact
        captured["payloads"].append(dict(json) if json else json)
        captured["headers"].append(headers)
        return queue[0] if len(queue) == 1 else queue.pop(0)

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    return captured


def test_suggest_codes_matches_existing_code_case_insensitively(monkeypatch):
    class FakeCode:
        def __init__(self, id, name):
            self.id, self.name = id, name

    _patch_post(monkeypatch, [_content_response(
        '{"suggestions": [{"name": "theme", "rationale": "fits"}]}'
    )])

    suggestions = llm_service.suggest_codes(
        _settings(), DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
        "some excerpt", [FakeCode(7, "Theme"), FakeCode(8, "Other")],
    )

    assert len(suggestions) == 1
    assert suggestions[0].name == "theme"
    assert suggestions[0].rationale == "fits"
    assert suggestions[0].existing_code_id == 7


def test_suggest_codes_new_code_has_no_existing_id(monkeypatch):
    class FakeCode:
        def __init__(self, id, name):
            self.id, self.name = id, name

    _patch_post(monkeypatch, [_content_response(
        '{"suggestions": [{"name": "Brand new", "rationale": "nothing fits"}]}'
    )])

    suggestions = llm_service.suggest_codes(
        _settings(), DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
        "excerpt", [FakeCode(7, "Theme")],
    )

    assert suggestions[0].existing_code_id is None


def test_suggest_codes_parses_markdown_fenced_json(monkeypatch):
    _patch_post(monkeypatch, [_content_response(
        '```json\n{"suggestions": [{"name": "A"}]}\n```'
    )])

    suggestions = llm_service.suggest_codes(
        _settings(), DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT, "x", [],
    )
    assert [s.name for s in suggestions] == ["A"]


def test_suggest_codes_dedupes_and_caps(monkeypatch):
    items = [{"name": n} for n in ["A", "a", "B"] + [f"C{i}" for i in range(20)]]
    _patch_post(monkeypatch, [_content_response(
        json.dumps({"suggestions": items}))])

    suggestions = llm_service.suggest_codes(
        _settings(), DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT, "x", [],
    )
    assert len(suggestions) == llm_service.MAX_SUGGESTIONS
    assert suggestions[0].name == "A"  # deduped, first spelling wins


def test_suggest_codes_unconfigured_raises_config_error():
    with pytest.raises(LLMConfigError):
        llm_service.suggest_codes(None, DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])
    with pytest.raises(LLMConfigError):
        llm_service.suggest_codes(_settings(api_url="  "), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])
    with pytest.raises(LLMConfigError):
        llm_service.suggest_codes(_settings(model=""), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])


def test_connection_error_raises(monkeypatch):
    def raise_connect(self, url, json=None, headers=None):
        raise httpx.ConnectError("refused")
    monkeypatch.setattr(httpx.Client, "post", raise_connect)

    with pytest.raises(LLMConnectionError):
        llm_service.suggest_codes(_settings(), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])


def test_http_error_status_raises_response_error(monkeypatch):
    _patch_post(monkeypatch, [FakeResponse(status_code=500, text="boom")])
    with pytest.raises(LLMResponseError):
        llm_service.suggest_codes(_settings(), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])


def test_non_json_content_raises_response_error(monkeypatch):
    _patch_post(monkeypatch, [_content_response("not json at all")])
    with pytest.raises(LLMResponseError):
        llm_service.suggest_codes(_settings(), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])


def test_empty_suggestions_raises_response_error(monkeypatch):
    _patch_post(monkeypatch, [_content_response('{"suggestions": []}')])
    with pytest.raises(LLMResponseError):
        llm_service.suggest_codes(_settings(), DEFAULT_SYSTEM_PROMPT,
                                  DEFAULT_USER_PROMPT, "x", [])


def test_render_replaces_placeholders_and_keeps_json_braces():
    template = 'Reply {"suggestions": []} with {excerpt} and {codes}'
    rendered = llm_service._render(template, "THE-EXCERPT", "- Code A")
    assert rendered == 'Reply {"suggestions": []} with THE-EXCERPT and - Code A'


def test_chat_completion_retries_without_response_format_on_400(monkeypatch):
    captured = _patch_post(monkeypatch, [
        FakeResponse(status_code=400, text="response_format not supported"),
        _content_response('{"suggestions": [{"name": "A"}]}'),
    ])

    content = llm_service._chat_completion(
        "https://api.test/v1", "sk-test", "m", "system", "user")

    assert content == '{"suggestions": [{"name": "A"}]}'
    assert "response_format" in captured["payloads"][0]
    assert "response_format" not in captured["payloads"][1]


def test_chat_completion_sends_bearer_only_with_key(monkeypatch):
    captured = _patch_post(monkeypatch, [_content_response("ok")])

    # with a key: Bearer auth header
    llm_service._chat_completion("https://api.test/v1", "sk-test", "m", "s", "u")
    assert captured["headers"][0]["Authorization"] == "Bearer sk-test"

    # without a key (local servers): no Authorization header at all
    llm_service._chat_completion("https://api.test/v1", "", "m", "s", "u")
    assert "Authorization" not in captured["headers"][1]
    assert captured["payloads"][0]["model"] == "m"


def test_suggest_codes_builds_codes_block_and_renders_templates(monkeypatch):
    class FakeCode:
        def __init__(self, id, name):
            self.id, self.name = id, name

    captured = _patch_post(monkeypatch, [
        _content_response('{"suggestions": [{"name": "X"}]}')
    ])

    user_template = "Codes:\n{codes}\nExcerpt:\n{excerpt}"
    llm_service.suggest_codes(
        _settings(), DEFAULT_SYSTEM_PROMPT, user_template,
        "the excerpt", [FakeCode(1, "One"), FakeCode(2, "Two")],
    )

    payload = captured["payloads"][0]
    system_msg, user_msg = payload["messages"]
    assert system_msg["role"] == "system"
    assert user_msg["content"] == "Codes:\n- One\n- Two\nExcerpt:\nthe excerpt"


def test_suggest_codes_empty_codebook_placeholder(monkeypatch):
    captured = _patch_post(monkeypatch, [
        _content_response('{"suggestions": [{"name": "X"}]}')
    ])

    user_template = "Codes: {codes}"
    llm_service.suggest_codes(_settings(), DEFAULT_SYSTEM_PROMPT,
                              user_template, "e", [])

    user_msg = captured["payloads"][0]["messages"][1]
    assert user_msg["content"] == "Codes: (no codes yet)"


def test_chat_completion_uses_configured_temperature(monkeypatch):
    captured = _patch_post(monkeypatch, [
        _content_response('{"suggestions": [{"name": "X"}]}')
    ])

    llm_service.suggest_codes(
        _settings(temperature=1.4), DEFAULT_SYSTEM_PROMPT,
        DEFAULT_USER_PROMPT, "x", [],
    )
    assert captured["payloads"][0]["temperature"] == 1.4


def test_chat_completion_defaults_temperature_when_unset(monkeypatch):
    captured = _patch_post(monkeypatch, [
        _content_response('{"suggestions": [{"name": "X"}]}')
    ])

    # transient/unpersisted rows have temperature=None despite the column default
    llm_service.suggest_codes(
        _settings(temperature=None), DEFAULT_SYSTEM_PROMPT,
        DEFAULT_USER_PROMPT, "x", [],
    )
    assert captured["payloads"][0]["temperature"] == DEFAULT_TEMPERATURE

    # explicit temperature is passed through to the payload
    llm_service._chat_completion("https://api.test/v1", "", "m", "s", "u",
                                 temperature=0.0)
    assert captured["payloads"][1]["temperature"] == 0.0