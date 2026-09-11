from sqlalchemy import (Column, Integer, String, Text, ForeignKey, DateTime,
                        Boolean, Float, and_)
from sqlalchemy.orm import foreign, relationship
from datetime import datetime, timezone

from app.database import Base
from app.llm_defaults import (DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT,
                               DEFAULT_TEMPERATURE)

class Memo(Base):
    __tablename__ = "memos"

    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text, nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Disabled for now
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    local_path = Column(String, nullable= True)
    # owner = relationship("User", back_populates="projects")  # Disabled for now
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    codes = relationship("Code", back_populates="project", cascade="all, delete-orphan")
    memos = relationship("Memo", 
                         primaryjoin=and_(
                             Memo.target_id == id,
                             Memo.target_type == "project"
                         ),
                         foreign_keys=[Memo.target_id],
                         viewonly=True)
    document_folders = relationship("DocumentFolder", back_populates="project", cascade="all, delete-orphan")
    last_accessed = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    llm_system_prompt = Column(Text, nullable=True, default=lambda: DEFAULT_SYSTEM_PROMPT)
    llm_user_prompt = Column(Text, nullable=True, default=lambda: DEFAULT_USER_PROMPT)

    @property
    def document_count(self):
        return len(self.documents or [])

    @property
    def code_count(self):
        return len(self.codes or [])

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    type = Column(String, nullable=True, default="text")
    order_index = Column(Integer, nullable=False, default=0)
    metadata_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    folder_id = Column(Integer, ForeignKey("document_folders.id", ondelete="SET NULL"), nullable=True)

    project = relationship("Project", back_populates="documents")
    segments = relationship("Segment", back_populates="document", cascade="all, delete-orphan")
    folder = relationship("DocumentFolder", back_populates="documents")

class Code(Base):
    __tablename__ = "codes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, nullable=False, default="#FFFFFF")
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("codes.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    order_index = Column(Integer, default=0)
    ai_suggested = Column(Boolean, nullable=False, default=False)

    project = relationship("Project", back_populates="codes")
    segments = relationship("Segment", back_populates="code", cascade="all, delete-orphan")
    parent = relationship("Code", remote_side=[id], backref="children")
    memos = relationship("Memo", 
                         primaryjoin=and_(
                             Memo.target_id == id,
                             Memo.target_type == "code"
                         ),
                         foreign_keys=[Memo.target_id],
                         viewonly=True)

class Segment(Base):
    __tablename__ = "segments"

    id = Column(Integer, primary_key=True, index=True)
    start_char = Column(Integer, nullable=False)
    end_char = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    code_id = Column(Integer, ForeignKey("codes.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    document = relationship("Document", back_populates="segments")
    code = relationship("Code", back_populates="segments")
    memos = relationship("Memo", 
                         primaryjoin=and_(
                             Memo.target_id == id,
                             Memo.target_type == "segment"
                         ),
                         foreign_keys=[Memo.target_id],
                         viewonly=True)



class DocumentFolder(Base):
    __tablename__ = "document_folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, default=0)
    parent_id = Column(Integer, ForeignKey("document_folders.id", ondelete="CASCADE"), nullable=True)

    project = relationship("Project", back_populates="document_folders")
    documents = relationship("Document", back_populates="folder")
    parent = relationship("DocumentFolder", remote_side=[id], backref="children")


class LLMSettings(Base):
    # The app's first global (non-project-scoped) settings: a single row (id=1)
    # holding the OpenAI-compatible API configuration used by code suggestions.
    __tablename__ = "llm_settings"

    id = Column(Integer, primary_key=True)
    api_url = Column(Text, nullable=False, default="")
    api_key = Column(Text, nullable=False, default="")
    model_name = Column(String, nullable=False, default="")
    temperature = Column(Float, nullable=False, default=DEFAULT_TEMPERATURE)


# === USER FUNCTIONALITY DISABLED FOR NOW ===
# class User(Base):
#     __tablename__ = "users"
#     id = Column(Integer, primary_key=True, index=True)
#     name = Column(String, nullable=False, index=True)
#     email = Column(String, nullable=False, unique=True, index=True)
#     projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")    