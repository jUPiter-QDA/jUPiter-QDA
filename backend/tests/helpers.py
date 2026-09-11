"""Plain model factories shared by the test modules.

Not fixtures — plain functions taking the test's `db` session, so tests that
need extra entities beyond the standard fixtures can seed directly.
"""
from datetime import datetime, timezone

import app.models as models


def make_project(db, name="Test Project", description="seed",
                 local_path=None, last_accessed=None):
    """`last_accessed` defaults to None, matching ProjectRepository.create."""
    project = models.Project(name=name, description=description,
                             local_path=local_path,
                             last_accessed=last_accessed)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def make_document(db, project, filename="doc.txt", content="hello world",
                  type="text", order_index=0, metadata_json="{}",
                  folder=None):
    document = models.Document(
        project_id=project.id,
        filename=filename,
        content=content,
        type=type,
        order_index=order_index,
        metadata_json=metadata_json,
        folder_id=folder.id if folder else None,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def make_code(db, project, name="Theme", color="#112233", parent=None,
              order_index=0):
    code = models.Code(name=name, color=color, project_id=project.id,
                       parent_id=parent.id if parent else None,
                       order_index=order_index)
    db.add(code)
    db.commit()
    db.refresh(code)
    return code


def make_segment(db, document, code, start_char=0, end_char=5,
                  content=None):
    segment = models.Segment(
        start_char=start_char,
        end_char=end_char,
        content=content if content is not None
        else document.content[start_char:end_char],
        document_id=document.id,
        code_id=code.id,
    )
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return segment


def make_folder(db, project, name="Folder", parent=None, order_index=0):
    folder = models.DocumentFolder(
        name=name,
        project_id=project.id,
        parent_id=parent.id if parent else None,
        order_index=order_index,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder


def make_memo(db, target_type, target_id, text="memo text"):
    memo = models.Memo(text=text, target_type=target_type, target_id=target_id)
    db.add(memo)
    db.commit()
    db.refresh(memo)
    return memo


def build_qdpx_zip(project_name="Imported Project",
                  description="imported description"):
    """A minimal but REFI-shaped .qdpx package as raw bytes.

    Contents: parent code "Economy" with child "Jobs" (the parent carries a
    code memo), one text source "interview.txt" (content in
    Sources/doc-1.txt) with one coded selection of chars 0-5 on "Economy"
    (carrying a segment memo), and a project-level memo referenced from the
    project root. GUIDs are lowercase because the importer lowercases some
    look up keys but not others.
    """
    import io
    import xml.etree.ElementTree as ET
    import zipfile

    NS = "urn:QDA-XML:project:1.0"
    ET.register_namespace("", NS)
    q = lambda tag: f"{{{NS}}}{tag}"

    root = ET.Element(q("Project"), {
        "name": project_name, "origin": "tests", "creatingUserGUID": "user-1",
    })
    desc = ET.SubElement(root, q("Description"))
    desc.text = description
    users = ET.SubElement(root, q("Users"))
    ET.SubElement(users, q("User"), {"guid": "user-1", "name": "Test User"})

    notes = ET.SubElement(root, q("Notes"))

    def note(guid, text):
        note_elem = ET.SubElement(notes, q("Note"), {
            "guid": guid, "name": text, "creatingUser": "user-1",
        })
        content = ET.SubElement(note_elem, q("PlainTextContent"))
        content.text = text

    note("note-project", "project level memo")
    note("note-code", "code level memo")
    note("note-segment", "segment level memo")

    codebook = ET.SubElement(root, q("CodeBook"))
    codes_elem = ET.SubElement(codebook, q("Codes"))
    parent_code = ET.SubElement(codes_elem, q("Code"), {
        "guid": "code-parent", "name": "Economy", "color": "#112233",
    })
    ET.SubElement(parent_code, q("NoteRef"), {"targetGUID": "note-code"})
    ET.SubElement(parent_code, q("Code"), {
        "guid": "code-child", "name": "Jobs", "color": "#445566",
    })

    sources = ET.SubElement(root, q("Sources"))
    source = ET.SubElement(sources, q("TextSource"), {
        "guid": "doc-1", "name": "interview.txt",
        "plainTextPath": "internal://doc-1.txt", "creatingUser": "user-1",
    })
    selection = ET.SubElement(source, q("PlainTextSelection"), {
        "guid": "sel-1", "name": "Selection-1",
        "startPosition": "0", "endPosition": "5", "creatingUser": "user-1",
    })
    ET.SubElement(selection, q("NoteRef"), {"targetGUID": "note-segment"})
    coding = ET.SubElement(selection, q("Coding"), {
        "guid": "coding-1", "creatingUser": "user-1",
    })
    ET.SubElement(coding, q("CodeRef"), {"targetGUID": "code-parent"})

    ET.SubElement(root, q("NoteRef"), {"targetGUID": "note-project"})

    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project.qde", xml_bytes)
        z.writestr("Sources/doc-1.txt", "alpha beta gamma")
    return buffer.getvalue()