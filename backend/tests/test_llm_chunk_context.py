import time

from app.services.rag import chunk_context, llm_chunk_context as lc


def _chunks(n):
    ids = [f"c{i}" for i in range(n)]
    docs = [f"Passage {i} about hoist model H{i}." for i in range(n)]
    metas = [{"title": "Hoist catalogue", "chunk_index": i, "url": "https://x.com/cat.pdf"} for i in range(n)]
    return ids, docs, metas


def test_is_long_document_by_extension_and_size(monkeypatch):
    monkeypatch.setenv("RAG_LLM_CONTEXT_MIN_CHUNKS", "8")
    assert lc.is_long_document("https://x.com/files/catalogue.PDF?dl=1", 8)
    assert lc.is_long_document("/tmp/staging/3f2b_report.docx", 20)
    assert not lc.is_long_document("https://x.com/page.html", 50)
    assert not lc.is_long_document("/tmp/slides.pptx", 7)


def test_contextualize_uses_cache_and_llm_for_misses():
    ids, docs, metas = _chunks(3)
    head = lc.document_head(docs)
    cached = {lc.cache_key(head, docs[0]): "Cached context."}
    calls, stored = [], {}

    def complete(prompt):
        calls.append(prompt)
        return "  Fresh   context for the passage. "

    rows = lc.contextualize_chunks(
        ids, docs, metas,
        complete=complete,
        cache_get=lambda keys: {k: v for k, v in cached.items() if k in keys},
        cache_put=stored.update,
    )
    assert len(calls) == 2
    assert len(stored) == 2 and all(v == "Fresh context for the passage." for v in stored.values())
    by_id = {cid: meta for cid, _, meta in rows}
    assert by_id["c0"]["ctx_llm"] == "Cached context."
    assert by_id["c1"]["ctx_llm"] == "Fresh context for the passage."
    assert all(m["chunk_ctx_v"] == chunk_context.CHUNK_CONTEXT_VERSION_LLM for m in by_id.values())
    assert all(m["ctx_header"] for m in by_id.values())


def test_llm_errors_and_timeouts_leave_chunks_unchanged(monkeypatch):
    monkeypatch.setenv("RAG_LLM_CONTEXT_TIMEOUT_SECONDS", "5")
    monkeypatch.setattr(lc, "timeout_seconds", lambda: 0.2)
    ids, docs, metas = _chunks(2)

    def complete(prompt):
        if "Passage 0" in prompt.split("<passage>")[1]:
            raise RuntimeError("rate limited")
        time.sleep(1)
        return "late"

    rows = lc.contextualize_chunks(
        ids, docs, metas, complete=complete, cache_get=lambda keys: {}, cache_put=lambda c: None
    )
    assert rows == []


def test_chunks_with_existing_context_are_skipped():
    ids, docs, metas = _chunks(2)
    metas[0]["ctx_llm"] = "Already there."
    rows = lc.contextualize_chunks(
        ids, docs, metas, complete=lambda p: "New.", cache_get=lambda k: {}, cache_put=lambda c: None
    )
    assert [cid for cid, _, _ in rows] == ["c1"]


def test_maybe_enqueue_skips_short_or_non_document_sources(monkeypatch):
    monkeypatch.setenv("RAG_LLM_CONTEXT_MIN_CHUNKS", "8")
    common = dict(project_id="p", user_id=1, document_id="d", collection="c")
    assert lc.maybe_enqueue(name="https://x.com/a.html", chunk_count=40, **common) is False
    assert lc.maybe_enqueue(name="/tmp/a.pdf", chunk_count=3, **common) is False
    monkeypatch.setenv("RAG_LLM_CONTEXT_ENABLED", "false")
    assert lc.maybe_enqueue(name="/tmp/a.pdf", chunk_count=40, **common) is False
