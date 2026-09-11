from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import app.models as models
from app.database import get_db
import app.schemas as schemas
from app.repositories import CodeRepository
from app.services.docx_service import create_codebook_docx
from app.services.llm_service import (llm_service, LLMConfigError,
                                       LLMConnectionError, LLMResponseError)
from app.llm_defaults import DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT


router = APIRouter(prefix="/projects/{project_id}/codes", tags=["Codes"])

def get_code_repo(db: Session = Depends(get_db)):
    return CodeRepository(db)

@router.get("/", response_model=list[schemas.CodeSummary])
def get_project_codes(project_id: int, repo: CodeRepository = Depends(get_code_repo)):
    codes = repo.get_by_project(project_id)
    return codes

@router.post("/", response_model=schemas.CodeSummary, status_code=201)
def create_code(project_id: int, 
                code: schemas.CodeCreate, 
                repo: CodeRepository = Depends(get_code_repo)):
    return repo.create(project_id, code)

@router.put("/reorder", response_model=list[schemas.CodeSummary])
def reorder_codes(project_id: int, 
                  reorder_request: schemas.CodeReorderRequest, 
                  repo: CodeRepository = Depends(get_code_repo)):
    repo.reorder(project_id, reorder_request.codes)
    codes = repo.get_by_project(project_id)
    return codes

@router.put("/{code_id}", response_model=schemas.CodeSummary)
def update_code(project_id: int, 
                code_id: int, 
                code_update: schemas.CodeUpdate, 
                repo: CodeRepository = Depends(get_code_repo)):
    code = repo.update(project_id, code_id, code_update)
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    return code

@router.delete("/{code_id}", status_code=204)
def delete_code(project_id: int, 
                code_id: int, 
                repo: CodeRepository = Depends(get_code_repo)):
    success = repo.delete(project_id, code_id)
    if not success:
        raise HTTPException(status_code=404, detail="Code not found")

@router.post("/merge", response_model=schemas.CodeSummary)
def merge_codes(project_id: int,
                merge_req: schemas.CodeMergeRequest,
                repo: CodeRepository = Depends(get_code_repo)):
    success = repo.merge(
        project_id,
        merge_req.source_code_id,
        merge_req.target_code_id,
        merge_req.new_name,
        merge_req.new_color
    )
    if not success:
        raise HTTPException(status_code=400, detail="Merge failed. Ensure both codes exist.")
    return repo.get(project_id, merge_req.target_code_id)

@router.post("/suggest", response_model=list[schemas.CodeSuggestion])
def suggest_codes(project_id: int,
                  request: schemas.CodeSuggestionRequest,
                  db: Session = Depends(get_db)):
    """Ask the configured OpenAI-compatible LLM to suggest codes for an excerpt."""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    settings = db.query(models.LLMSettings).filter(models.LLMSettings.id == 1).first()
    codes = db.query(models.Code).filter(models.Code.project_id == project_id).all()
    try:
        return llm_service.suggest_codes(
            settings,
            project.llm_system_prompt or DEFAULT_SYSTEM_PROMPT,
            project.llm_user_prompt or DEFAULT_USER_PROMPT,
            request.excerpt,
            codes,
        )
    except LLMConfigError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except LLMConnectionError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except LLMResponseError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Suggestion failed: {e}")
@router.get("/export/docx")
def export_codebook_docx(project_id: int, db: Session = Depends(get_db)):
    # fetch project
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    mem_stream, safe_filename = create_codebook_docx(db, project)
    
    return StreamingResponse(
        mem_stream,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{safe_filename}"}
    )

