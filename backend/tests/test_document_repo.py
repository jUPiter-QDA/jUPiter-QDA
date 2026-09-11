import app.models as models
import app.schemas as schemas
from app.repositories import DocumentRepository
from tests.helpers import make_folder, make_project


def test_metadata_serialization_roundtrip():
    serialize = DocumentRepository._serialize_metadata
    deserialize = DocumentRepository._deserialize_metadata

    assert serialize({"a": "b"}) == '{"a": "b"}'
    assert deserialize('{"a": "b"}') == {"a": "b"}

    assert deserialize(None) == {}
    assert deserialize("") == {}
    assert deserialize("not json {") == {}
    assert deserialize("[1, 2]") == {}          # valid JSON, but not a dict
    assert deserialize({"already": "dict"}) == {"already": "dict"}


def test_create_assigns_sequential_order_index(db, project):
    repo = DocumentRepository(db)
    assert repo.create(project.id, "a.txt", "x").order_index == 0
    assert repo.create(project.id, "b.txt", "x").order_index == 1
    assert repo.create(project.id, "c.txt", "x").order_index == 2


def test_get_by_project_custom_sort_orders_by_index_then_filename(db, project):
    repo = DocumentRepository(db)
    first = repo.create(project.id, "b.txt", "x")
    second = repo.create(project.id, "a.txt", "x")
    # custom order keeps insertion order first, filename breaks ties
    assert [d.filename for d in repo.get_by_project(project.id)] == ["b.txt", "a.txt"]

    repo.reorder(project.id, [
        schemas.DocumentReorderItem(id=second.id, order_index=0),
        schemas.DocumentReorderItem(id=first.id, order_index=1),
    ])
    assert [d.filename for d in repo.get_by_project(project.id)] == ["a.txt", "b.txt"]


def test_get_by_project_filename_sort(db, project):
    repo = DocumentRepository(db)
    repo.create(project.id, "beta.txt", "x")
    repo.create(project.id, "Alpha.txt", "x")

    names = [d.filename for d in repo.get_by_project(project.id, sort_by="filename")]
    assert names == ["Alpha.txt", "beta.txt"]  # case-insensitive

    names = [d.filename for d in repo.get_by_project(project.id, sort_by="filename", sort_order="desc")]
    assert names == ["beta.txt", "Alpha.txt"]


def test_get_by_project_scoped_to_project(db, project):
    other_project = make_project(db)
    repo = DocumentRepository(db)
    repo.create(project.id, "mine.txt", "x")
    repo.create(other_project.id, "theirs.txt", "x")

    assert [d.filename for d in repo.get_by_project(project.id)] == ["mine.txt"]


def test_get_by_project_metadata_filter(db, project):
    repo = DocumentRepository(db)
    repo.create(project.id, "one.txt", "x", metadata={"place": "lisbon"})
    repo.create(project.id, "two.txt", "x", metadata={"place": "porto"})
    repo.create(project.id, "three.txt", "x", metadata={"other": "v"})

    # key-exists filter (no value)
    names = [d.filename for d in repo.get_by_project(project.id, metadata_key="place")]
    assert set(names) == {"one.txt", "two.txt"}

    # key + value filter, whitespace-insensitive on both sides
    names = [d.filename for d in repo.get_by_project(
        project.id, metadata_key="place", metadata_value=" lisbon ")]
    assert names == ["one.txt"]

    # value mismatch excluded
    names = [d.filename for d in repo.get_by_project(
        project.id, metadata_key="place", metadata_value="nowhere")]
    assert names == []


def test_update_metadata_sanitizes_and_replaces(db, project):
    repo = DocumentRepository(db)
    doc = repo.create(project.id, "a.txt", "x", metadata={"keep": "old"})

    updated = repo.update_metadata(project.id, doc.id, {
        "  spaced  ": "  val  ",
        "": "dropped",       # empty key
        "none": None,        # None value
        "empty": "   ",      # blank value
    })

    # keys/values are stripped; empty keys and None/blank values dropped;
    # the whole dict REPLACES the old metadata rather than merging.
    assert DocumentRepository._deserialize_metadata(updated.metadata_json) == {"spaced": "val"}


def test_move_to_folder_and_back_to_none(db, project):
    repo = DocumentRepository(db)
    folder = make_folder(db, project)
    doc = repo.create(project.id, "a.txt", "x")

    assert repo.move_to_folder(project.id, doc.id, folder.id).folder_id == folder.id
    assert repo.move_to_folder(project.id, doc.id, None).folder_id is None


def test_get_by_filename_exclude_self(db, project):
    repo = DocumentRepository(db)
    doc = repo.create(project.id, "same.txt", "x")
    duplicate = repo.create(project.id, "same.txt", "y")

    assert repo.get_by_filename(project.id, "same.txt").id == doc.id
    found = repo.get_by_filename(project.id, "same.txt", exclude_document_id=doc.id)
    assert found.id == duplicate.id


def test_update_content_and_filename(db, project):
    repo = DocumentRepository(db)
    doc = repo.create(project.id, "a.txt", "old")

    assert repo.update_content(project.id, doc.id, "new").content == "new"
    assert repo.update_filename(project.id, doc.id, "b.txt").filename == "b.txt"
    assert repo.update_content(project.id, 9999, "x") is None
    assert repo.update_filename(project.id, 9999, "x.txt") is None


def test_delete(db, project):
    repo = DocumentRepository(db)
    doc = repo.create(project.id, "a.txt", "x")

    assert repo.delete(project.id, doc.id) is True
    assert db.query(models.Document).count() == 0
    assert repo.delete(project.id, doc.id) is False