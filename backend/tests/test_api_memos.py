"""API tests for the memos router: polymorphic target_name resolution and CRUD."""
import app.models as models
from tests.helpers import make_memo, make_segment


def test_list_memos_resolves_target_names(client, db, project, code, document, segment):
    make_memo(db, "project", project.id, text="about the project")
    make_memo(db, "code", code.id, text="about the code")
    make_memo(db, "segment", segment.id, text="about the segment")

    response = client.get(f"/projects/{project.id}/memos")

    assert response.status_code == 200
    by_type = {m["target_type"]: m for m in response.json()}
    assert by_type["project"]["target_name"] == "Test Project"
    assert by_type["project"]["text"] == "about the project"
    assert by_type["code"]["target_name"] == "Theme"
    assert by_type["segment"]["target_name"] == '"alpha"'       # segment content, quoted
    assert by_type["segment"]["target_id"] == segment.id


def test_segment_memo_target_name_truncates_long_content(client, db, project, code, document):
    seg = make_segment(db, document, code, 0, 40, "x" * 40)
    make_memo(db, "segment", seg.id)

    memos = client.get(f"/projects/{project.id}/memos").json()

    assert [m["target_name"] for m in memos] == ['"' + "x" * 30 + '..."']


def test_list_memos_for_missing_project_uses_fallback_name(client, db):
    make_memo(db, "project", 9999, text="orphan project memo")

    response = client.get("/projects/9999/memos")

    assert response.status_code == 200
    assert [m["target_name"] for m in response.json()] == ["Project 9999"]


def test_deleted_code_cleans_its_memos(client, db, project, code, document):
    """Deleting a code must remove its memos even though the memo relationship
    is viewonly (SQLite FK cascades never fire): the repository's manual
    subtree delete handles them explicitly."""
    make_segment(db, document, code)
    make_memo(db, "code", code.id, text="memo on the doomed code")

    assert client.delete(f"/projects/{project.id}/codes/{code.id}").status_code == 204

    assert client.get(f"/projects/{project.id}/memos").json() == []
    assert db.query(models.Memo).filter(models.Memo.target_type == "code").count() == 0


def test_create_memo(client, project):
    response = client.post("/memos", json={
        "text": "a note", "target_type": "project", "target_id": project.id,
    })

    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "a note"
    assert body["target_type"] == "project"
    assert body["target_id"] == project.id
    assert body["id"] is not None
    assert body["created_at"] is not None
    assert body["target_name"] is None


def test_update_memo_and_404(client, project):
    memo_id = client.post("/memos", json={
        "text": "old", "target_type": "project", "target_id": project.id,
    }).json()["id"]

    response = client.put(f"/memos/{memo_id}", json={"text": "new"})
    assert response.status_code == 200
    assert response.json()["text"] == "new"

    assert client.put("/memos/9999", json={"text": "x"}).status_code == 404


def test_delete_memo_and_404(client, project):
    memo_id = client.post("/memos", json={
        "text": "doomed", "target_type": "project", "target_id": project.id,
    }).json()["id"]

    response = client.delete(f"/memos/{memo_id}")

    assert response.status_code == 200
    assert response.json() == {"message": "Memo deleted successfully"}
    assert client.get(f"/projects/{project.id}/memos").json() == []
    assert client.delete(f"/memos/{memo_id}").status_code == 404