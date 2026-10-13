"""Chat answers end cleanly: length budget, provider reserve, truncation repair."""
import time
from types import SimpleNamespace

import pytest

from app.services.rag import answer_completion as ac
from app.services.rag.rag import RAG

GAMING_TAIL = (
    "### **Lenovo Gaming Laptops**\n"
    "- **Lenovo LOQ**: Intel Core i5, RTX 3050, ₹1,36,000.\n"
    "- **Lenovo Legion 5**: Ryzen 7, RTX 4060. Weight: 2.43 kg.\n\n"
    "### **Acer & HP Gaming Laptops**\n"
    "- **Acer Nitro V**"
)


# ---------- trim_incomplete_tail ----------

def test_trim_drops_dangling_item_and_orphan_heading():
    out = ac.trim_incomplete_tail(GAMING_TAIL)
    assert out.endswith("Weight: 2.43 kg.")
    assert "Acer" not in out


def test_trim_drops_label_without_content():
    text = "The HP Victus is a solid choice for students.\n\n**Key specs to note:**"
    assert ac.trim_incomplete_tail(text) == "The HP Victus is a solid choice for students."


def test_trim_cuts_paragraph_back_to_last_sentence():
    text = "Shipping takes 3 days. Returns are free within 30 days. You can also exch"
    assert ac.trim_incomplete_tail(text) == "Shipping takes 3 days. Returns are free within 30 days."


def test_trim_keeps_decimals_and_cuts_bullet_mid_detail():
    text = "Options:\n- **Lenovo LOQ**: Price ₹1,36,000. Weight 2.4"
    assert ac.trim_incomplete_tail(text) == "Options:\n- **Lenovo LOQ**: Price ₹1,36,000."


def test_trim_drops_whole_nested_item_cut_mid_details():
    text = (
        "- **MSI Cyborg 15 AI PC**\n"
        " - Price: Rs. 102,990\n"
        " - Specs: Intel Core Ultra 7 155H, 16 GB RAM\n"
        "- **MSI Thin A15**\n"
        " - Price: Rs. 72,990\n"
        " - Specs: Intel Core i5 12450H, 16 GB"
    )
    out = ac.trim_incomplete_tail(text)
    assert out.endswith("16 GB RAM")
    assert "MSI Thin A15" not in out


def test_trim_drops_bold_only_item_left_after_cut():
    text = (
        "- **Lenovo Legion Pro 5**\n"
        " - **Rating**: 4.3\n"
        "- **Lenovo LOQ Essential (AMD Ryzen 7)**\n"
        " - **Specs**: AMD Ryzen 7, 16 GB RAM, RTX"
    )
    out = ac.trim_incomplete_tail(text)
    assert out.endswith("**Rating**: 4.3")


def test_trim_prose_ignores_abbreviation_periods():
    text = "The base model costs Rs. 72,990 today. The premium model costs Rs. 1,02,990 and inclu"
    assert ac.trim_incomplete_tail(text) == "The base model costs Rs. 72,990 today."


def test_trim_drops_unclosed_code_fence():
    text = "Run this command first.\n\n```bash\nnpm install && npm ru"
    assert ac.trim_incomplete_tail(text) == "Run this command first."


def test_trim_drops_unbalanced_bold_line():
    text = "Here is the summary.\n- **Battery life is up to"
    assert ac.trim_incomplete_tail(text) == "Here is the summary."


def test_trim_keeps_complete_answer():
    text = "The office is in Ahmedabad.\n\n- Open Monday to Friday."
    assert ac.trim_incomplete_tail(text) == text


def test_trim_guard_falls_back_to_sentence_cut():
    long_tail = "word " * 80
    text = f"Intro sentence here. {long_tail}"
    out = ac.trim_incomplete_tail(text)
    assert out == "Intro sentence here."


def test_trim_guard_returns_original_when_nothing_sensible():
    text = "no sentence end at all and it just keeps going"
    assert ac.trim_incomplete_tail(text) == text


