"""API tests for the documents router: list/get, uploads, text-doc creation,
file serving, move/rename/reorder/content/metadata updates, delete behavior.

Note the trailing-slash paths: list/upload/reorder are registered as "/".
"""
import io
import json

import docx as python_docx

import app.models as models
from tests.helpers import make_code, make_document, make_folder, make_memo, make_project, make_segment


def test_list_documents_with_metadata_filter(client, db, project):
    make_document(db, project, filename="a.txt", metadata_json='{"interviewee": "Dana"}')
    make_document(db, project, filename="b.txt", metadata_json='{"interviewee": "Luis"}')
    make_document(db, project, filename="c.txt", metadata_json='{}')

    listed = client.get(f"/projects/{project.id}/documents/").json()
    assert [d["filename"] for d in listed] == ["a.txt", "b.txt", "c.txt"]
    assert listed[0]["metadata"] == {"interviewee": "Dana"}

    filtered = client.get(f"/projects/{project.id}/documents/",
                          params={"metadata_key": "interviewee", "metadata_value": " Dana "})
    assert [d["filename"] for d in filtered.json()] == ["a.txt"]  # value match is whitespace-insensitive

    # the match is case-sensitive, though: "dana" does not match "Dana"
    case_sensitive = client.get(f"/projects/{project.id}/documents/",
                                params={"metadata_key": "interviewee", "metadata_value": "dana"})
    assert [d["filename"] for d in case_sensitive.json()] == []

    key_only = client.get(f"/projects/{project.id}/documents/",
                          params={"metadata_key": "interviewee"})
    assert [d["filename"] for d in key_only.json()] == ["a.txt", "b.txt"]


