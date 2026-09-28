"""Unit tests for chatbot FAQ helpers."""
import asyncio
import json

import pytest
from pydantic import ValidationError

from app.schemas import ChatbotFaqQuestion, ChatbotFaqSettingsUpdate, ChatMessageRequest
from app.services import chatbot_faq_stream, faq_common
from app.services.chatbot_faq import (
    FAQ_QUESTION_LIMIT_DEFAULT,
    clamp_faq_question_limit,
    faq_settings_from_row,
    find_faq_answer,
    normalize_faq_questions,
)
from app.services.chatbot_faq_stream import (
    FaqAnswerContext,
    chunk_faq_answer,
    faq_answer_response_data,
    stream_faq_answer,
)


def test_clamp_faq_question_limit_defaults_and_bounds():
    assert clamp_faq_question_limit(None) == FAQ_QUESTION_LIMIT_DEFAULT
    assert clamp_faq_question_limit(0) == 1
    assert clamp_faq_question_limit(-3) == 1
    assert clamp_faq_question_limit(3) == 3
    assert clamp_faq_question_limit(5) == 5
    assert clamp_faq_question_limit(99) == 5
    assert clamp_faq_question_limit(True) == FAQ_QUESTION_LIMIT_DEFAULT  # type: ignore[arg-type]


def test_normalize_faq_questions_trims_and_caps():
    raw = [
        {"id": "a", "text": "  One  ", "answer": "  First answer  "},
        {"text": ""},
        "Two",
        {"id": "c", "question": "Three"},
        {"id": "d", "text": "Four"},
        {"id": "e", "text": "Five"},
    ]
    out = normalize_faq_questions(raw, limit=4)
    assert len(out) == 4
    assert out[0] == {"id": "a", "text": "One", "order": 1, "answer": "First answer"}
    assert out[1]["text"] == "Two"
    assert out[1]["answer"] == ""
    assert out[2]["text"] == "Three"
    assert out[3]["order"] == 4


def test_normalize_faq_questions_caps_answer_length():
    out = normalize_faq_questions([{"id": "a", "text": "Q", "answer": "x" * 5000}])
    assert len(out[0]["answer"]) == 4000


def test_faq_settings_from_row_defaults():
    assert faq_settings_from_row(None) == {
        "enabled": False,
        "questionsLimit": 3,
        "questions": [],
    }

    class Row:
        faq_enabled = True
        faq_questions_limit = 20
        faq_questions = [{"id": "1", "text": "Hello"}, {"id": "2", "text": "World"}]

    out = faq_settings_from_row(Row())
    assert out["enabled"] is True
    assert out["questionsLimit"] == 5
    assert len(out["questions"]) == 2


class _FaqRow:
    def __init__(self, enabled=True, questions=None):
        self.faq_enabled = enabled
        self.faq_questions_limit = 3
        self.faq_questions = questions if questions is not None else [
            {"id": "q1", "text": "What is t3planet?", "answer": "A TYPO3 agency."},
            {"id": "q2", "text": "Legacy question"},
        ]


def test_find_faq_answer_matches_id_and_text():
    faq = find_faq_answer(_FaqRow(), "q1", "  what IS   t3planet? ")
    assert faq is not None
    assert faq["answer"] == "A TYPO3 agency."


@pytest.mark.parametrize(
    "row, faq_id, message",
    [
        (_FaqRow(), "q1", "Something else"),
        (_FaqRow(), "missing", "What is t3planet?"),
        (_FaqRow(), None, "What is t3planet?"),
        (_FaqRow(), "q1", ""),
        (_FaqRow(enabled=False), "q1", "What is t3planet?"),
        (_FaqRow(), "q2", "Legacy question"),
        (None, "q1", "What is t3planet?"),
    ],
)
def test_find_faq_answer_falls_through(row, faq_id, message):
    assert find_faq_answer(row, faq_id, message) is None


def test_faq_update_schema_requires_non_blank_answer():
    with pytest.raises(ValidationError):
        ChatbotFaqSettingsUpdate(questions=[{"id": "a", "text": "Q"}])
    with pytest.raises(ValidationError):
        ChatbotFaqSettingsUpdate(questions=[{"id": "a", "text": "Q", "answer": "   "}])
    ok = ChatbotFaqSettingsUpdate(questions=[{"id": "a", "text": "Q", "answer": "A"}])
    assert ok.questions[0].answer == "A"


