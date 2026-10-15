"""Legacy Chroma import source discovery (no chromadb / Postgres needed)."""
from __future__ import annotations

from app.services.rag.vector_store import chroma_source


def _use_backend_root(monkeypatch, root, env_text: str = "") -> None:
    if env_text:
        (root / ".env").write_text(env_text, encoding="utf-8")
    monkeypatch.setattr(chroma_source, "_BACKEND_ROOT", root)
    monkeypatch.delenv("CHROMA_IMPORT_PATH", raising=False)
    monkeypatch.delenv("CHROMA_PERSIST_PATH", raising=False)


def test_persist_path_read_from_backend_env_file(tmp_path, monkeypatch):
    _use_backend_root(monkeypatch, tmp_path, "CHROMA_PERSIST_PATH=/srv/legacy/chroma\n")
    assert chroma_source.candidate_paths()[0].as_posix() == "/srv/legacy/chroma"


def test_process_env_overrides_env_file(tmp_path, monkeypatch):
    _use_backend_root(monkeypatch, tmp_path, "CHROMA_PERSIST_PATH=/srv/from-file\n")
    monkeypatch.setenv("CHROMA_PERSIST_PATH", "/srv/from-env")
    assert chroma_source.candidate_paths()[0].as_posix() == "/srv/from-env"


def test_relative_path_resolves_under_backend_root(tmp_path, monkeypatch):
    _use_backend_root(monkeypatch, tmp_path, "CHROMA_PERSIST_PATH=data/old_chroma\n")
    assert chroma_source.candidate_paths()[0] == tmp_path / "data" / "old_chroma"


def test_found_only_when_sqlite_present(tmp_path, monkeypatch):
    _use_backend_root(monkeypatch, tmp_path)
    assert chroma_source.find_source_path() is None
    store = tmp_path / "data" / "chroma_db"
    store.mkdir(parents=True)
    (store / "chroma.sqlite3").write_bytes(b"")
    assert chroma_source.find_source_path() == store