def test_get_document_includes_content(client, project, document):
    response = client.get(f"/projects/{project.id}/documents/{document.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "doc.txt"
    assert body["content"] == "alpha beta gamma alpha"
    assert body["metadata"] == {}
    assert client.get(f"/projects/{project.id}/documents/9999").status_code == 404


def test_upload_text_file_normalizes_crlf(client, project):
    response = client.post(f"/projects/{project.id}/documents/", files={
        "files": ("notes.txt", b"line1\r\nline2\r\nline3", "text/plain"),
    })

    assert response.status_code == 200
    assert response.json() == {"message": "Uploaded 1 files!", "successful": ["notes.txt"], "failed": []}

    listed = client.get(f"/projects/{project.id}/documents/").json()
    assert len(listed) == 1
    assert listed[0]["type"] == "txt"

    fetched = client.get(f"/projects/{project.id}/documents/{listed[0]['id']}").json()
    assert fetched["content"] == "line1\nline2\nline3"


def test_upload_docx_extracts_paragraph_text(client, project):
    buffer = io.BytesIO()
    source = python_docx.Document()
    source.add_paragraph("First paragraph")
    source.add_paragraph("Second paragraph")
    source.save(buffer)

    response = client.post(f"/projects/{project.id}/documents/", files={
        "files": ("interview.docx", buffer.getvalue(),
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    })
    assert response.status_code == 200
    assert response.json()["successful"] == ["interview.docx"]

    listed = client.get(f"/projects/{project.id}/documents/").json()
    assert listed[0]["type"] == "docx"
    fetched = client.get(f"/projects/{project.id}/documents/{listed[0]['id']}").json()
    assert fetched["content"] == "First paragraph\nSecond paragraph"


def test_upload_unsupported_extension_reports_failed(client, project):
    response = client.post(f"/projects/{project.id}/documents/", files={
        "files": ("archive.zip", b"PK\x03\x04", "application/zip"),
    })

    assert response.status_code == 200
    body = response.json()
    assert body["successful"] == []
    assert body["failed"] == [{"filename": "archive.zip", "reason": "Unsupported file type"}]
    assert client.get(f"/projects/{project.id}/documents/").json() == []


def test_upload_writes_physical_file_when_local_path_set(client, tmp_path):
    project_id = client.post("/projects", json={"name": "WS", "local_path": str(tmp_path)}).json()["id"]
    ws_dir = tmp_path / "WS"

    response = client.post(f"/projects/{project_id}/documents/", files={
        "files": ("disk.txt", b"on-disk content", "text/plain"),
    })

    assert response.status_code == 200
    assert (ws_dir / "disk.txt").read_bytes() == b"on-disk content"


def test_upload_project_404(client):
    response = client.post("/projects/9999/documents/", files={
        "files": ("notes.txt", b"x", "text/plain"),
    })
    assert response.status_code == 404


def test_create_text_document_appends_extension(client, tmp_path):
    project_id = client.post("/projects", json={"name": "WS", "local_path": str(tmp_path)}).json()["id"]

    response = client.post(f"/projects/{project_id}/documents/create",
                           json={"name": "notes", "content": "typed text"})

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "notes.txt"
    assert body["type"] == "text"
    assert body["metadata"] == {}
    assert (tmp_path / "WS" / "notes.txt").read_text() == "typed text"

    fetched = client.get(f"/projects/{project_id}/documents/{body['id']}").json()
    assert fetched["content"] == "typed text"
    assert client.post("/projects/9999/documents/create",
                       json={"name": "x", "content": "y"}).status_code == 404


def test_get_document_file_serves_stored_file(client, db, tmp_path):
    project_id = client.post("/projects", json={"name": "WS", "local_path": str(tmp_path)}).json()["id"]

    # seed document rows on the API-created project (db fixture shares the same engine);
    # the API-stored local_path is the joined dir tmp_path/"WS"
    project_row = db.get(models.Project, project_id)
    doc = make_document(db, project_row, filename="doc.txt", content="stored")
    pdf_row = make_document(db, project_row, filename="scan.pdf", content="pdf")
    (tmp_path / "WS" / "doc.txt").write_text("stored")
    (tmp_path / "WS" / "scan.pdf").write_bytes(b"%PDF-1.4 fake")

    response = client.get(f"/projects/{project_id}/documents/{doc.id}/file")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/octet-stream")
    assert response.headers["content-disposition"] == 'attachment; filename="doc.txt"'
    assert response.content == b"stored"

    pdf_response = client.get(f"/projects/{project_id}/documents/{pdf_row.id}/file")
    assert pdf_response.headers["content-type"].startswith("application/pdf")
    assert pdf_response.headers["content-disposition"] == 'inline; filename="scan.pdf"'


def test_get_document_file_404s(client, db, project, document):
    # project has no local_path
    response = client.get(f"/projects/{project.id}/documents/{document.id}/file")
    assert response.status_code == 404
    assert response.json()["detail"] == "No stored file found for this document"

    assert client.get(f"/projects/{project.id}/documents/9999/file").status_code == 404


def test_get_document_file_missing_on_disk_404(client, tmp_path, db):
    project_id = client.post("/projects", json={"name": "WS", "local_path": str(tmp_path)}).json()["id"]
    project_row = db.get(models.Project, project_id)
    doc = make_document(db, project_row, filename="gone.txt", content="x")
    # no file written under tmp_path/"WS"

    response = client.get(f"/projects/{project_id}/documents/{doc.id}/file")
    assert response.status_code == 404
    assert response.json()["detail"] == "Stored file not found"


def test_reorder_documents(client, db, project):
    first = make_document(db, project, filename="a.txt", order_index=0)
    second = make_document(db, project, filename="b.txt", order_index=1)

    response = client.put(f"/projects/{project.id}/documents/reorder", json={
        "documents": [{"id": first.id, "order_index": 1}, {"id": second.id, "order_index": 0}],
    })

    assert response.json() == {"message": "Documents reordered"}
    names = [d["filename"] for d in client.get(f"/projects/{project.id}/documents/").json()]
    assert names == ["b.txt", "a.txt"]


def test_move_document_between_folder_and_root(client, db, project, document):
    folder = make_folder(db, project, name="F")

    into = client.put(f"/projects/{project.id}/documents/{document.id}/move",
                      params={"folder_id": str(folder.id)})
    assert into.status_code == 200
    assert into.json() == {"message": "Moved successfully"}
    assert client.get(f"/projects/{project.id}/documents/{document.id}").json()["folder_id"] == folder.id

    for root_form in ("", "null"):
        out = client.put(f"/projects/{project.id}/documents/{document.id}/move",
                         params={"folder_id": root_form})
        assert out.status_code == 200
        assert client.get(f"/projects/{project.id}/documents/{document.id}").json()["folder_id"] is None

    bad = client.put(f"/projects/{project.id}/documents/{document.id}/move",
                     params={"folder_id": "abc"})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "Invalid folder ID format"

    assert client.put(f"/projects/{project.id}/documents/9999/move",
                      params={"folder_id": "1"}).status_code == 404


def test_update_document_content(client, project, document):
    response = client.put(f"/projects/{project.id}/documents/{document.id}/content",
                          json={"content": "rewritten"})
    assert response.json() == {"message": "Document updated successfully"}
    assert client.get(f"/projects/{project.id}/documents/{document.id}").json()["content"] == "rewritten"
    assert client.put(f"/projects/{project.id}/documents/9999/content",
                      json={"content": "x"}).status_code == 404


def test_update_document_metadata_sanitizes_and_replaces(client, project, document):
    response = client.put(f"/projects/{project.id}/documents/{document.id}/metadata", json={
        "metadata": {"interviewee": "  Dana  ", "empty": "", "blank": None},
    })

    assert response.status_code == 200
    assert response.json()["metadata"] == {"interviewee": "Dana"}   # sanitized, blanks dropped

    response = client.put(f"/projects/{project.id}/documents/{document.id}/metadata", json={
        "metadata": {"city": "Lisbon"},
    })
    assert response.json()["metadata"] == {"city": "Lisbon"}        # replaces, does not merge
    assert client.put(f"/projects/{project.id}/documents/9999/metadata",
                      json={"metadata": {}}).status_code == 404


def test_rename_document(client, db, project):
    doc = make_document(db, project, filename="report.txt", content="x")
    other = make_document(db, project, filename="taken.txt", content="x")

    # extension is kept when the new name lacks it
    response = client.put(f"/projects/{project.id}/documents/{doc.id}/rename",
                          json={"filename": "final"})
    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "final.txt"
    assert set(body) == {"id", "filename", "type", "created_at", "folder_id"}

    # a different document already uses the target name
    conflict = client.put(f"/projects/{project.id}/documents/{doc.id}/rename",
                          json={"filename": "taken.txt"})
    assert conflict.status_code == 409

    assert client.put(f"/projects/{project.id}/documents/{doc.id}/rename",
                      json={"filename": "   "}).status_code == 400
    assert client.put(f"/projects/{project.id}/documents/9999/rename",
                      json={"filename": "x"}).status_code == 404


def test_delete_document_removes_segments_but_orphans_segment_memos(client, db, project, code):
    """CURRENT BEHAVIOR: the Document.segments relationship carries
    cascade="all, delete-orphan", so deleting a document removes its segments
    in Python (not via SQL cascade). Segment memo relationships are viewonly,
    however, so the memo rows survive as orphans — and they silently vanish
    from the memos list. Flip the DB-survival assertion when memos get
    explicit cleanup."""
    doc = make_document(db, project, filename="coded.txt", content="alpha beta")
    seg = make_segment(db, doc, code, 0, 5, "alpha")
    memo = make_memo(db, "segment", seg.id, text="segment memo")
    seg_id, memo_id = seg.id, memo.id

    response = client.delete(f"/projects/{project.id}/documents/{doc.id}")

    assert response.status_code == 200
    assert response.json() == {"message": "Document deleted successfully"}
    assert client.get(f"/projects/{project.id}/documents/").json() == []
    assert client.delete(f"/projects/{project.id}/documents/{doc.id}").status_code == 404

    db.expire_all()
    assert db.query(models.Segment).filter(models.Segment.id == seg_id).count() == 0
    assert db.query(models.Memo).filter(models.Memo.id == memo_id).count() == 1   # orphaned row
    assert client.get(f"/projects/{project.id}/memos").json() == []               # but not listed