def test_trim_empty():
    assert ac.trim_incomplete_tail("") == ""
    assert ac.trim_incomplete_tail(None) == ""


# ---------- finish_reason / was_truncated ----------

def test_was_truncated_mistral_openai_shapes():
    assert ac.was_truncated({"choices": [SimpleNamespace(finish_reason="length")]}, None, 1000)
    assert ac.was_truncated({"choices": [{"finish_reason": "length"}]}, 10, 1000)


def test_was_truncated_mistral_stream_event():
    event = SimpleNamespace(data=SimpleNamespace(choices=[SimpleNamespace(finish_reason="length")]))
    assert ac.was_truncated(event, None, 1000)


def test_was_truncated_gemini_and_anthropic_and_ollama():
    assert ac.was_truncated({"finish_reason": "MAX_TOKENS"}, None, 1000)
    assert ac.was_truncated({"stop_reason": "max_tokens"}, None, 1000)
    assert ac.was_truncated({"done_reason": "length"}, None, 1000)


def test_was_truncated_enum_value():
    class _Reason:
        value = "length"

    assert ac.was_truncated({"choices": [{"finish_reason": _Reason()}]}, None, 1000)


def test_was_truncated_by_usage_at_cap():
    assert ac.was_truncated({}, 1000, 1000)
    assert ac.was_truncated(None, 1001, 1000)


def test_not_truncated():
    assert not ac.was_truncated({"choices": [{"finish_reason": "stop"}]}, 600, 1000)
    assert not ac.was_truncated(None, None, 1000)
    assert not ac.was_truncated({"finish_reason": 1}, "bad", 1000)


# ---------- hard_cap / instruction ----------

def test_hard_cap_reserve_bounds_and_ceiling():
    assert ac.hard_cap(800) == 1000
    assert ac.hard_cap(200) == 264
    assert ac.hard_cap(2000) == 2300
    assert ac.hard_cap(2900) == 3000
    assert ac.hard_cap(4000) == 4000
    assert ac.hard_cap(0) == 0


