from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas


class LLMSettingsRepository:
    """Data access for the app's global (non-project-scoped) LLM settings.

    The table holds a single row (id=1); `get` creates it on first call.
    """

    def __init__(self, db: Session):
        self.db = db

    def get(self) -> models.LLMSettings:
        settings = self.db.query(models.LLMSettings).filter(
            models.LLMSettings.id == 1
        ).first()
        if not settings:
            settings = models.LLMSettings(id=1)
            self.db.add(settings)
            self.db.commit()
            self.db.refresh(settings)
        return settings

    def update(self, data: schemas.LLMSettingsUpdate) -> models.LLMSettings:
        settings = self.get()
        settings.api_url = data.api_url
        settings.model_name = data.model
        # api_key semantics: None = leave unchanged, "" = clear, any other value = set
        if data.api_key is not None:
            settings.api_key = data.api_key
        if data.temperature is not None:
            settings.temperature = data.temperature
        self.db.commit()
        self.db.refresh(settings)
        return settings