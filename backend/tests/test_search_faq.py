"""Unit tests for search FAQ (configured answers streamed without RAG)."""
import asyncio
import json
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.schemas import PredefinedQuestion, RagQuery, SearchCustomizationOut
from app.services import faq_common, search_faq_stream, search_run_context
from app.services.faq_common import stamp_answer_source
from app.services.search_faq import (
    clamp_search_faq_limit,
    find_search_faq_answer,
    normalize_search_faq_questions,
)
from app.services.search_faq_stream import (
    SearchFaqContext,
    resolve_search_faq_context,
    search_faq_response_data,
    stream_search_faq_answer,
)

PROJECT_UUID = uuid.uuid4()


def test_normalize_accepts_legacy_strings_and_objects():
    out = normalize_search_faq_questions([
        "  Legacy string  ",
        {"question": "With answer", "answer": "  Yes.  "},
        {"text": "Text key", "id": "custom"},
        {"question": "   "},
        42,
    ])
    assert out == [
        {"id": "pq_1", "question": "Legacy string", "answer": "", "order": 0},
        {"id": "pq_2", "question": "With answer", "answer": "Yes.", "order": 1},
        {"id": "custom", "question": "Text key", "answer": "", "order": 2},
    ]


def test_normalize_ids_are_stable_and_unique():
    raw = [{"id": "pq_1", "question": "A"}, "B", {"id": "pq_1", "question": "C"}]
    first = normalize_search_faq_questions(raw)
    assert [row["id"] for row in first] == ["pq_1", "pq_2", "pq_3"]
    assert normalize_search_faq_questions(raw) == first
    assert normalize_search_faq_questions(first) == first


def test_normalize_caps_answer_and_applies_limit():
    out = normalize_search_faq_questions(
        [{"question": "Q1", "answer": "x" * 5000}, "Q2", "Q3"],
        limit=2,
    )
    assert len(out) == 2
    assert len(out[0]["answer"]) == faq_common.FAQ_ANSWER_MAX_LENGTH


def test_normalize_non_list_returns_empty():
    assert normalize_search_faq_questions(None) == []
    assert normalize_search_faq_questions("nope") == []


def test_clamp_search_faq_limit():
    assert clamp_search_faq_limit(None) == 5
    assert clamp_search_faq_limit(0) == 1
    assert clamp_search_faq_limit(99) == 50
    assert clamp_search_faq_limit(True) == 5


