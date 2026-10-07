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


def test_resolve_local_chroma_path_skips_remote_http_without_mount(monkeypatch):
    from app.settings import settings

    monkeypatch.setattr(settings, "chroma_mode", "http")
    monkeypatch.setattr(settings, "chroma_host", "chromadb")
    monkeypatch.setattr(settings, "chroma_persist_path", "/tmp/ragsuite-chroma-missing-path")
    path = resolve_local_chroma_path()
    assert path is None


def test_resolve_local_chroma_path_uses_shared_volume_with_sidecar_host(tmp_path, monkeypatch):
    """Docker: CHROMA_HOST=chromadb but backend mounts the same persist dir."""
    chroma_dir = tmp_path / "chroma_db"
    chroma_dir.mkdir()
    (chroma_dir / "chroma.sqlite3").write_bytes(b"")
    from app.settings import settings

    monkeypatch.setattr(settings, "chroma_mode", "http")
    monkeypatch.setattr(settings, "chroma_host", "chromadb")
    monkeypatch.setattr(settings, "chroma_persist_path", str(chroma_dir))
    path = resolve_local_chroma_path()
    assert path == chroma_dir


def test_is_hnsw_segment_error_detects_disk_message():
    from app.services.chroma_repair import is_hnsw_segment_error

    assert is_hnsw_segment_error(
        "Error executing plan: Internal error: Error creating hnsw segment reader: Nothing found on disk"
    )
    assert not is_hnsw_segment_error("timeout connecting to chromadb")


def test_rust_hnsw_segment_corrupt_empty_link_lists(tmp_path):
    from app.services.chroma_repair import _rust_hnsw_segment_corrupt

    seg = tmp_path / "vector-seg"
    seg.mkdir()
    (seg / "data_level0.bin").write_bytes(b"\x00" * 64)
    (seg / "header.bin").write_bytes(b"\x00" * 8)
    (seg / "link_lists.bin").write_bytes(b"")
    assert _rust_hnsw_segment_corrupt(seg) is True

    (seg / "link_lists.bin").write_bytes(b"\x01\x02\x03\x04")
    assert _rust_hnsw_segment_corrupt(seg) is False


def test_rebuild_skips_when_api_probe_ok_even_if_disk_corrupt(tmp_path, monkeypatch):
    """Disk markers alone must not wipe a collection the API can still query."""
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
        INSERT INTO collections VALUES ('c1', 'proj_live__azure_openai__abc');
        INSERT INTO segments VALUES ('v1', 'VECTOR', 'c1');
        INSERT INTO segments VALUES ('m1', 'METADATA', 'c1');
        """
    )
    conn.commit()
    conn.close()
    seg = db_path / "v1"
    seg.mkdir()
    (seg / "data_level0.bin").write_bytes(b"\x00" * 64)
    (seg / "header.bin").write_bytes(b"\x00" * 8)
    (seg / "link_lists.bin").write_bytes(b"")

    monkeypatch.setattr(cr, "resolve_local_chroma_path", lambda override=None: db_path)
    monkeypatch.setattr(cr, "_api_vector_probe", lambda name: (True, None))

    called = {"n": 0}

    def _boom(*_a, **_k):
        called["n"] += 1
        raise AssertionError("rebuild must not run when API probe is OK")

    monkeypatch.setattr(cr, "rebuild_corrupt_hnsw_collection", _boom)
    result = cr.rebuild_corrupt_hnsw_collections(["proj_live__azure_openai__abc"])
    assert result["collections_rebuilt"] == 0
    assert called["n"] == 0


def test_rebuild_restores_vectors_from_snapshot(monkeypatch):
    """Corrupt HNSW rebuild must re-add exported embeddings instead of leaving empty."""
    from app.services import chroma_repair as cr

    class _FakeCol:
        def __init__(self):
            self.added = None

        def add(self, **kwargs):
            self.added = kwargs

    class _FakeClient:
        def __init__(self):
            self.col = _FakeCol()
            self.deleted = False

        def delete_collection(self, name):
            self.deleted = True

        def get_or_create_collection(self, name, metadata=None):
            return self.col

    client = _FakeClient()
    monkeypatch.setattr(cr, "_chroma_client", lambda: client)
    monkeypatch.setattr(
        cr,
        "_snapshot_collection_vectors",
        lambda name, **kwargs: {
            "ids": ["a", "b"],
            "embeddings": [[0.1, 0.2], [0.3, 0.4]],
            "documents": ["doc-a", "doc-b"],
            "metadatas": [{"document_id": "d1"}, {"document_id": "d2"}],
        },
    )
    monkeypatch.setattr(cr, "_invalidate_rag_collection_cache", lambda name: None)
    monkeypatch.setattr(cr, "_flag_documents_in_postgres", lambda ids: 99)
    probes = iter([(False, "Nothing found on disk"), (True, None)])
    monkeypatch.setattr(cr, "_api_vector_probe", lambda name: next(probes))

    result = cr.rebuild_corrupt_hnsw_collection("proj_x", force=True)
    assert result["rebuilt"] is True
    assert result["restored_vectors"] == 2
    assert result["flagged_documents"] == 0
    assert client.deleted is True
    assert client.col.added is not None
    assert client.col.added["ids"] == ["a", "b"]
    assert "Flagged" not in result["message"]


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
