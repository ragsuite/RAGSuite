"""Per-document training progress: store, percent/ETA view, embed callbacks, reindex wiring."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.services import document_training_progress as progress_mod
from app.services.document_training_progress import (
    MODE_RETRAIN,
    MODE_TRAIN,
    DocumentTrainingProgress,
    get_progress_map,
    mark_queued,
    progress_view,
    training_mode_for,
)


@pytest.fixture(autouse=True)
def _memory_store(monkeypatch):
    monkeypatch.setattr(progress_mod, "_redis", lambda: None)
    progress_mod._memory.clear()
    yield
    progress_mod._memory.clear()


def _record(**overrides):
    base = {
        "mode": MODE_TRAIN,
        "stage": "training",
        "done": 0,
        "total": 0,
        "target_index": 0,
        "target_count": 1,
        "started_at": 1000.0,
        "training_started_at": 1000.0,
        "updated_at": 1000.0,
    }
    base.update(overrides)
    return base


def test_view_percent_by_stage():
    assert progress_view(_record(stage="queued"))["percent"] == 0
    assert progress_view(_record(stage="reading"))["percent"] == 3
    assert progress_view(_record(done=50, total=100))["percent"] == 51
    assert progress_view(_record(stage="saving", done=100, total=100))["percent"] == 97


def test_view_spreads_percent_across_targets():
    first_half = progress_view(_record(done=50, total=100, target_count=2))
    second_half = progress_view(_record(done=50, total=100, target_index=1, target_count=2))
    assert first_half["percent"] == 28
    assert second_half["percent"] == 74


def test_view_eta_from_training_rate():
    view = progress_view(_record(done=25, total=100, training_started_at=1000.0), now=1060.0)
    assert view["eta_seconds"] == 180
    assert progress_view(_record(done=1, total=100), now=1060.0)["eta_seconds"] is None
    assert progress_view(_record(stage="saving", done=100, total=100), now=1060.0)["eta_seconds"] is None


def test_view_normalizes_unknown_mode():
    assert progress_view(_record(mode="weird"))["mode"] == MODE_TRAIN
    assert progress_view(_record(mode=MODE_RETRAIN))["mode"] == MODE_RETRAIN


def test_training_mode_for_existing_vectors():
    assert training_mode_for(0, "Queued") == MODE_TRAIN
    assert training_mode_for(12, "Indexing") == MODE_RETRAIN
    assert training_mode_for(0, "Indexed") == MODE_RETRAIN


def test_tracker_lifecycle():
    doc_id = str(uuid.uuid4())
    tracker = DocumentTrainingProgress(doc_id, mode=MODE_TRAIN)
    assert get_progress_map([doc_id])[doc_id]["stage"] == "reading"

    report = tracker.for_target(0)
    report("training", 40, 80)
    report("training", 80, 80)
    view = get_progress_map([doc_id])[doc_id]
    assert view["stage"] == "training"
    assert (view["done"], view["total"]) == (80, 80)

    tracker.finish()
    assert get_progress_map([doc_id]) == {}


def test_tracker_requeue_marks_waiting():
    doc_id = str(uuid.uuid4())
    tracker = DocumentTrainingProgress(doc_id, mode=MODE_RETRAIN)
    tracker.requeue()
    view = get_progress_map([doc_id])[doc_id]
    assert view["stage"] == "queued"
    assert view["mode"] == MODE_RETRAIN


def test_tracker_throttles_mid_batch_writes(monkeypatch):
    writes = []
    real_write = progress_mod._write
    monkeypatch.setattr(
        progress_mod, "_write", lambda doc_id, record, ttl: (writes.append(record["done"]), real_write(doc_id, record, ttl))
    )
    tracker = DocumentTrainingProgress("doc-throttle", mode=MODE_TRAIN)
    report = tracker.for_target(0)
    report("training", 0, 100)
    for done in range(1, 100):
        report("training", done, 100)
    report("training", 100, 100)
    assert writes[0] == 0
    assert writes[-1] == 100
    assert len(writes) < 10


def test_mark_queued_and_stale_filter(monkeypatch):
    mark_queued(["a", "b"], mode=MODE_RETRAIN)
    found = get_progress_map(["a", "b", "c"])
    assert set(found) == {"a", "b"}
    assert all(v["stage"] == "queued" for v in found.values())

    DocumentTrainingProgress("dead", mode=MODE_TRAIN)
    later = progress_mod.time.time() + progress_mod.STALE_ACTIVE_SECONDS + 5
    monkeypatch.setattr(progress_mod.time, "time", lambda: later)
    assert "dead" not in get_progress_map(["dead"])
    assert "a" in get_progress_map(["a"])


def test_embed_with_api_limits_reports_cumulative_progress():
    from app.services.rag.rag import EmbedData

    embedder = EmbedData.__new__(EmbedData)
    embedder._get_text_embedding_batch_with_retry = lambda batch: [[0.0] for _ in batch]
    embedder._batch_pause_seconds = lambda: 0
    embedder._approx_token_count = lambda text: 1

    calls = []
    out = embedder._embed_with_api_limits(
        ["t"] * 7,
        max_input_chars=100,
        max_batch_tokens=1000,
        max_batch_items=3,
        on_progress=lambda stage, done, total: calls.append((stage, done, total)),
    )
    assert len(out) == 7
    assert calls == [("training", 3, 7), ("training", 6, 7), ("training", 7, 7)]


def test_embed_progress_callback_errors_never_fail_ingest():
    from app.services.rag.rag import EmbedData

    embedder = EmbedData.__new__(EmbedData)
    embedder._get_text_embedding_batch_with_retry = lambda batch: [[0.0] for _ in batch]
    embedder._batch_pause_seconds = lambda: 0
    embedder._approx_token_count = lambda text: 1

    def boom(*_args):
        raise RuntimeError("progress backend down")

    out = embedder._embed_with_api_limits(
        ["t"] * 4, max_input_chars=100, max_batch_tokens=1000, max_batch_items=2, on_progress=boom
    )
    assert len(out) == 4


def test_locked_ingest_reports_saving_before_write(monkeypatch):
    from app.services.rag import singleton

    events = []

    class _Pipeline:
        def prepare_ingest(self, path, **kwargs):
            kwargs["on_progress"]("training", 2, 2)
            return {"texts": ["a", "b"], "embeddings": [[0.0], [0.0]], "chunk_metadata": [{}, {}], "document_id": "d1", "chunks": 2}

        def delete_document_embeddings(self, *_a, **_k):
            events.append("delete")

        def write_prepared_ingest(self, **_k):
            events.append("write")

    monkeypatch.setattr(singleton, "get_pipeline", lambda: _Pipeline())
    monkeypatch.setattr(singleton, "collection_name_for", lambda *a, **k: "coll")
    monkeypatch.setattr(singleton, "get_embedding_meta", lambda *a, **k: SimpleNamespace(metric="cosine"))

    result = singleton.locked_ingest(
        "/tmp/x.txt",
        document_id="d1",
        on_progress=lambda stage, done, total: events.append(stage),
    )
    assert result["chunks"] == 2
    assert events == ["training", "saving", "delete", "write"]


def test_reindex_skips_documents_with_active_upload_ingest(monkeypatch):
    from app.services import reindex_service

    doc_id = "00000000-0000-0000-0000-0000000000aa"
    project_id = "00000000-0000-0000-0000-000000000001"
    skipped = []

    monkeypatch.setattr(reindex_service, "SessionLocal", lambda: MagicMock())
    monkeypatch.setattr(reindex_service, "resolve_reindex_for_project", lambda *a, **k: ("p", "m", "k"))
    monkeypatch.setattr(reindex_service, "document_ids_with_active_ingest", lambda db, ids: {doc_id})
    monkeypatch.setattr(
        reindex_service,
        "add_reindex_progress",
        lambda db, project, source, **kw: skipped.append(kw.get("skipped_delta")),
    )
    monkeypatch.setattr(
        reindex_service,
        "reindex_uploaded_document",
        lambda *a, **k: pytest.fail("in-flight upload must not be retrained"),
    )

    reindex_service.process_reindex_payload(
        {"project_id": project_id, "source": "chat", "run_id": "r1", "phase": "upload", "document_ids": [doc_id]}
    )
    assert skipped == [1]


def test_reindex_uploaded_document_clears_progress_on_early_exit(monkeypatch):
    from app.services import reindex_service

    doc = SimpleNamespace(id="early-exit", chunks=5, status="Indexed", text_content=b"")
    mark_queued([doc.id], mode=MODE_RETRAIN)
    monkeypatch.setattr(reindex_service, "_uploaded_document_bytes", lambda d, db=None: b"")

    result = reindex_service.reindex_uploaded_document(doc, "p", "m", "k")
    assert result["chunks"] == 0
    assert get_progress_map([doc.id]) == {}


def test_reindex_uploaded_document_requeues_on_rate_limit(monkeypatch):
    from app.services import reindex_service
    from app.services.embed_rate_limit import EmbeddingRateLimitError

    doc = SimpleNamespace(id="rate-limited", chunks=5, status="Indexed")

    def _raise(*_a, **_k):
        raise EmbeddingRateLimitError("429")

    monkeypatch.setattr(reindex_service, "_reindex_uploaded_document", _raise)
    with pytest.raises(EmbeddingRateLimitError):
        reindex_service.reindex_uploaded_document(doc, "p", "m", "k")
    assert get_progress_map([doc.id])[doc.id]["stage"] == "queued"


def test_document_ids_with_active_ingest_matches_pending_and_running():
    from app.db import Base
    from app.models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
    from app.services.reindex_service import document_ids_with_active_ingest

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[BackgroundJob.__table__])
    db = sessionmaker(bind=engine)()
    try:
        def job(doc_id, status, job_type=BackgroundJobType.DOCUMENT_INGEST.value):
            db.add(BackgroundJob(id=uuid.uuid4(), job_type=job_type, status=status, payload={"document_id": doc_id}))

        job("running-doc", BackgroundJobStatus.RUNNING.value)
        job("pending-doc", BackgroundJobStatus.PENDING.value)
        job("done-doc", BackgroundJobStatus.COMPLETED.value)
        job("reindex-doc", BackgroundJobStatus.RUNNING.value, BackgroundJobType.REINDEX.value)
        db.commit()

        found = document_ids_with_active_ingest(
            db, ["running-doc", "pending-doc", "done-doc", "reindex-doc", "missing"]
        )
        assert found == {"running-doc", "pending-doc"}
        assert document_ids_with_active_ingest(db, []) == set()
    finally:
        db.close()
