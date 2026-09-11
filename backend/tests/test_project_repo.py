from datetime import datetime

import app.models as models
import app.schemas as schemas
from app.repositories import ProjectRepository
from tests.helpers import make_code, make_document, make_folder, make_memo, make_project, make_segment


def test_create_sets_fields(db):
    repo = ProjectRepository(db)
    project = repo.create(schemas.ProjectCreate(name="P", description="d"), None)
    assert project.id is not None
    assert project.name == "P"
    assert project.description == "d"
    assert project.local_path is None
    # repo.create passes last_accessed=None explicitly, but the ORM omits
    # None-valued attributes from the INSERT, so the column default fires.
    assert project.last_accessed is not None


def test_get_by_id_touches_last_accessed(db):
    project = make_project(db)
    old = datetime(2020, 1, 1)  # naive: SQLite DateTime columns return naive values
    project.last_accessed = old
    db.commit()

    fetched = ProjectRepository(db).get_by_id(project.id)

    assert fetched is not None
    assert fetched.last_accessed > old


def test_get_by_id_missing_returns_none(db):
    assert ProjectRepository(db).get_by_id(9999) is None


def test_get_all_orders_by_last_accessed_desc(db):
    older = make_project(db, name="Older")
    newer = make_project(db, name="Newer")
    older.last_accessed = datetime(2020, 1, 1)  # naive: SQLite returns naive
    newer.last_accessed = datetime(2021, 1, 1)
    db.commit()

    names = [p.name for p in ProjectRepository(db).get_all()]

    assert names[0] == "Newer"
    assert set(names) == {"Older", "Newer"}


def test_get_by_local_path(db):
    make_project(db, name="A")
    make_project(db, name="B", local_path="/data/a")
    found = ProjectRepository(db).get_by_local_path("/data/a")
    assert found is not None
    assert found.name == "B"
    assert ProjectRepository(db).get_by_local_path("/nope") is None


def test_update_renames_and_redescribes(db):
    project = make_project(db)
    updated = ProjectRepository(db).update(
        project.id, schemas.ProjectUpdate(name="Renamed", description="new text")
    )
    assert updated.name == "Renamed"
    assert updated.description == "new text"


def test_update_missing_returns_none(db):
    result = ProjectRepository(db).update(
        9999, schemas.ProjectUpdate(name="X")
    )
    assert result is None


def test_delete_cascades_documents_codes_segments_folders(db):
    project = make_project(db)
    doc = make_document(db, project)
    code = make_code(db, project)
    make_segment(db, doc, code)
    make_folder(db, project)

    assert ProjectRepository(db).delete(project.id) is True

    assert db.query(models.Project).count() == 0
    assert db.query(models.Document).count() == 0
    assert db.query(models.Code).count() == 0
    assert db.query(models.Segment).count() == 0
    assert db.query(models.DocumentFolder).count() == 0


def test_delete_leaves_memos_orphaned_current_behavior(db):
    """CURRENT BEHAVIOR (bug): memo relationships are viewonly, so deleting a
    project leaves its memos behind as orphan rows. Flip this test when memos
    get explicit cleanup."""
    project = make_project(db)
    code = make_code(db, project)
    doc = make_document(db, project)
    seg = make_segment(db, doc, code)
    make_memo(db, "project", project.id)
    make_memo(db, "code", code.id)
    make_memo(db, "segment", seg.id)

    ProjectRepository(db).delete(project.id)

    assert db.query(models.Memo).count() == 3


def test_delete_missing_returns_false(db):
    assert ProjectRepository(db).delete(9999) is False