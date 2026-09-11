"""Unit tests for chatbot FAQ helpers."""
from app.services.chatbot_faq import (
    FAQ_QUESTION_LIMIT_DEFAULT,
    clamp_faq_question_limit,
    faq_settings_from_row,
    normalize_faq_questions,
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
        {"id": "a", "text": "  One  "},
        {"text": ""},
        "Two",
        {"id": "c", "question": "Three"},
        {"id": "d", "text": "Four"},
        {"id": "e", "text": "Five"},
    ]
    out = normalize_faq_questions(raw, limit=4)
    assert len(out) == 4
    assert out[0] == {"id": "a", "text": "One", "order": 1}
    assert out[1]["text"] == "Two"
    assert out[2]["text"] == "Three"
    assert out[3]["order"] == 4


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
