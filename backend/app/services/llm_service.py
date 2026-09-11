"""Service that talks to an OpenAI-compatible chat-completions API to suggest
QDA codes for a text excerpt.

Follows the transcribe_service pattern: a class with cheap __init__ plus a
module-level singleton at the bottom, imported directly by the routers. All
HTTP goes through httpx with the settings row's api_url/api_key/model_name.
"""

import json
import re

import httpx

import app.models as models
import app.schemas as schemas
from app.llm_defaults import (DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
                              DEFAULT_TEMPERATURE)


class LLMConfigError(Exception):
    """LLM settings row is missing or api_url/model are empty."""


class LLMConnectionError(Exception):
    """Could not reach the LLM API (connect/timeout/transport errors)."""


class LLMResponseError(Exception):
    """Non-200 status, unexpected shape, or unparseable LLM output."""


class LLMService:
    REQUEST_TIMEOUT = 60.0
    MAX_SUGGESTIONS = 10
    MAX_CODE_NAMES = 200  # cap the codebook sent in the {codes} placeholder

    def suggest_codes(self, settings: models.LLMSettings, system_template: str,
                      user_template: str, excerpt: str,
                      codes: list) -> list[schemas.CodeSuggestion]:
        if not settings or not settings.api_url.strip() or not settings.model_name.strip():
            raise LLMConfigError("LLM settings are not configured.")

        codes_block = "\n".join(f"- {c.name}" for c in codes[:self.MAX_CODE_NAMES]) \
            or "(no codes yet)"
        system_content = self._render(system_template or DEFAULT_SYSTEM_PROMPT,
                                      excerpt, codes_block)
        user_content = self._render(user_template or DEFAULT_USER_PROMPT,
                                    excerpt, codes_block)

        raw = self._chat_completion(settings.api_url.strip(), settings.api_key,
                                    settings.model_name.strip(),
                                    system_content, user_content,
                                    temperature=settings.temperature)
        parsed = self._parse_suggestions(raw)

        by_lower = {c.name.lower(): c.id for c in codes}
        return [schemas.CodeSuggestion(
                    name=s["name"],
                    rationale=s.get("rationale"),
                    existing_code_id=by_lower.get(s["name"].lower()))
                for s in parsed]

    def test_connection(self, settings: models.LLMSettings) -> None:
        """Raises the same errors as suggest_codes; returns None on success."""
        if not settings or not settings.api_url.strip() or not settings.model_name.strip():
            raise LLMConfigError("LLM settings are not configured.")
        self._chat_completion(settings.api_url.strip(), settings.api_key,
                              settings.model_name.strip(),
                              "You are a connectivity test.",
                              "Reply with the word: ok",
                              temperature=settings.temperature)

    def _render(self, template: str, excerpt: str, codes_block: str) -> str:
        # str.replace, NOT str.format — the prompts contain literal JSON braces
        return template.replace("{excerpt}", excerpt).replace("{codes}", codes_block)

    def _chat_completion(self, api_url, api_key, model,
                          system_content, user_content,
                          temperature=None) -> str:
        url = api_url.rstrip("/") + "/chat/completions"
        headers = {"Content-Type": "application/json"}
        # Local servers (Ollama, LM Studio, ...) need no key — only send it if set
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_content},
                {"role": "user", "content": user_content},
            ],
            # Transient/unpersisted settings rows may have temperature=None
            "temperature": DEFAULT_TEMPERATURE if temperature is None else temperature,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=self.REQUEST_TIMEOUT) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code == 400 and "response_format" in payload:
                    # Some OpenAI-compatible servers reject response_format —
                    # retry once without it and rely on the prompt for JSON.
                    payload.pop("response_format")
                    resp = client.post(url, json=payload, headers=headers)
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError) as e:
            raise LLMConnectionError(f"Could not reach the LLM API: {e}") from e

        if resp.status_code != 200:
            raise LLMResponseError(
                f"LLM API returned status {resp.status_code}: {resp.text[:300]}"
            )
        try:
            content = resp.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, ValueError) as e:
            raise LLMResponseError("Unexpected response shape from LLM API.") from e
        return content

    def _parse_suggestions(self, raw: str) -> list:
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: some models wrap the JSON in ```...``` fences
            stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
            try:
                data = json.loads(stripped)
            except json.JSONDecodeError as e:
                raise LLMResponseError("LLM did not return valid JSON.") from e
        items = data.get("suggestions") if isinstance(data, dict) else None
        if not isinstance(items, list):
            raise LLMResponseError("LLM response missing 'suggestions' list.")
        out, seen = [], set()
        for item in items:
            name = str(item.get("name", "")).strip() if isinstance(item, dict) else ""
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append({"name": name, "rationale": item.get("rationale")})
        if not out:
            raise LLMResponseError("LLM returned no usable suggestions.")
        return out[:self.MAX_SUGGESTIONS]


llm_service = LLMService()