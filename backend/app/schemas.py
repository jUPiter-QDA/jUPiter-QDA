from pydantic import BaseModel, Field, computed_field
from typing import Optional, List, Dict
from datetime import datetime

# Project Schemas

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    local_path: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    local_path: Optional[str] = None
    document_count: Optional[int] = 0
    code_count: Optional[int] = 0
    last_accessed: Optional[datetime] = None
    llm_system_prompt: Optional[str] = None
    llm_user_prompt: Optional[str] = None

    class Config:
        from_attributes = True

class ProjectUpdate(BaseModel):
    name: str
    description: Optional[str] = None
    local_path: Optional[str] = None
    llm_system_prompt: Optional[str] = None
    llm_user_prompt: Optional[str] = None

# Code Schemas

class CodeSummary(BaseModel):
    id: int
    name: str
    color: str
    project_id: int
    parent_id: Optional[int] = None
    order_index: int
    ai_suggested: bool = False
    segments: list[SegmentSummary] = Field(exclude=True)

    @computed_field
    @property
    def frequency(self) -> int:
        return len(self.segments)

class CodeCreate(BaseModel):
    name: str
    color: str = "#FFFFFF"
    parent_id: Optional[int] = None
    ai_suggested: bool = False

class CodeUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[int] = None
    ai_suggested: Optional[bool] = None

class CodeReorderItem(BaseModel):
    id: int
    parent_id: Optional[int] = None
    order_index: int

class CodeReorderRequest(BaseModel):
    codes: List[CodeReorderItem]

class CodeMergeRequest(BaseModel):
    source_code_id: int
    target_code_id: int
    new_name: Optional[str] = None
    new_color: Optional[str] = None
    

# Segment Schemas 

class SegmentSummary(BaseModel):
    content: str

class SegmentCreate(BaseModel):
    document_id: int
    code_id: int
    start_char: int
    end_char: int
    content: str

class SegmentDetail(BaseModel):
    id: int
    document_id: int
    code_id: int
    start_char: int
    end_char: int
    content: str

class SegmentUpdate(BaseModel):
    start_char: int
    end_char: int
    content: str


# Memo Schemas

class MemoBase(BaseModel):
    text: str
    target_type: str
    target_id: int

class MemoCreate(MemoBase):
    pass

class MemoUpdate(BaseModel):
    text: Optional[str] = None

class MemoResponse(MemoBase):
    id: int
    created_at: datetime
    target_name: Optional[str] = None  

    class Config:
        from_attributes = True

# Document and Folder Schemas

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderMoveRequest(BaseModel):
    parent_id: Optional[int] = None

class FolderRename(BaseModel):
    name: str

class FolderReorderItem(BaseModel):
    id: int
    order_index: int

class FolderReorderRequest(BaseModel):
    folders: List[FolderReorderItem]

class DocumentUpdateContent(BaseModel):
    content: str

class DocumentRename(BaseModel):
    filename: str

class DocumentCreateText(BaseModel):
    name: str
    content: str


class DocumentReorderItem(BaseModel):
    id: int
    order_index: int


class DocumentReorderRequest(BaseModel):
    documents: List[DocumentReorderItem]


class DocumentMetadataUpdate(BaseModel):
    metadata: Dict[str, Optional[str]]


# LLM Settings Schemas

class LLMSettingsUpdate(BaseModel):
    api_url: str
    model: str
    api_key: Optional[str] = None   # None = leave unchanged; "" = clear the key
    temperature: Optional[float] = Field(None, ge=0, le=2)   # None = leave unchanged

class LLMSettingsResponse(BaseModel):
    api_url: str
    model: str
    api_key_set: bool
    api_key_masked: Optional[str] = None
    temperature: float

class LLMSettingsTestRequest(BaseModel):
    api_url: Optional[str] = None   # override the saved value for this test only
    model: Optional[str] = None
    api_key: Optional[str] = None   # omitted/blank → use the saved key; typed value used as-is
    temperature: Optional[float] = Field(None, ge=0, le=2)   # override the saved value for this test only

# AI Code Suggestion Schemas

class CodeSuggestionRequest(BaseModel):
    excerpt: str
    document_id: Optional[int] = None   # accepted, reserved for future context

class CodeSuggestion(BaseModel):
    name: str
    rationale: Optional[str] = None
    existing_code_id: Optional[int] = None
