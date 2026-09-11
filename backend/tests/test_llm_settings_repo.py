"""Repo tests for LLMSettingsRepository: singleton row + api_key semantics."""
import app.models as models
import app.schemas as schemas
from app.repositories import LLMSettingsRepository


def test_get_creates_default_row_on_first_call(db):
    repo = LLMSettingsRepository(db)
    settings = repo.get()
    assert settings.id == 1
    assert settings.api_url == ""
    assert settings.api_key == ""
    assert settings.model_name == ""
    assert settings.temperature == 0.2


def test_get_is_idempotent_no_duplicate_rows(db):
    repo = LLMSettingsRepository(db)
    first = repo.get()
    second = repo.get()
    assert first.id == second.id == 1
    assert db.query(models.LLMSettings).count() == 1


def test_update_sets_url_and_model(db):
    repo = LLMSettingsRepository(db)
    settings = repo.update(schemas.LLMSettingsUpdate(
        api_url="https://api.openai.com/v1", model="gpt-4o-mini",
        temperature=0.8))
    assert settings.api_url == "https://api.openai.com/v1"
    assert settings.model_name == "gpt-4o-mini"
    assert settings.temperature == 0.8


def test_update_temperature_semantics(db):
    repo = LLMSettingsRepository(db)

    # setting
    repo.update(schemas.LLMSettingsUpdate(api_url="u", model="m", temperature=1.5))
    assert repo.get().temperature == 1.5

    # None = leave unchanged
    repo.update(schemas.LLMSettingsUpdate(api_url="u", model="m", temperature=None))
    assert repo.get().temperature == 1.5


def test_update_api_key_semantics(db):
    repo = LLMSettingsRepository(db)

    # setting
    repo.update(schemas.LLMSettingsUpdate(api_url="u", model="m", api_key="sk-secret"))
    assert repo.get().api_key == "sk-secret"

    # None = leave unchanged
    repo.update(schemas.LLMSettingsUpdate(api_url="u", model="m", api_key=None))
    assert repo.get().api_key == "sk-secret"

    # "" = clear
    repo.update(schemas.LLMSettingsUpdate(api_url="u", model="m", api_key=""))
    assert repo.get().api_key == ""