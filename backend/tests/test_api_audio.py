"""API tests for the audio router: the transcription endpoint with the
transcription service mocked at the router's binding seam."""
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock

from tests.helpers import make_document


def _mock_transcriber(monkeypatch, return_value="hello transcript"):
    mock = AsyncMock(return_value=return_value)
    fake_service = SimpleNamespace(transcribe_audio_file=mock)
    monkeypatch.setattr("app.routers.audio.transcribe_service", fake_service)
    return mock


def test_transcribe_unsupported_extension_400(client, project):
    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           files={"file": ("notes.txt", b"x", "text/plain")})
    assert response.status_code == 400
    assert response.json()["detail"] == "Unsupported audio format. Please provide a standard audio container."


def test_transcribe_creates_transcript_document(client, project, monkeypatch):
    _mock_transcriber(monkeypatch, return_value="hello transcript")

    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           files={"file": ("clip.wav", b"RIFF....", "audio/wav")})

    assert response.status_code == 200
    body = response.json()
    assert body["filename"] == "Transcript - clip.txt"
    assert body["content"] == "hello transcript"
    assert body["type"] == "text"

    documents = client.get(f"/projects/{project.id}/documents/").json()
    assert [d["filename"] for d in documents] == ["Transcript - clip.txt"]


def test_transcribe_language_auto_becomes_none(client, project, monkeypatch):
    mock = _mock_transcriber(monkeypatch)

    client.post(f"/projects/{project.id}/audio/transcribe",
                files={"file": ("clip.mp3", b"x", "audio/mpeg")})

    mock.assert_awaited_once()
    assert mock.await_args.kwargs["language"] is None


def test_transcribe_explicit_language_passed_through(client, project, monkeypatch):
    mock = _mock_transcriber(monkeypatch)

    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           params={"language": "pt"},
                           files={"file": ("clip.mp3", b"x", "audio/mpeg")})

    assert response.status_code == 200
    assert mock.await_args.kwargs["language"] == "pt"


def test_transcribe_filename_collision_gets_timestamp_suffix(client, db, project, monkeypatch):
    make_document(db, project, filename="Transcript - clip.txt", content="previous")
    _mock_transcriber(monkeypatch, return_value="second pass")

    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           files={"file": ("clip.wav", b"x", "audio/wav")})

    assert response.status_code == 200
    new_name = response.json()["filename"]
    assert new_name != "Transcript - clip.txt"
    assert re.fullmatch(r"Transcript - clip_\d+\.txt", new_name)

    documents = client.get(f"/projects/{project.id}/documents/").json()
    assert [d["filename"] for d in documents] == ["Transcript - clip.txt", new_name]


def test_transcribe_empty_result_uses_placeholder(client, project, monkeypatch):
    _mock_transcriber(monkeypatch, return_value="")

    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           files={"file": ("clip.wav", b"x", "audio/wav")})

    assert response.status_code == 200
    assert response.json()["content"] == "[Empty or un-decodable local audio captured]"


def test_transcribe_service_failure_500(client, project, monkeypatch):
    failing = SimpleNamespace(transcribe_audio_file=AsyncMock(side_effect=RuntimeError("boom")))
    monkeypatch.setattr("app.routers.audio.transcribe_service", failing)

    response = client.post(f"/projects/{project.id}/audio/transcribe",
                           files={"file": ("clip.wav", b"x", "audio/wav")})

    assert response.status_code == 500
    assert response.json()["detail"] == "Local offline transcription failed: boom"