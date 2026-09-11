"""API tests for the folders router: list, create, reorder, move, rename, delete.

Note the trailing-slash paths: list and create are registered as "/".
"""
from tests.helpers import make_document, make_folder


def test_list_folders(client, db, project):
    make_folder(db, project, name="First")
    make_folder(db, project, name="Second")

    response = client.get(f"/projects/{project.id}/folders/")

    assert response.status_code == 200
    body = response.json()
    assert [f["name"] for f in body] == ["First", "Second"]
    assert all(f["parent_id"] is None and f["order_index"] == 0 for f in body)
    assert list(body[0]) == ["id", "name", "parent_id", "order_index"]


def test_create_folder_root_and_nested(client, project):
    parent = client.post(f"/projects/{project.id}/folders/", json={"name": "Parent"})
    assert parent.status_code == 200

    child = client.post(f"/projects/{project.id}/folders/",
                        json={"name": "Child", "parent_id": parent.json()["id"]})
    assert child.status_code == 200

    listed = client.get(f"/projects/{project.id}/folders/").json()
    by_name = {f["name"]: f for f in listed}
    assert by_name["Child"]["parent_id"] == by_name["Parent"]["id"]


def test_reorder_folders(client, db, project):
    first = make_folder(db, project, name="First")
    second = make_folder(db, project, name="Second")

    response = client.put(f"/projects/{project.id}/folders/reorder", json={
        "folders": [{"id": second.id, "order_index": 0}, {"id": first.id, "order_index": 1}],
    })

    assert response.json() == {"message": "Folders reordered"}
    assert [f["name"] for f in client.get(f"/projects/{project.id}/folders/").json()] == ["Second", "First"]


def test_move_folder(client, db, project):
    parent = make_folder(db, project, name="Parent")
    child = make_folder(db, project, name="Child")

    into = client.put(f"/projects/{project.id}/folders/{child.id}/move",
                      json={"parent_id": parent.id})
    assert into.status_code == 200
    assert into.json() == {"message": "Folder moved successfully",
                           "folder_id": child.id, "parent_id": parent.id}

    out = client.put(f"/projects/{project.id}/folders/{child.id}/move", json={"parent_id": None})
    assert out.json()["parent_id"] is None

    assert client.put(f"/projects/{project.id}/folders/9999/move",
                      json={"parent_id": None}).status_code == 404


def test_move_folder_self_parent_is_noop(client, db, project):
    folder = make_folder(db, project, name="F")

    response = client.put(f"/projects/{project.id}/folders/{folder.id}/move",
                          json={"parent_id": folder.id})

    assert response.status_code == 200
    assert response.json()["parent_id"] is None


def test_rename_folder(client, db, project):
    folder = make_folder(db, project, name="Old")

    response = client.put(f"/projects/{project.id}/folders/{folder.id}",
                          json={"name": "New"})

    assert response.status_code == 200
    assert response.json() == {"message": "Folder renamed successfully",
                               "folder_id": folder.id, "new_name": "New"}
    assert client.put(f"/projects/{project.id}/folders/9999",
                      json={"name": "X"}).status_code == 404


def test_delete_folder_nulls_document_folder_ids(client, db, project):
    folder = make_folder(db, project, name="F")
    doc = make_document(db, project, folder=folder)

    response = client.delete(f"/projects/{project.id}/folders/{folder.id}")

    assert response.status_code == 200
    assert response.json() == {"message": "Folder deleted"}
    listed = client.get(f"/projects/{project.id}/folders/").json()
    assert listed == []
    assert client.get(f"/projects/{project.id}/documents/{doc.id}").json()["folder_id"] is None


def test_delete_missing_folder_still_reports_success(client, project):
    """CURRENT BEHAVIOR (bug): the delete route ignores the repository's
    return value, so deleting a nonexistent folder returns 200 instead of 404.
    Flip this test when the route checks the result."""
    response = client.delete(f"/projects/{project.id}/folders/9999")
    assert response.status_code == 200
    assert response.json() == {"message": "Folder deleted"}