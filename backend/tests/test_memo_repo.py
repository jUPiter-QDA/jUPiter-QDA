import app.models as models
import app.schemas as schemas
from app.repositories import MemoRepository
from tests.helpers import make_project


def test_create_stores_polymorphic_target(db):
    project = make_project(db)
    memo = MemoRepository(db).create(schemas.MemoCreate(
        text="a project memo", target_type="project", target_id=project.id,
    ))
    assert memo.id is not None
    assert memo.text == "a project memo"
    assert memo.target_type == "project"
    assert memo.target_id == project.id
    assert memo.created_at is not None


def test_update_text(db):
    repo = MemoRepository(db)
    memo = repo.create(schemas.MemoCreate(text="old", target_type="project", target_id=1))
    assert repo.update(memo.id, "new").text == "new"
    assert repo.update(9999, "nope") is None


def test_delete(db):
    repo = MemoRepository(db)
    memo = repo.create(schemas.MemoCreate(text="x", target_type="code", target_id=1))

    assert repo.delete(memo.id) is True
    assert db.query(models.Memo).count() == 0
    assert repo.delete(memo.id) is False