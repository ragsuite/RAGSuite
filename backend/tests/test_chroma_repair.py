"""Tests for Chroma repair path resolution and health reporting."""

from pathlib import Path

from app.services.chroma_repair import (
    _collection_health_row,
    _CollectionSegments,
    check_chroma_health,
    resolve_local_chroma_path,
)


def test_resolve_local_chroma_path_finds_rag_db_local(tmp_path, monkeypatch):
    chroma_dir = tmp_path / "rag_db_local"
    chroma_dir.mkdir()
    (chroma_dir / "chroma.sqlite3").write_bytes(b"")
    monkeypatch.delenv("CHROMA_HOST", raising=False)
    monkeypatch.delenv("CHROMA_MODE", raising=False)
    from app.settings import settings

    monkeypatch.setattr(settings, "chroma_persist_path", str(chroma_dir))
    path = resolve_local_chroma_path()
    assert path is not None
    assert path == chroma_dir
    assert (path / "chroma.sqlite3").exists()


def test_resolve_local_chroma_path_allows_local_http(tmp_path, monkeypatch):
    chroma_dir = tmp_path / "rag_db_local"
    chroma_dir.mkdir()
    from app.settings import settings

    monkeypatch.setattr(settings, "chroma_mode", "http")
    monkeypatch.setattr(settings, "chroma_host", "127.0.0.1")
    path = resolve_local_chroma_path(str(chroma_dir))
    assert path is not None
    assert path == chroma_dir


def test_resolve_local_chroma_path_skips_remote_http(monkeypatch):
    from app.settings import settings

    monkeypatch.setattr(settings, "chroma_mode", "http")
    monkeypatch.setattr(settings, "chroma_host", "chromadb")
    path = resolve_local_chroma_path()
    assert path is None


def test_check_chroma_health_returns_collections():
    report = check_chroma_health()
    if report.get("local_path"):
        assert "collections" in report
        assert isinstance(report["collections"], list)


def test_load_hnsw_ids_skips_rust_binary_layout(tmp_path):
    from app.services.chroma_repair import _load_hnsw_ids

    seg = tmp_path / "vector-seg"
    seg.mkdir()
    (seg / "data_level0.bin").write_bytes(b"\x00")
    (seg / "header.bin").write_bytes(b"\x00")
    assert _load_hnsw_ids(seg) is None


def test_load_hnsw_ids_skips_rust_even_when_stale_pickle_exists(tmp_path):
    """Regression: pickle + Rust binaries must not trust the stale pickle id set."""
    import pickle

    from app.services.chroma_repair import _load_hnsw_ids

    seg = tmp_path / "vector-seg"
    seg.mkdir()
    (seg / "data_level0.bin").write_bytes(b"\x00")
    (seg / "header.bin").write_bytes(b"\x00")
    with open(seg / "index_metadata.pickle", "wb") as fh:
        pickle.dump({"id_to_label": {"stale-only": 0}}, fh)
    assert _load_hnsw_ids(seg) is None


def test_repair_all_refuses_to_wipe_when_hnsw_empty(tmp_path, monkeypatch):
    from app.services import chroma_repair as cr

    db_path = tmp_path / "chroma"
    db_path.mkdir()
    sqlite = db_path / "chroma.sqlite3"
    import sqlite3

    conn = sqlite3.connect(sqlite)
    conn.executescript(
        """
        CREATE TABLE collections (id TEXT, name TEXT);
        CREATE TABLE segments (id TEXT, scope TEXT, collection TEXT);
        CREATE TABLE embeddings (id INTEGER, segment_id TEXT, embedding_id TEXT);
        INSERT INTO collections VALUES ('c1', 'proj_test__mistral__abc');
        INSERT INTO segments VALUES ('v1', 'VECTOR', 'c1');
        INSERT INTO segments VALUES ('m1', 'METADATA', 'c1');
        INSERT INTO embeddings VALUES (1, 'm1', 'chunk-a');
        INSERT INTO embeddings VALUES (2, 'm1', 'chunk-b');
        """
    )
    conn.commit()
    conn.close()
    (db_path / "v1").mkdir()
    # No pickle and no rust binaries → empty HNSW set; safety must refuse full wipe.
    monkeypatch.setattr(cr, "resolve_local_chroma_path", lambda override=None: db_path)
    result = cr.repair_chroma_index(str(db_path), create_backup=False)
    assert result["orphans_removed"] == 0
    conn = sqlite3.connect(sqlite)
    assert conn.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0] == 2
    conn.close()


def test_collection_health_row_counts_orphans(tmp_path):
    # Minimal synthetic layout is heavy; test row math with empty metadata.
    db_path = tmp_path
    seg_dir = db_path / "vector-seg"
    seg_dir.mkdir()
    (seg_dir / "index_metadata.pickle").write_bytes(
        __import__("pickle").dumps({"id_to_label": {"a": 0, "b": 1}})
    )
    sqlite = db_path / "chroma.sqlite3"
    import sqlite3

    conn = sqlite3.connect(sqlite)
    conn.execute("CREATE TABLE embeddings (id INTEGER, segment_id TEXT, embedding_id TEXT)")
    conn.execute(
        "INSERT INTO embeddings VALUES (1, 'meta-seg', 'c')",
    )
    conn.commit()
    conn.close()

    entry = _CollectionSegments("test_collection", "vector-seg", "meta-seg")
    row = _collection_health_row(db_path, entry)
    assert row["metadata_chunks"] == 1
    assert row["hnsw_chunks"] == 2
    assert row["orphan_chunks"] == 1
    assert row["status"] == "orphans"