def _settings(**overrides):
    base = dict(
        search_predefined_questions=True,
        search_questions_limit=2,
        search_questions=[
            {"id": "pq_1", "question": "What is RAGSuite?", "answer": "A RAG platform."},
            {"id": "pq_2", "question": "Legacy question"},
            {"id": "pq_3", "question": "Hidden by limit", "answer": "Hidden."},
        ],
        is_search_active=True,
        search_language="en",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def test_find_search_faq_answer_matches_id_and_text():
    row = find_search_faq_answer(_settings(), "pq_1", "  what is   RAGSUITE? ")
    assert row is not None
    assert row["answer"] == "A RAG platform."


@pytest.mark.parametrize(
    "settings, faq_id, query",
    [
        (_settings(), "pq_1", "Something else"),
        (_settings(), "missing", "What is RAGSuite?"),
        (_settings(), None, "What is RAGSuite?"),
        (_settings(), "", "What is RAGSuite?"),
        (_settings(search_predefined_questions=False), "pq_1", "What is RAGSuite?"),
        (_settings(), "pq_2", "Legacy question"),
        (_settings(), "pq_3", "Hidden by limit"),
        (None, "pq_1", "What is RAGSuite?"),
    ],
)
def test_find_search_faq_answer_falls_through(settings, faq_id, query):
    assert find_search_faq_answer(settings, faq_id, query) is None


def test_schemas_accept_faq_fields():
    assert RagQuery(query="hi").faq_id is None
    assert RagQuery(query="hi", faq_id="pq_1").faq_id == "pq_1"
    q = PredefinedQuestion(question="Q")
    assert q.id is None and q.order is None
    out = SearchCustomizationOut(questions=normalize_search_faq_questions(["Q"]))
    assert out.questions[0].id == "pq_1"
    assert out.questions[0].question == "Q"


def test_resolve_search_session_id():
    assert search_run_context.resolve_search_session_id(RagQuery(query="q", session_id="abc"), 1) == "abc"
    assert search_run_context.resolve_search_session_id(RagQuery(query="q"), 7).startswith("search_7_")
    assert search_run_context.resolve_search_session_id(RagQuery(query="q"), None).startswith("search_")


def _patch_project(monkeypatch, settings):
    ref = search_run_context.SearchProjectRef(
        auth_type="widget",
        user_id=1,
        api_key_id=None,
        project_id=str(PROJECT_UUID),
        project_uuid=PROJECT_UUID,
    )
    monkeypatch.setattr(search_run_context, "resolve_search_project", lambda db, auth: ref)
    monkeypatch.setattr(search_run_context, "load_search_settings", lambda db, uid, pid: settings)


def test_resolve_context_skips_lookup_without_faq_id(monkeypatch):
    def fail(*_args, **_kwargs):
        raise AssertionError("project must not be resolved for plain searches")

    monkeypatch.setattr(search_run_context, "resolve_search_project", fail)
    assert resolve_search_faq_context(None, {"type": "widget"}, RagQuery(query="What is RAGSuite?")) is None


def test_resolve_context_matches_card(monkeypatch):
    _patch_project(monkeypatch, _settings())
    auth = {"type": "widget", "project_id": PROJECT_UUID}
    ctx = resolve_search_faq_context(None, auth, RagQuery(query="What is RAGSuite?", faq_id="pq_1"))
    assert ctx is not None
    assert ctx.answer == "A RAG platform."
    assert ctx.project_uuid == PROJECT_UUID
    assert ctx.session_scope == f"w:{PROJECT_UUID}"
    assert ctx.session_id.startswith("search_1_")


def test_resolve_context_unanswered_card_falls_back_to_rag(monkeypatch):
    _patch_project(monkeypatch, _settings())
    auth = {"type": "widget", "project_id": PROJECT_UUID}
    assert resolve_search_faq_context(None, auth, RagQuery(query="Legacy question", faq_id="pq_2")) is None


def test_resolve_context_respects_deactivated_search(monkeypatch):
    _patch_project(monkeypatch, _settings(is_search_active=False))
    auth = {"type": "widget", "project_id": PROJECT_UUID}
    with pytest.raises(HTTPException) as exc:
        resolve_search_faq_context(None, auth, RagQuery(query="What is RAGSuite?", faq_id="pq_1"))
    assert exc.value.status_code == 403


def _ctx():
    return SearchFaqContext(
        answer="RAGSuite is a **RAG** platform with search and chat.",
        faq_id="pq_1",
        query="What is RAGSuite?",
        session_id="search_1",
        session_scope="w:x",
        user_id=1,
        project_uuid=PROJECT_UUID,
    )


def test_search_faq_response_data_has_no_sources():
    ctx = _ctx()
    data = search_faq_response_data(ctx)
    assert data["answer"] == ctx.answer
    assert data["sources"] == []
    assert data["retrieval_meta"] == {"answer_source": "faq", "faq_id": "pq_1"}


def test_stream_search_faq_answer_emits_tokens_then_done(monkeypatch):
    monkeypatch.setattr(faq_common, "FAQ_STREAM_CHUNK_DELAY_S", 0)
    persisted = []
    monkeypatch.setattr(search_faq_stream, "persist_search_faq_answer", persisted.append)
    ctx = _ctx()

    async def collect():
        return [event async for event in stream_search_faq_answer(ctx)]

    events = asyncio.run(collect())
    payloads = [json.loads(e[len("data: "):]) for e in events if e.startswith("data: ")]
    tokens = [p["token"] for p in payloads if not p["done"]]
    done = payloads[-1]

    assert len(tokens) > 1
    assert "".join(tokens) == ctx.answer
    assert all("sources" not in p for p in payloads[:-1])
    assert done["done"] is True
    assert done["sources"] == []
    assert done["final_answer"] == ctx.answer
    assert done["answer_updated"] is False
    assert done["retrieval_meta"]["answer_source"] == "faq"
    assert persisted == [ctx]


def test_stamp_answer_source():
    assert stamp_answer_source({"status": "ok"}, "faq") == {"status": "ok", "answer_source": "faq"}
    assert stamp_answer_source({"status": "ok"}, None) == {"status": "ok"}
    assert stamp_answer_source(None, "faq") is None


def _history_row(snapshot):
    return SimpleNamespace(
        id=uuid.uuid4(),
        session_id="s",
        message_id=uuid.uuid4(),
        user_message="q",
        assistant_response="a",
        message_type="search",
        sources=None,
        feedback=None,
        feedback_rating=None,
        feedback_text=None,
        context_tags=None,
        created_at=datetime.now(timezone.utc),
        execution_snapshot=snapshot,
    )


def test_history_list_out_exposes_answer_source():
    from app.routes.rag import _chat_message_history_list_out

    assert _chat_message_history_list_out(_history_row({"answer_source": "faq"})).answer_source == "faq"
    via_meta = _history_row({"retrieval_meta": {"answer_source": "faq"}})
    assert _chat_message_history_list_out(via_meta).answer_source == "faq"
    assert _chat_message_history_list_out(_history_row(None)).answer_source is None
