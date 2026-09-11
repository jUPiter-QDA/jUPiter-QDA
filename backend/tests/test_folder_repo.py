import app.models as models
import app.schemas as schemas
from app.repositories import FolderRepository
from tests.helpers import make_document, make_folder


def test_create_and_get_by_project_ordered(db, project):
    repo = FolderRepository(db)
    first = repo.create(project.id, "First")
    second = repo.create(project.id, "Second")

    assert [f.name for f in repo.get_by_project(project.id)] == ["First", "Second"]

    repo.reorder(project.id, [
        schemas.FolderReorderItem(id=second.id, order_index=0),
        schemas.FolderReorderItem(id=first.id, order_index=1),
    ])
    assert [f.name for f in repo.get_by_project(project.id)] == ["Second", "First"]


def test_create_nested(db, project):
    repo = FolderRepository(db)
    parent = repo.create(project.id, "Parent")
    child = repo.create(project.id, "Child", parent_id=parent.id)
    assert child.parent_id == parent.id


def test_move_reparents_and_to_root(db, project):
    repo = FolderRepository(db)
    parent = repo.create(project.id, "Parent")
    child = repo.create(project.id, "Child")

    assert repo.move(project.id, child.id, parent.id).parent_id == parent.id
    assert repo.move(project.id, child.id, None).parent_id is None


def test_move_self_parent_is_noop(db, project):
    repo = FolderRepository(db)
    folder = repo.create(project.id, "Folder")

    result = repo.move(project.id, folder.id, folder.id)

    assert result is folder
    db.expire_all()
    assert db.get(models.DocumentFolder, folder.id).parent_id is None


def test_rename(db, project):
    repo = FolderRepository(db)
    folder = repo.create(project.id, "Old")
    assert repo.update_name(project.id, folder.id, "New").name == "New"
    assert repo.update_name(project.id, 9999, "X") is None


def test_delete(db, project):
    repo = FolderRepository(db)
    folder = repo.create(project.id, "Folder")
    assert repo.delete(project.id, folder.id) is True
    assert repo.delete(project.id, folder.id) is False


def test_delete_nulls_document_folder_ids(db, project):
    """The ORM nulls out documents' folder_id when the folder is deleted
    (children are loaded through the relationship during the delete flush)."""
    repo = FolderRepository(db)
    folder = make_folder(db, project)
    doc = make_document(db, project, folder=folder)

    repo.delete(project.id, folder.id)

    db.expire_all()
    assert db.get(models.Document, doc.id).folder_id is None