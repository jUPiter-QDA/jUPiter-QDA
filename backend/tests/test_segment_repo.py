import app.models as models
import app.schemas as schemas
from app.repositories import SegmentRepository
from tests.helpers import make_code, make_document, make_project, make_segment


def test_create(db, document, code):
    repo = SegmentRepository(db)
    segment = repo.create(schemas.SegmentCreate(
        document_id=document.id, code_id=code.id,
        start_char=0, end_char=5, content="hello",
    ))
    assert segment.id is not None
    assert segment.document_id == document.id
    assert segment.code_id == code.id


def test_get_by_document_filters_by_project_and_document(db, project, code):
    repo = SegmentRepository(db)
    other_project = make_project(db)
    other_doc = make_document(db, other_project)
    other_code = make_code(db, other_project)
    doc_a = make_document(db, project, filename="a.txt")
    doc_b = make_document(db, project, filename="b.txt")
    seg_a = make_segment(db, doc_a, code)
    seg_b = make_segment(db, doc_b, code)
    make_segment(db, other_doc, other_code)

    all_in_project = repo.get_by_document(project.id)
    assert {s.id for s in all_in_project} == {seg_a.id, seg_b.id}

    only_b = repo.get_by_document(project.id, doc_b.id)
    assert [s.id for s in only_b] == [seg_b.id]


def test_get_returns_scoped_segment(db, document, code, segment):
    repo = SegmentRepository(db)
    assert repo.get(document.project_id, segment.id).id == segment.id
    assert repo.get(document.project_id, 9999) is None


def test_get_cross_project_leak_current_behavior(db):
    """LATENT BUG (characterization): SegmentRepository.get filters on
    Code.project_id without joining Code, producing an implicit cross join.
    As long as the queried project has at least one code, ANY segment id
    matches — even one belonging to another project. A project with zero
    codes yields None even for valid segments."""
    repo = SegmentRepository(db)

    project_a = make_project(db)
    make_code(db, project_a)  # gives the cross join something to match

    project_b = make_project(db)
    doc_b = make_document(db, project_b)
    code_b = make_code(db, project_b)
    seg_b = make_segment(db, doc_b, code_b)

    project_no_codes = make_project(db)

    # leak: project A can fetch project B's segment
    assert repo.get(project_a.id, seg_b.id) is not None
    # and a valid segment is invisible to a project with no codes at all
    assert repo.get(project_no_codes.id, seg_b.id) is None


def test_update_moves_span_and_content(db, document, code, segment):
    repo = SegmentRepository(db)
    updated = repo.update(document.project_id, segment.id,
                          schemas.SegmentUpdate(start_char=6, end_char=11, content="world"))
    assert updated.start_char == 6
    assert updated.end_char == 11
    assert updated.content == "world"
    assert repo.update(document.project_id, 9999,
                       schemas.SegmentUpdate(start_char=0, end_char=1, content="x")) is None


def test_delete(db, document, segment):
    repo = SegmentRepository(db)
    assert repo.delete(document.project_id, segment.id) is True
    assert db.query(models.Segment).count() == 0
    assert repo.delete(document.project_id, segment.id) is False