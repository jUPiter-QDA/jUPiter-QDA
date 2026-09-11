"""API tests for the segments router: CRUD, segments-by-code with context, csv export.

The segments router has an empty prefix, so every path is spelled out in full.
GET /segments/{missing_id} returns 500 (response_model + None), not 404 — the
missing-id contract is covered at the repo layer, not here.
"""
import pytest

from tests.helpers import make_code, make_document, make_segment


def test_create_and_list_segments(client, project, code, document):
    created = client.post(f"/projects/{project.id}/segments", json={
        "document_id": document.id, "code_id": code.id,
        "start_char": 0, "end_char": 5, "content": "alpha",
    })
    assert created.status_code == 200
    body = created.json()
    assert body["id"] is not None
    assert body["document_id"] == document.id
    assert body["code_id"] == code.id
    assert body["content"] == "alpha"

    listed = client.get(f"/projects/{project.id}/segments")
    assert listed.status_code == 200
    assert [s["id"] for s in listed.json()] == [body["id"]]

    filtered = client.get(f"/projects/{project.id}/segments",
                          params={"document_id": document.id})
    assert [s["id"] for s in filtered.json()] == [body["id"]]


def test_get_segment_by_id(client, project, code, document):
    seg = client.post(f"/projects/{project.id}/segments", json={
        "document_id": document.id, "code_id": code.id,
        "start_char": 6, "end_char": 10, "content": "beta",
    }).json()

    response = client.get(f"/projects/{project.id}/segments/{seg['id']}")

    assert response.status_code == 200
    assert response.json()["content"] == "beta"


def test_update_segment_and_404(client, project, code, document):
    seg = client.post(f"/projects/{project.id}/segments", json={
        "document_id": document.id, "code_id": code.id,
        "start_char": 0, "end_char": 5, "content": "alpha",
    }).json()

    response = client.put(f"/projects/{project.id}/segments/{seg['id']}", json={
        "start_char": 6, "end_char": 10, "content": "beta",
    })

    assert response.status_code == 200
    assert response.json() == {"message": "Segment updated"}
    fetched = client.get(f"/projects/{project.id}/segments/{seg['id']}").json()
    assert (fetched["start_char"], fetched["end_char"], fetched["content"]) == (6, 10, "beta")

    assert client.put(f"/projects/{project.id}/segments/9999", json={
        "start_char": 0, "end_char": 1, "content": "x",
    }).status_code == 404


def test_delete_segment_and_404(client, project, code, document):
    seg = client.post(f"/projects/{project.id}/segments", json={
        "document_id": document.id, "code_id": code.id,
        "start_char": 0, "end_char": 5, "content": "alpha",
    }).json()

    response = client.delete(f"/projects/{project.id}/segments/{seg['id']}")

    assert response.status_code == 200
    assert response.json() == {"message": "Segment deleted successfully"}
    assert client.get(f"/projects/{project.id}/segments").json() == []
    assert client.delete(f"/projects/{project.id}/segments/9999").status_code == 404


def test_segments_by_code_include_children_and_context(client, db, project):
    content = "A" * 50 + "TARGET" + "B" * 50
    doc = make_document(db, project, filename="long.txt", content=content)
    parent = make_code(db, project, name="Parent")
    child = make_code(db, project, name="Child", parent=parent)

    seg_parent = make_segment(db, doc, parent, 50, 56, "TARGET")
    make_segment(db, doc, child, 50, 56, "TARGET")

    response = client.get(f"/projects/{project.id}/codes/{parent.id}/segments",
                          params={"include_children": True})

    assert response.status_code == 200
    results = response.json()
    assert {r["code_name"] for r in results} == {"Parent", "Child"}

    first = next(r for r in results if r["id"] == seg_parent.id)
    assert first["document_filename"] == "long.txt"
    assert first["position_label"] == "long.txt, pos: 50-56"
    assert first["context"] == content          # ±200 chars covers the whole doc
    assert first["highlight_start"] == 50
    assert first["highlight_end"] == 56
    assert first["code_color"] == "#112233"

    without_children = client.get(
        f"/projects/{project.id}/codes/{parent.id}/segments").json()
    assert [r["code_name"] for r in without_children] == ["Parent"]


@pytest.mark.xfail(strict=True,
                   reason="csv_service accesses project.segments, which does not exist on the Project model (bug)")
def test_export_segments_csv(client, project):
    response = client.get(f"/projects/{project.id}/segments/export/csv")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")