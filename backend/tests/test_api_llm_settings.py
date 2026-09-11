"""API tests for the settings router: LLM settings CRUD, key masking, and the
test-connection endpoint (with its saved-value fallback semantics)."""
import app.models as models
from app.services.llm_service import (llm_service, LLMConfigError,
                                      LLMConnectionError)


def test_get_llm_settings_fresh_defaults(client):
    response = client.get("/settings/llm")
    assert response.status_code == 200
    assert response.json() == {
        "api_url": "", "model": "", "api_key_set": False, "api_key_masked": None,
        "temperature": 0.2,
    }


def test_put_then_get_masks_api_key(client):
    response = client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "api_key": "sk-verysecret-1234",
        "temperature": 0.7,
    })
    assert response.status_code == 200

    body = client.get("/settings/llm").json()
    assert body["api_url"] == "https://api.openai.com/v1"
    assert body["model"] == "gpt-4o-mini"
    assert body["api_key_set"] is True
    assert body["api_key_masked"] == "••••1234"
    assert body["temperature"] == 0.7
    # the full key never reaches the client
    assert "sk-verysecret-1234" not in response.text


def test_put_without_temperature_preserves_saved_temperature(client, db):
    client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1", "model": "m", "temperature": 0.9,
    })
    response = client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1", "model": "other-model",
    })
    assert response.status_code == 200

    db.expire_all()
    settings = db.query(models.LLMSettings).filter(models.LLMSettings.id == 1).first()
    assert settings.temperature == 0.9


def test_put_rejects_temperature_out_of_range(client):
    assert client.put("/settings/llm", json={
        "api_url": "u", "model": "m", "temperature": 2.5,
    }).status_code == 422
    assert client.put("/settings/llm", json={
        "api_url": "u", "model": "m", "temperature": -0.1,
    }).status_code == 422


def test_put_without_api_key_preserves_saved_key(client, db):
    client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1", "model": "m", "api_key": "sk-keepme",
    })
    response = client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1", "model": "other-model",
    })
    assert response.status_code == 200

    db.expire_all()
    settings = db.query(models.LLMSettings).filter(models.LLMSettings.id == 1).first()
    assert settings.api_key == "sk-keepme"
    assert settings.model_name == "other-model"


def test_put_empty_api_key_clears(client, db):
    client.put("/settings/llm", json={
        "api_url": "https://api.openai.com/v1", "model": "m", "api_key": "sk-keepme",
    })
    client.put("/settings/llm", json={"api_url": "u", "model": "m", "api_key": ""})

    db.expire_all()
    settings = db.query(models.LLMSettings).filter(models.LLMSettings.id == 1).first()
    assert settings.api_key == ""


def test_connection_ok(client, monkeypatch):
    monkeypatch.setattr(llm_service, "test_connection", lambda s: None)

    response = client.post("/settings/llm/test", json={})

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_connection_config_error_409(client, monkeypatch):
    def raise_config(settings):
        raise LLMConfigError("LLM settings are not configured.")
    monkeypatch.setattr(llm_service, "test_connection", raise_config)

    response = client.post("/settings/llm/test", json={})
    assert response.status_code == 409
    assert response.json()["detail"] == "LLM settings are not configured."


def test_connection_unreachable_502(client, monkeypatch):
    def raise_conn(settings):
        raise LLMConnectionError("Could not reach the LLM API: boom")
    monkeypatch.setattr(llm_service, "test_connection", raise_conn)

    response = client.post("/settings/llm/test", json={})
    assert response.status_code == 502


def test_connection_uses_form_overrides_and_typed_key(client, db, monkeypatch):
    """The /test body overrides saved values so unsaved form input — including
    a freshly typed API key — is what actually gets tested."""
    client.put("/settings/llm", json={
        "api_url": "https://saved/v1", "model": "saved-model",
        "api_key": "sk-saved-key", "temperature": 0.3,
    })

    seen = {}
    monkeypatch.setattr(
        llm_service, "test_connection",
        lambda s: seen.update(api_url=s.api_url, model=s.model_name,
                              api_key=s.api_key, temperature=s.temperature),
    )

    response = client.post("/settings/llm/test", json={
        "api_url": "https://typed/v1", "model": "typed-model",
        "api_key": "sk-typed-key", "temperature": 1.1,
    })
    assert response.status_code == 200
    assert seen == {
        "api_url": "https://typed/v1",
        "model": "typed-model",
        "api_key": "sk-typed-key",
        "temperature": 1.1,
    }


def test_connection_blank_fields_fall_back_to_saved(client, monkeypatch):
    client.put("/settings/llm", json={
        "api_url": "https://saved/v1", "model": "saved-model",
        "api_key": "sk-saved-key", "temperature": 0.3,
    })

    seen = {}
    monkeypatch.setattr(
        llm_service, "test_connection",
        lambda s: seen.update(api_url=s.api_url, model=s.model_name,
                              api_key=s.api_key, temperature=s.temperature),
    )

    response = client.post("/settings/llm/test", json={
        "api_url": "", "model": "", "api_key": "",
    })
    assert response.status_code == 200
    assert seen == {
        "api_url": "https://saved/v1",
        "model": "saved-model",
        "api_key": "sk-saved-key",
        "temperature": 0.3,
    }