def test_faq_out_schema_allows_legacy_rows_without_answer():
    assert ChatbotFaqQuestion(id="a", text="Q").answer == ""


def test_chat_message_request_accepts_optional_faq_id():
    assert ChatMessageRequest(message="hi").faq_id is None
    assert ChatMessageRequest(message="hi", faq_id="q1").faq_id == "q1"


@pytest.mark.parametrize(
    "text",
    [
        "Short.",
        "Line one\n\n- bullet **bold**\n- second   bullet\n",
        "  leading space kept",
        " ".join(f"word{i}" for i in range(500)),
    ],
)
def test_chunk_faq_answer_round_trips(text):
    chunks = chunk_faq_answer(text)
    assert "".join(chunks) == text
    assert 1 <= len(chunks) <= chatbot_faq_stream.FAQ_STREAM_MAX_CHUNKS


def test_chunk_faq_answer_empty():
    assert chunk_faq_answer("") == []


def _ctx(**overrides):
    base = dict(
        answer="Hello there, **friend**.",
        faq_id="q1",
        user_message="What is t3planet?",
        session_id="s-1",
        session_scope="scope",
        user_id=None,
        project_uuid=None,
    )
    base.update(overrides)
    return FaqAnswerContext(**base)


def test_faq_answer_response_data_has_no_sources():
    ctx = _ctx()
    data = faq_answer_response_data(ctx)
    assert data["answer"] == ctx.answer
    assert data["sources"] == []
    assert data["session_id"] == "s-1"
    assert data["retrieval_meta"] == {"answer_source": "faq", "faq_id": "q1"}


def _route_ctx(req, settings):
    from app.routes.rag import _faq_answer_context

    return _faq_answer_context(
        req,
        settings,
        db=None,
        session_id="s-1",
        scope="scope",
        user_id=None,
        project_uuid=None,
        api_key_id=None,
        start_time=0.0,
    )


def test_route_faq_context_bypasses_rag_only_for_matching_chip():
    row = _FaqRow()
    row.is_active = True
    assert _route_ctx(ChatMessageRequest(message="What is t3planet?"), row) is None
    assert _route_ctx(ChatMessageRequest(message="What is t3planet?", faq_id="q2"), row) is None

    ctx = _route_ctx(ChatMessageRequest(message="What is t3planet?", faq_id="q1"), row)
    assert ctx is not None
    assert ctx.answer == "A TYPO3 agency."
    assert ctx.faq_id == "q1"
    assert ctx.session_id == "s-1"


def test_route_faq_context_respects_deactivated_chatbot():
    from fastapi import HTTPException

    row = _FaqRow()
    row.is_active = False
    with pytest.raises(HTTPException) as exc:
        _route_ctx(ChatMessageRequest(message="What is t3planet?", faq_id="q1"), row)
    assert exc.value.status_code == 403


def test_stream_faq_answer_emits_tokens_then_done(monkeypatch):
    monkeypatch.setattr(faq_common, "FAQ_STREAM_CHUNK_DELAY_S", 0)
    recorded = []
    persisted = []
    monkeypatch.setattr(chatbot_faq_stream, "record_faq_answer_in_session", recorded.append)
    monkeypatch.setattr(chatbot_faq_stream, "persist_faq_answer", persisted.append)
    ctx = _ctx()

    async def collect():
        return [event async for event in stream_faq_answer(ctx)]

    events = asyncio.run(collect())
    payloads = [json.loads(e[len("data: "):]) for e in events if e.startswith("data: ")]
    tokens = [p["token"] for p in payloads if not p["done"]]
    done = payloads[-1]

    assert len(tokens) > 1
    assert "".join(tokens) == ctx.answer
    assert done["done"] is True
    assert done["sources"] == []
    assert done["final_answer"] == ctx.answer
    assert done["answer_updated"] is False
    assert done["message_id"] == str(ctx.assistant_message_id)
    assert recorded == [ctx]
    assert persisted == [ctx]
