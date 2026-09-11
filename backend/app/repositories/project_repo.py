from sqlalchemy.orm import Session
from datetime import datetime, timezone

import app.models as models
import app.schemas as schemas

class ProjectRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_all(self):
        return self.db.query(models.Project).order_by(models.Project.last_accessed.desc()).all()

    def get_by_id(self, project_id: int):
        project = self.db.query(models.Project).filter(models.Project.id == project_id).first()
        if project:
            project.last_accessed = datetime.now(timezone.utc)
            self.db.commit()
        return project

    def get_by_local_path(self, path: str):
        return self.db.query(models.Project).filter(models.Project.local_path == path).first()

    def create(self, project_data: schemas.ProjectCreate, final_path: str = None, parent_id: int = None):
        new_project = models.Project(
            name=project_data.name, 
            description=project_data.description,
            local_path=final_path,
            last_accessed=None
        )
        self.db.add(new_project)
        self.db.commit()
        self.db.refresh(new_project)
        return new_project
        
    def update(self, project_id: int, project_data: schemas.ProjectUpdate):
        project = self.get_by_id(project_id)
        if project:
            project.name = project_data.name
            project.description = project_data.description
            if project_data.llm_system_prompt is not None: project.llm_system_prompt = project_data.llm_system_prompt
            if project_data.llm_user_prompt is not None: project.llm_user_prompt = project_data.llm_user_prompt
            self.db.commit()
            self.db.refresh(project)
        return project

    def delete(self, project_id: int):
        project = self.get_by_id(project_id)
        if project:
            self.db.delete(project)
            self.db.commit()
            return True
        return False