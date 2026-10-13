"""Hidden NEXT_STEP marker, chat-only prompt rules and stream filtering."""
import pytest

from app.services.rag import answer_next_step as ans
from app.services.rag import citation_trailer
from app.services.rag.query_processing import process_query


@pytest.fixture(autouse=True)
def _flags(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_CLARIFY", raising=False)
    monkeypatch.delenv("RAG_CHAT_FOLLOW_UP", raising=False)


@pytest.mark.parametrize(
    "raw,kind",
    [
        ("Answer.\nSOURCES_USED: S1\nNEXT_STEP: follow_up", "follow_up"),
        ("Answer?\nNEXT_STEP: clarify\nSOURCES_USED: none", "clarify"),
        ("Answer.\n**NEXT_STEP:** none", "none"),
        ("Answer.\nNext step: Follow-up", "follow_up"),
        ("Answer?\nSOURCES_USED: S1\nNEXT_STEP: `clarify`", "clarify"),
        ("Answer?\n`NEXT_STEP: \"follow_up\"`", "follow_up"),
        ("Answer only.", None),
    ],
)
def test_split_next_step(raw, kind):
    text, got = ans.split_next_step(raw)
    assert got == kind
    assert "next" not in text.lower().split("sources_used")[0].replace("answer", "")
    answer, _ = citation_trailer.parse_and_strip(text)
    assert answer.startswith("Answer") and "NEXT" not in answer.upper().replace("ANSWER", "")


def test_parse_keeps_citation_indices_after_split():
    text, kind = ans.split_next_step("Laptops A and B.\nSOURCES_USED: S2, S3\nNEXT_STEP: follow_up")
    answer, used = citation_trailer.parse_and_strip(text)
    assert (answer, used, kind) == ("Laptops A and B.", [1, 2], "follow_up")


def test_stream_filter_hides_next_step_split_across_deltas():
    f = citation_trailer.CitationTrailerFilter()
    deltas = ["Which would you like", " to explore: A or B?\nNE", "XT_ST", "EP: follow_up\nSOURCES_USED: S1"]
    visible = "".join(f.feed(d) for d in deltas) + f.flush()
    assert visible.strip() == "Which would you like to explore: A or B?"


def test_stream_filter_does_not_hold_words_like_nexus():
    f = citation_trailer.CitationTrailerFilter()
    assert f.feed("The Nexus 5 costs less. ") == "The Nexus 5 costs less."
    assert f.feed("Next") == ""
    assert f.feed(" to it.") == " Next to it."


def test_prompt_rules_and_flags(monkeypatch):
    both = ans.prompt_instruction(allow_follow_up=True)
    assert "- CLARIFY when" in both and "- FOLLOW UP when" in both and "NEXT_STEP" in both
    assert "before any SOURCES_USED line" in both
    clarify_only = ans.prompt_instruction(allow_follow_up=False)
    assert "- FOLLOW UP when" not in clarify_only and "`clarify`" in clarify_only
    monkeypatch.setenv("RAG_CHAT_CLARIFY", "off")
    assert ans.prompt_instruction(allow_follow_up=False) == ""


def test_follow_up_gated_by_intent():
    assert ans.follow_up_allowed(process_query("What services do you offer?"))
    assert not ans.follow_up_allowed(process_query("What is the price of the Galaxy S24?"))
    assert not ans.follow_up_allowed(process_query("Laptops under ₹50,000"))


def test_both_flags_off_restore_previous_prompt(monkeypatch):
    monkeypatch.setenv("RAG_CHAT_CLARIFY", "0")
    monkeypatch.setenv("RAG_CHAT_FOLLOW_UP", "false")
    pq = process_query("What services do you offer?")
    assert ans.chat_instruction("chat", pq) == ""
    assert not ans.follow_up_allowed(pq)


def test_follow_up_only_when_clarify_off(monkeypatch):
    monkeypatch.setenv("RAG_CHAT_CLARIFY", "0")
    text = ans.chat_instruction("chat", process_query("What services do you offer?"))
    assert "- FOLLOW UP when" in text and "- CLARIFY when" not in text and "`clarify`" not in text


def test_chat_instruction_is_empty_outside_chat():
    pq = process_query("What services do you offer?")
    assert ans.chat_instruction("search", pq) == ""
    assert "NEXT_STEP" in ans.chat_instruction("chat", pq)


def test_finalize_meta_only_records_visible_questions_in_chat():
    meta = {}
    ans.finalize_meta(meta, "none", "Pick A or B?", mode="chat")
    ans.finalize_meta(meta, "follow_up", "Pick A or B?", mode="search")
    ans.finalize_meta(meta, "follow_up", "A and B are offered.", mode="chat")
    assert meta == {}
    assert ans.finalize_meta(meta, "clarify", "Ratings are not listed. Price or brand?**", mode="chat") == "clarify"
    assert meta == {"next_step": "clarify"}


def test_split_next_step_keeps_closing_bold_on_the_same_line():
    cleaned, kind = ans.split_next_step("- **Highline:** **11.10.07.44**NEXT_STEP: none")
    assert cleaned == "- **Highline:** **11.10.07.44**"
    assert kind == "none"
