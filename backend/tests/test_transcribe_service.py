"""Unit tests for the transcription service: real singleton logic with the
expensive seams mocked — a fake Whisper model seeded into `_model` (the `model`
property short-circuits on a non-None `_model`, so no model ever downloads),
`subprocess.run` patched at the module attribute (the function-local
`import subprocess` still resolves to the patched module), and `monkeypatch.chdir`
so the temp-file/chunk dance happens inside pytest's tmp_path."""
import asyncio
import io
import os
from types import SimpleNamespace

from fastapi import UploadFile

from app.services.transcribe_service import TranscribeService


class FakeModel:
    """Records calls; returns one text per chunk, keyed by filename."""

    def __init__(self):
        self.calls = []

    def transcribe(self, chunk_path, language=None, **kwargs):
        self.calls.append((os.path.basename(chunk_path), language))
        text = f"transcript of {os.path.basename(chunk_path)}"
        return ([SimpleNamespace(text=text)], "info")


def _fake_ffmpeg_noop(cmd, **kwargs):
    """ffmpeg 'runs' but produces no chunk files (as with non-splittable input)."""


def _fake_ffmpeg_two_chunks(cmd, **kwargs):
    """ffmpeg 'runs' and produces the first two chunk files of the pattern."""
    pattern = cmd[-1]                      # chunk_<timestamp>_%03d.wav
    prefix = pattern.replace("_%03d.wav", "")
    for index in ("000", "001"):
        with open(f"{prefix}_{index}.wav", "wb") as f:
            f.write(b"chunk")


def _service(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    service = TranscribeService()
    service._model = FakeModel()           # property returns it; WhisperModel never loads
    return service


def _upload(name="clip.wav", data=b"audio bytes"):
    return UploadFile(io.BytesIO(data), filename=name)


def test_no_chunks_falls_back_to_whole_file_and_cleans_up(monkeypatch, tmp_path):
    service = _service(monkeypatch, tmp_path)
    monkeypatch.setattr("subprocess.run", _fake_ffmpeg_noop)

    result = asyncio.run(service.transcribe_audio_file(_upload(), language="pt"))

    # no chunks existed, so the temp file itself was transcribed...
    assert result == "transcript of temp_transcription_clip.wav"
    assert service._model.calls == [("temp_transcription_clip.wav", "pt")]
    # ...and both the temp file and any chunk leftovers are gone
    assert os.listdir(tmp_path) == []


def test_multiple_chunks_are_joined_in_order_and_cleaned_up(monkeypatch, tmp_path):
    service = _service(monkeypatch, tmp_path)
    monkeypatch.setattr("subprocess.run", _fake_ffmpeg_two_chunks)

    result = asyncio.run(service.transcribe_audio_file(_upload()))

    # the model records calls in *completion* order (parallel threads), but the
    # service joins future results in *submission* order — which the comparison
    # against sorted() names pins (chunk _000 before _001).
    chunk_names = [name for name, _ in service._model.calls]
    assert len(chunk_names) == 2
    assert result == " ".join(f"transcript of {name}" for name in sorted(chunk_names))
    assert os.listdir(tmp_path) == []                  # chunks and temp file all removed


def test_transcribe_chunk_missing_file_returns_empty_and_does_not_raise(monkeypatch, tmp_path):
    service = _service(monkeypatch, tmp_path)

    assert service._transcribe_chunk(str(tmp_path / "nonexistent.wav"), "en") == ""
    assert service._model.calls == []


def test_transcribe_chunk_returns_text_and_deletes_chunk(monkeypatch, tmp_path):
    service = _service(monkeypatch, tmp_path)
    chunk = tmp_path / "chunk_000.wav"
    chunk.write_bytes(b"data")

    result = service._transcribe_chunk(str(chunk), "en")

    assert result == "transcript of chunk_000.wav"
    assert service._model.calls == [("chunk_000.wav", "en")]
    assert not chunk.exists()          # deleted the moment it finished reading


def test_transcribe_chunk_cleans_up_even_when_model_fails(monkeypatch, tmp_path):
    service = _service(monkeypatch, tmp_path)
    chunk = tmp_path / "chunk_000.wav"
    chunk.write_bytes(b"data")

    def exploding(chunk_path, language=None, **kwargs):
        raise RuntimeError("model exploded")

    service._model.transcribe = exploding

    try:
        service._transcribe_chunk(str(chunk), "en")
    except RuntimeError:
        pass
    assert not chunk.exists()          # finally-block cleanup still ran