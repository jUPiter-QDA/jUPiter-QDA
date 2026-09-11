import app.models as models
import app.schemas as schemas
from app.repositories import CodeRepository
from tests.helpers import make_document, make_memo, make_project, make_segment


def test_create_and_get_scoped_to_project(db, project):
    other_project = make_project(db)
    repo = CodeRepository(db)

    code = repo.create(project.id, schemas.CodeCreate(name="A", color="#111111"))

    assert code.project_id == project.id
    assert code.parent_id is None
    assert repo.get(project.id, code.id).name == "A"
    assert repo.get(other_project.id, code.id) is None


def test_get_by_project_ordered(db, project):
    repo = CodeRepository(db)
    first = repo.create(project.id, schemas.CodeCreate(name="first"))
    second = repo.create(project.id, schemas.CodeCreate(name="second"))

    assert [c.id for c in repo.get_by_project(project.id)] == [first.id, second.id]


def test_update_name_and_color_leaves_other_fields(db, project):
    repo = CodeRepository(db)
    code = repo.create(project.id, schemas.CodeCreate(name="A", color="#111111"))

    updated = repo.update(project.id, code.id, schemas.CodeUpdate(name="B"))

    assert updated.name == "B"
    assert updated.color == "#111111"

    repo.update(project.id, code.id, schemas.CodeUpdate(color="#222222"))
    db.expire_all()
    assert repo.get(project.id, code.id).color == "#222222"


def test_update_missing_returns_none(db, project):
    result = CodeRepository(db).update(project.id, 9999, schemas.CodeUpdate(name="X"))
    assert result is None


def test_reorder_updates_parent_and_order_index(db, project):
    repo = CodeRepository(db)
    parent = repo.create(project.id, schemas.CodeCreate(name="P"))
    child = repo.create(project.id, schemas.CodeCreate(name="C"))

    repo.reorder(project.id, [
        schemas.CodeReorderItem(id=child.id, parent_id=parent.id, order_index=5),
    ])

    fetched = repo.get(project.id, child.id)
    assert fetched.parent_id == parent.id
    assert fetched.order_index == 5


def test_delete_removes_entire_subtree(db, project):
    repo = CodeRepository(db)
    parent = repo.create(project.id, schemas.CodeCreate(name="P"))
    child = repo.create(project.id, schemas.CodeCreate(name="C", parent_id=parent.id))
    grandchild = repo.create(project.id, schemas.CodeCreate(name="G", parent_id=child.id))
    unrelated = repo.create(project.id, schemas.CodeCreate(name="U"))
    gone = {parent.id, child.id, grandchild.id}
    unrelated_id = unrelated.id

    assert repo.delete(project.id, parent.id) is True

    assert db.query(models.Code).filter(models.Code.id.in_(gone)).count() == 0
    assert repo.get(project.id, unrelated_id) is not None


def test_delete_cleans_subtree_segments_and_code_memos(db, project):
    """The manual BFS delete compensates for SQLite FK cascades never firing
    (no PRAGMA foreign_keys=ON): every code, segment, and code memo in the
    subtree must be removed by hand — while unrelated data survives."""
    repo = CodeRepository(db)
    doc = make_document(db, project)
    parent = repo.create(project.id, schemas.CodeCreate(name="P"))
    child = repo.create(project.id, schemas.CodeCreate(name="C", parent_id=parent.id))
    other = repo.create(project.id, schemas.CodeCreate(name="U"))

    seg_parent = make_segment(db, doc, parent)
    seg_child = make_segment(db, doc, child)
    seg_other = make_segment(db, doc, other)
    make_memo(db, "code", parent.id)
    make_memo(db, "code", child.id)
    memo_other = make_memo(db, "code", other.id)
    gone_seg_ids = {seg_parent.id, seg_child.id}
    surviving_seg_id = seg_other.id

    assert repo.delete(project.id, parent.id) is True

    remaining_seg_ids = {s.id for s in db.query(models.Segment).all()}
    assert gone_seg_ids.isdisjoint(remaining_seg_ids)
    assert surviving_seg_id in remaining_seg_ids

    assert {m.id for m in db.query(models.Memo).all()} == {memo_other.id}


def test_delete_missing_returns_false(db, project):
    assert CodeRepository(db).delete(project.id, 9999) is False


def test_merge_repoints_segments_children_memos_and_deletes_source(db, project):
    repo = CodeRepository(db)
    doc = make_document(db, project)
    source = repo.create(project.id, schemas.CodeCreate(name="S"))
    target = repo.create(project.id, schemas.CodeCreate(name="T"))
    child = repo.create(project.id, schemas.CodeCreate(name="C", parent_id=source.id))
    seg = make_segment(db, doc, source)
    memo = make_memo(db, "code", source.id)

    ok = repo.merge(project.id, source.id, target.id,
                    new_name="Merged", new_color="#00FF00")

    assert ok is True
    db.expire_all()
    assert repo.get(project.id, source.id) is None

    merged = repo.get(project.id, target.id)
    assert merged.name == "Merged"
    assert merged.color == "#00FF00"

    assert db.get(models.Segment, seg.id).code_id == target.id
    assert db.get(models.Code, child.id).parent_id == target.id
    assert db.get(models.Memo, memo.id).target_id == target.id


def test_merge_missing_code_returns_false(db, project):
    repo = CodeRepository(db)
    target = repo.create(project.id, schemas.CodeCreate(name="T"))
    assert repo.merge(project.id, 9999, target.id) is False
    assert repo.merge(project.id, target.id, 9999) is False