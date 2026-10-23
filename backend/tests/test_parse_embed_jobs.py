"""DOCUMENT_PARSE then DOCUMENT_EMBED: parse once, embed under lock, one ingest slot."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import uuid

from app.models import BackgroundJobType
from app.services.job_queue import (
    _finish_job,
    _process_job_sync,
    enqueue_document_embed,
    enqueue_document_ingest,
)


def test_parse_writes_payload_without_embed(monkeypatch, tmp_path):
    from app.services.document_ingest_orchestration import parse_document_sync

    parsed = {
        "texts": ["chunk"],
        "chunk_metadata": [{"title": "x"}],
        "document_id": "doc-1",
        "chunks": 1,
    }
    embed_calls = []
    pipeline = SimpleNamespace(
        prepare_parse=lambda *a, **k: parsed,
        embed_prepared=lambda *a, **k: embed_calls.append(True) or [[0.1]],
    )
    saved = {}
    monkeypatch.setattr("app.services.rag.singleton.get_pipeline", lambda: pipeline)
    monkeypatch.setattr(
        "app.services.rag.parsed_document.save_parsed",
        lambda project_id, document_id, payload, staging_fallback=None: saved.update(
            payload=payload, key=f"{project_id}/{document_id}/parsed.json"
        )
        or f"{project_id}/{document_id}/parsed.json",
    )
    monkeypatch.setattr(
        "app.services.document_ingest_orchestration._parse_kwargs_for_document",
        lambda **_k: {"title": "Guide", "language": "en"},
    )

    out = parse_document_sync(
        MagicMock(),
        save_path=str(tmp_path / "a.pdf"),
        document_id="doc-1",
        user_id=1,
        project_id=uuid.uuid4(),
    )
    assert out["parsed_key"].endswith("parsed.json")
    assert saved["payload"]["texts"] == ["chunk"]
    assert embed_calls == []


def test_embed_loads_payload_and_write_lock_replace(monkeypatch):
    from app.services.document_ingest_orchestration import embed_parsed_to_all_targets_sync

    parsed = {"texts": ["chunk"], "chunk_metadata": [{}], "document_id": "doc-1", "chunks": 1}
    writes = []
    monkeypatch.setattr(
        "app.services.document_ingest_orchestration._document_targets",
        lambda *_a, **_k: [
            SimpleNamespace(
                source="search",
                provider="openai",
                model="small",
                api_key="k",
                endpoint=None,
                api_version=None,
                collection="coll",
            )
        ],
    )
    monkeypatch.setattr(
        "app.services.document_ingest_orchestration._ingest_kwargs_for_target",
        lambda **kw: {
            "document_id": kw["document_id"],
            "embedding_provider": "openai",
            "embedding_model": "small",
        },
    )
    monkeypatch.setattr(
        "app.services.document_ingest_orchestration._upload_language",
        lambda *_a, **_k: "en",
    )
    monkeypatch.setattr(
        "app.services.document_ingest_orchestration._purge_stale_targets",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr(
        "app.services.rag.singleton.locked_replace_parsed",
        lambda path, payload, **kw: writes.append((path, payload, kw))
        or {"status": "Indexed", "chunks": 1},
    )

    status, chunks = embed_parsed_to_all_targets_sync(
        MagicMock(),
        save_path="/tmp/a.pdf",
        document_id="doc-1",
        user_id=1,
        project_id=uuid.uuid4(),
        parsed=parsed,
    )
    assert (status, chunks) == ("Indexed", 1)
    assert writes[0][1] is parsed


def test_document_ingest_compat_routes_to_parse_not_embed():
    job = SimpleNamespace(
        job_type=BackgroundJobType.DOCUMENT_INGEST.value,
        user_id=1,
        payload={"document_id": "d1", "staging_path": "/tmp/a.pdf"},
    )
    with patch("app.services.job_queue._process_document_parse", return_value={"chained_embed": True}) as parse:
        with patch("app.services.job_queue._process_document_embed") as embed:
            result = _process_job_sync(job)
    parse.assert_called_once()
    embed.assert_not_called()
    assert result == {"chained_embed": True}


def test_enqueue_parse_counts_one_slot_embed_does_not(monkeypatch):
    queued = []
    jobs = []

    monkeypatch.setattr("app.services.job_queue.settings.enable_durable_jobs", True)
    monkeypatch.setattr("app.services.job_queue.SessionLocal", lambda: MagicMock())
    monkeypatch.setattr(
        "app.services.job_queue.enqueue_job",
        lambda db, **kw: jobs.append(kw) or SimpleNamespace(id="j"),
    )
    monkeypatch.setattr(
        "app.services.admission.ingest_queued_incr",
        lambda project_id: queued.append(("incr", str(project_id))),
    )
    monkeypatch.setattr(
        "app.services.admission.ingest_queued_decr",
        lambda project_id: queued.append(("decr", str(project_id))),
    )

    project_id = uuid.uuid4()
    assert enqueue_document_ingest("doc-1", "/tmp/a.pdf", user_id=1, project_id=project_id) is True
    assert enqueue_document_embed("doc-1", "/tmp/a.pdf", user_id=1, project_id=project_id) is True
    assert [job["job_type"] for job in jobs] == [
        BackgroundJobType.DOCUMENT_PARSE.value,
        BackgroundJobType.DOCUMENT_EMBED.value,
    ]
    assert jobs[0]["idempotency_key"] == "document_parse:doc-1"
    assert "split_config" in jobs[0]["payload"]
    assert jobs[1]["idempotency_key"] == "document_embed:doc-1"
    assert queued == [("incr", str(project_id))]


def test_finish_parse_skips_queued_decr_when_embed_is_chained(monkeypatch):
    decr = []
    monkeypatch.setattr("app.services.admission.ingest_queued_decr", lambda pid: decr.append(pid))
    monkeypatch.setattr("app.services.admission.ingest_active_decr", lambda pid: None)
    monkeypatch.setattr("app.services.admission.crawl_running_decr", lambda: None)

    parse_job = SimpleNamespace(
        job_type=BackgroundJobType.DOCUMENT_PARSE.value,
        project_id=uuid.uuid4(),
        status="RUNNING",
        result=None,
        error=None,
        finished_at=None,
    )
    db = MagicMock()
    _finish_job(db, parse_job, status="COMPLETED", result={"chained_embed": True})
    assert decr == []

    embed_job = SimpleNamespace(
        job_type=BackgroundJobType.DOCUMENT_EMBED.value,
        project_id=parse_job.project_id,
        status="RUNNING",
        result=None,
        error=None,
        finished_at=None,
    )
    _finish_job(db, embed_job, status="COMPLETED", result={"ok": True})
    assert decr == [parse_job.project_id]
