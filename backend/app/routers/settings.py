from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas
from app.database import get_db
from app.repositories import LLMSettingsRepository
from app.services.llm_service import (llm_service, LLMConfigError,
                                       LLMConnectionError, LLMResponseError)

router = APIRouter(prefix="/settings", tags=["Settings"])

def get_llm_settings_repo(db: Session = Depends(get_db)):
    return LLMSettingsRepository(db)


def _to_response(settings) -> schemas.LLMSettingsResponse:
    # The key is never echoed back in full — only a "is set" flag and a mask
    # showing its last 4 characters.
    masked = f"••••{settings.api_key[-4:]}" if settings.api_key else None
    return schemas.LLMSettingsResponse(
        api_url=settings.api_url,
        model=settings.model_name,
        api_key_set=bool(settings.api_key),
        api_key_masked=masked,
        temperature=settings.temperature,
    )

@router.get("/llm", response_model=schemas.LLMSettingsResponse)
def get_llm_settings(repo: LLMSettingsRepository = Depends(get_llm_settings_repo)):
    return _to_response(repo.get())

@router.put("/llm", response_model=schemas.LLMSettingsResponse)
def update_llm_settings(data: schemas.LLMSettingsUpdate,
                        repo: LLMSettingsRepository = Depends(get_llm_settings_repo)):
    return _to_response(repo.update(data))

@router.post("/llm/test")
def test_llm_connection(test_data: Optional[schemas.LLMSettingsTestRequest] = None,
                        repo: LLMSettingsRepository = Depends(get_llm_settings_repo)):
    saved = repo.get()
    # Overlay the request's provided fields so the user can test the values
    # currently typed in the settings form — including an API key that has
    # not been saved yet. Blank/omitted fields fall back to the saved row.
    effective = saved
    if test_data:
        effective = models.LLMSettings(
            api_url=(test_data.api_url or "").strip() or saved.api_url,
            model_name=(test_data.model or "").strip() or saved.model_name,
            api_key=(test_data.api_key or "").strip() or saved.api_key,
            temperature=(test_data.temperature if test_data.temperature is not None
                         else saved.temperature),
        )
    try:
        llm_service.test_connection(effective)
    except LLMConfigError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except LLMConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except LLMResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Test failed: {e}")
    return {"status": "ok", "model": effective.model_name}