def test_instruction_only_for_chat_markdown(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_ANSWER_COMPLETION", raising=False)
    text = ac.chat_instruction("chat", "markdown", 800)
    assert "about 360 words" in text and "closing sentence" in text
    assert ac.chat_instruction("search", "markdown", 800) == ""
    assert ac.chat_instruction("chat", "html_short", 800) == ""
    assert ac.chat_instruction("chat", "html_long", 800) == ""
    assert ac.chat_instruction("chat", "markdown", 0) == ""


def test_kill_switch_disables_everything(monkeypatch):
    monkeypatch.setenv("RAG_CHAT_ANSWER_COMPLETION", "0")
    assert not ac.applies("chat", "markdown")
    assert ac.chat_instruction("chat", "markdown", 800) == ""


def test_prompt_contains_length_rule_only_in_chat():
    rag = RAG.__new__(RAG)
    kwargs = dict(top_k=5, generate_topk=False, cite_passages=True)
    rule = ac.chat_instruction("chat", "markdown", 800)
    chat = rag._build_prompt("Show me gaming laptops", "[S1]\nLOQ", mode="chat",
                             length_instruction=rule, **kwargs)
    search = rag._build_prompt("Show me gaming laptops", "[S1]\nLOQ", mode="search",
                               length_instruction=rule, **kwargs)
    plain = rag._build_prompt("Show me gaming laptops", "[S1]\nLOQ", mode="chat", **kwargs)
    assert "LENGTH: Keep the whole answer" in chat
    assert "LENGTH: Keep the whole answer" not in search
    assert "LENGTH: Keep the whole answer" not in plain


# ---------- closing sentence ----------

class _ClosingLLM:
    def __init__(self, text="", delay=0.0, exc=None):
        self.text, self.delay, self.exc = text, delay, exc
        self.calls = []

    def complete(self, prompt, **kwargs):
        self.calls.append((prompt, kwargs))
        if self.delay:
            time.sleep(self.delay)
        if self.exc:
            raise self.exc
        return SimpleNamespace(text=self.text)


@pytest.mark.parametrize(
    "candidate",
    [
        "line one.\nline two.",
        "short.",
        "x" * 230 + ".",
        "No ending punctuation here",
        "See ```code``` for more.",
        "There are 12 more models available.",
    ],
)
def test_clean_closing_rejects(candidate):
    assert ac.clean_closing(candidate, "Lenovo LOQ costs ₹1,36,000.") is None


def test_clean_closing_strips_quotes_and_emphasis():
    out = ac.clean_closing('"**These are the main gaming laptops available.**"', "answer")
    assert out == "These are the main gaming laptops available."


@pytest.mark.parametrize(
    "candidate",
    [
        "Here’s a concise wrap-up: These laptops cover budget to premium options.",
        "Here is a closing sentence: These laptops cover budget to premium options.",
        "Here’s a concise closing sentence for your list:\n\nThese laptops cover budget to premium options.",
    ],
)
def test_clean_closing_strips_model_preambles(candidate):
    assert ac.clean_closing(candidate, "answer") == "These laptops cover budget to premium options."


def test_closing_uses_small_budget_and_low_temperature():
    llm = _ClosingLLM("These are the main gaming laptops in the catalogue.")
    out = ac.closing_sentence(llm, user_query="q", answer="answer.",
                              llm_kwargs={"max_tokens": 1000, "temperature": 0.7, "top_p": 0.9})
    assert out == "These are the main gaming laptops in the catalogue."
    kwargs = llm.calls[0][1]
    assert kwargs == {"max_tokens": 60, "temperature": 0.3, "top_p": 0.9}


def test_closing_gemini_kwargs():
    llm = _ClosingLLM("That covers the key options for you.")
    ac.closing_sentence(llm, user_query="q", answer="a.",
                        llm_kwargs={"generation_config": {"max_output_tokens": 1000}})
    assert llm.calls[0][1] == {"generation_config": {"max_output_tokens": 60, "temperature": 0.3}}


def test_closing_timeout_and_error_return_none():
    assert ac.closing_sentence(_ClosingLLM("Fine sentence here.", delay=0.6),
                               user_query="q", answer="a.", timeout_s=0.5) is None
    assert ac.closing_sentence(_ClosingLLM(exc=RuntimeError("boom")),
                               user_query="q", answer="a.") is None


def test_complete_truncated_appends_closing():
    llm = _ClosingLLM("These are the main gaming laptops currently listed.")
    text, meta = ac.complete_truncated(GAMING_TAIL, llm=llm, user_query="Show me gaming laptops.")
    assert text.endswith("Weight: 2.43 kg.\n\nThese are the main gaming laptops currently listed.")
    assert meta == {"truncated": True, "closing": True}


def test_complete_truncated_trim_only_when_closing_fails():
    text, meta = ac.complete_truncated(GAMING_TAIL, llm=_ClosingLLM(exc=RuntimeError("x")), user_query="q")
    assert text.endswith("Weight: 2.43 kg.")
    assert meta == {"truncated": True, "closing": False}


# ---------- RAG.stream_query / RAG.query integration ----------

CLOSING = "These are the main gaming laptops currently listed."
STREAMED = GAMING_TAIL + "\n"


class _PipelineLLM(_ClosingLLM):
    def __init__(self, finish_reason, answer=STREAMED, usage_tokens=None):
        super().__init__(CLOSING)
        self.finish_reason, self.answer, self.usage_tokens = finish_reason, answer, usage_tokens
        self.main_kwargs = None

    def stream_complete(self, prompt, **kwargs):
        self.main_kwargs = kwargs
        parts = [self.answer[: len(self.answer) // 2], self.answer[len(self.answer) // 2:]]
        for i, part in enumerate(parts):
            raw = {"choices": [{"finish_reason": self.finish_reason if i == len(parts) - 1 else None}]}
            yield SimpleNamespace(delta=part, raw=raw)

    def complete(self, prompt, **kwargs):
        if "ANSWER (end of it)" in prompt:
            return super().complete(prompt, **kwargs)
        self.main_kwargs = kwargs
        raw = {"choices": [{"finish_reason": self.finish_reason}]}
        if self.usage_tokens:
            raw["usage"] = {"prompt_tokens": 100, "completion_tokens": self.usage_tokens}
        return SimpleNamespace(text=self.answer, raw=raw)


def _pipeline(monkeypatch, llm):
    rag = RAG.__new__(RAG)
    rag.llm = llm
    rag.retriever = SimpleNamespace(_extract_keywords=lambda q: q.lower().split())
    rag.redis_client = None
    rag._query_cache = {}
    contexts = ["Lenovo LOQ gaming laptop RTX 3050", "Lenovo Legion 5 gaming laptop RTX 4060"]
    metas = [{"document_id": "d", "url": f"https://shop.example/{i}"} for i in range(2)]
    monkeypatch.setattr(rag, "_retrieve_for_query",
                        lambda *a, **k: (contexts, ["d", "d"], metas, [0.2, 0.25], {"top1_similarity": 80}))
    monkeypatch.setattr(rag, "_evidence_decision",
                        lambda *a, **k: SimpleNamespace(sufficient=True, to_meta=lambda: {}))
    monkeypatch.setattr(rag, "_verify_answer", lambda text, idx, **k: (text, idx, False))
    monkeypatch.setattr(rag, "_is_sensitive_query", lambda _q: False)
    return rag


def _stream_done(rag, **kwargs):
    chunks = list(rag.stream_query(user_query="Show me gaming laptops.", max_tokens=800,
                                   use_cache=False, **kwargs))
    return [m for _, m in chunks if m and m.get("done")][-1]


def test_stream_truncated_answer_is_repaired(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_ANSWER_COMPLETION", raising=False)
    llm = _PipelineLLM("length")
    done = _stream_done(_pipeline(monkeypatch, llm))
    assert llm.main_kwargs["max_tokens"] == 1000
    assert done["answer_completed"] is True
    assert done["full_text"].endswith(f"Weight: 2.43 kg.\n\n{CLOSING}")
    assert done["retrieval_meta"]["answer_completion"] == {"truncated": True, "closing": True}


def test_stream_complete_answer_untouched(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_ANSWER_COMPLETION", raising=False)
    answer = "The Lenovo LOQ is the most affordable option.\n\nIt suits students well."
    llm = _PipelineLLM("stop", answer=answer)
    done = _stream_done(_pipeline(monkeypatch, llm))
    assert done["answer_completed"] is False
    assert done["full_text"] == answer
    assert "answer_completion" not in done["retrieval_meta"]
    assert len(llm.calls) == 0


def test_stream_search_mode_keeps_configured_cap(monkeypatch):
    llm = _PipelineLLM("length")
    done = _stream_done(_pipeline(monkeypatch, llm), mode="search", format_type="html_long")
    assert llm.main_kwargs["max_tokens"] == 800
    assert done["answer_completed"] is False


def test_query_truncated_by_usage_is_repaired(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_ANSWER_COMPLETION", raising=False)
    llm = _PipelineLLM(None, usage_tokens=1000)
    rag = _pipeline(monkeypatch, llm)
    result = rag.query("Show me gaming laptops.", max_tokens=800, mode="chat", use_cache=False)
    assert llm.main_kwargs["max_tokens"] == 1000
    assert result["summary"].endswith(CLOSING)
    assert "Acer Nitro V" not in result["summary"]
    assert result["retrieval_meta"]["answer_completion"]["truncated"] is True


def test_query_complete_answer_untouched(monkeypatch):
    monkeypatch.delenv("RAG_CHAT_ANSWER_COMPLETION", raising=False)
    answer = "The Lenovo LOQ is the most affordable option."
    llm = _PipelineLLM("stop", answer=answer, usage_tokens=40)
    rag = _pipeline(monkeypatch, llm)
    result = rag.query("Show me gaming laptops.", max_tokens=800, mode="chat", use_cache=False)
    assert result["summary"] == answer
    assert "answer_completion" not in result["retrieval_meta"]
