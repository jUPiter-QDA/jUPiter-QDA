from sqlalchemy.orm import Session

import app.models as models
import app.schemas as schemas

class CodeRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_project(self, project_id: int):
        return self.db.query(models.Code).filter(
            models.Code.project_id == project_id
        ).order_by(models.Code.order_index).all()

    def get(self, project_id: int, code_id: int):
        return self.db.query(models.Code).filter(
            models.Code.id == code_id, models.Code.project_id == project_id
        ).first()

    def create(self, project_id: int, code_data: schemas.CodeCreate):
        new_code = models.Code(
            name=code_data.name,
            color=code_data.color,
            project_id=project_id,
            parent_id=code_data.parent_id,
            ai_suggested=code_data.ai_suggested
        )
        self.db.add(new_code)
        self.db.commit()
        self.db.refresh(new_code)
        return new_code

    def update(self, project_id: int, code_id: int, update_data: schemas.CodeUpdate):
        code = self.db.query(models.Code).filter(
            models.Code.id == code_id, models.Code.project_id == project_id
        ).first()
        if code:
            if update_data.name is not None: code.name = update_data.name
            if update_data.color is not None: code.color = update_data.color
            if update_data.ai_suggested is not None: code.ai_suggested = update_data.ai_suggested
            self.db.commit()
            self.db.refresh(code)
        return code

    def reorder(self, project_id: int, code_items: list):
        for item in code_items:
            code = self.db.query(models.Code).filter(
                models.Code.id == item.id, models.Code.project_id == project_id
            ).first()
            if code:
                code.parent_id = item.parent_id
                code.order_index = item.order_index
        self.db.commit()

    def delete(self, project_id: int, code_id: int):
        code = self.db.query(models.Code).filter(
            models.Code.id == code_id, models.Code.project_id == project_id
        ).first()
        if code:
            # Collect the whole subtree rooted at this code. The FK-level
            # ON DELETE CASCADE never fires (SQLite FK enforcement is off),
            # and SQLAlchemy's default would just re-parent children to NULL.
            subtree_ids = [code.id]
            frontier = [code.id]
            while frontier:
                child_rows = self.db.query(models.Code.id).filter(
                    models.Code.parent_id.in_(frontier)
                ).all()
                frontier = [row[0] for row in child_rows]
                subtree_ids.extend(frontier)

            # Code memos are polymorphic (target_id has no FK), so delete them
            # explicitly for every code in the subtree.
            self.db.query(models.Memo).filter(
                models.Memo.target_type == "code", models.Memo.target_id.in_(subtree_ids)
            ).delete(synchronize_session=False)

            self.db.query(models.Segment).filter(
                models.Segment.code_id.in_(subtree_ids)
            ).delete(synchronize_session=False)

            self.db.query(models.Code).filter(
                models.Code.id.in_(subtree_ids)
            ).delete(synchronize_session=False)

            self.db.commit()
            return True
        return False
    
    def merge(self, project_id: int, source_id: int, target_id: int, new_name: str = None, new_color: str = None):
        source = self.db.query(models.Code).filter(models.Code.id == source_id, models.Code.project_id == project_id).first()
        target = self.db.query(models.Code).filter(models.Code.id == target_id, models.Code.project_id == project_id).first()
        
        if not source or not target:
            return False

        self.db.query(models.Segment).filter(models.Segment.code_id == source_id).update({"code_id": target_id})
        
        self.db.query(models.Code).filter(models.Code.parent_id == source_id).update({"parent_id": target_id})
        
        self.db.query(models.Memo).filter(models.Memo.target_type == "code", models.Memo.target_id == source_id).update({"target_id": target_id})
        
        if new_name:
            target.name = new_name
        if new_color:
            target.color = new_color

        self.db.delete(source)
        self.db.commit()
        return True