"""Chat-only clarifying question when the user's intent is unclear (before retrieval).

One short LLM call writes a question about the user's own message with 2-4 options
(inline text, not UI chips) in the chatbot language. A validated, localized template is
the fallback. With ``RAG_CHAT_CLARIFY`` off the legacy fixed sentence is used.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence

from .chat_topic_memory import LEGACY_CLARIFICATION_TEXT, TopicFrame, answer_entities
from .rag import answer_next_step, source_routing
from .rag.language_config import resolve_language_name

logger = logging.getLogger(__name__)

_TIMEOUT_S = 4.0
_MAX_OPTIONS = 4
_MAX_QUESTION_CHARS = 400
_QUESTION_MARKS = ("?", "？", "؟")
_FORBIDDEN_MARKERS = ("sources_used", "next_step", "ambiguous", "query_out_of_context")

# (question with options, question without options, "or") per base language.
_FALLBACK_TEMPLATES: Dict[str, tuple] = {
    "en": ("Could you tell me a bit more about \"{q}\"? For example, do you mean {opts}?",
           "Could you tell me which product, service or topic you mean by \"{q}\"?", "or"),
    "de": ("Können Sie \"{q}\" etwas genauer beschreiben? Meinen Sie zum Beispiel {opts}?",
           "Welches Produkt, welchen Service oder welches Thema meinen Sie mit \"{q}\"?", "oder"),
    "fr": ("Pourriez-vous préciser « {q} » ? Par exemple, parlez-vous de {opts} ?",
           "De quel produit, service ou sujet parlez-vous avec « {q} » ?", "ou"),
    "es": ("¿Podría precisar un poco más «{q}»? Por ejemplo, ¿se refiere a {opts}?",
           "¿A qué producto, servicio o tema se refiere con «{q}»?", "o"),
    "pt": ("Poderia detalhar um pouco mais \"{q}\"? Por exemplo, refere-se a {opts}?",
           "A que produto, serviço ou tema se refere com \"{q}\"?", "ou"),
    "ar": ("هل يمكنك توضيح \"{q}\" أكثر؟ على سبيل المثال، هل تقصد {opts}؟",
           "ما المنتج أو الخدمة أو الموضوع الذي تقصده بـ \"{q}\"؟", "أو"),
    "zh": ("能否具体说明一下“{q}”？例如，您是指{opts}吗？",
           "您说的“{q}”是指哪个产品、服务或主题？", "还是"),
}


@dataclass(frozen=True)
class Clarification:
    text: str
    generated: bool
    options: tuple = ()

    def to_meta(self) -> Dict[str, Any]:
        return {"generated": self.generated, "options": list(self.options)}


def _dedupe(values: Sequence[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        key = (value or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(value.strip())
    return out


def clarification_candidates(
    frame: TopicFrame, history: Sequence[Dict[str, Any]], project_id: Optional[str]
) -> List[str]:
    """Option candidates: topic entities, names in the last answer, then crawl sources."""
    last_answer = next(
        (t.get("content") or "" for t in reversed(list(history or [])) if t.get("type") == "assistant"),
        "",
    )
    candidates = list(frame.entities) + answer_entities(last_answer)
    if len(candidates) < 2:
        candidates += source_routing.source_labels(project_id)
    return _dedupe(candidates)[:_MAX_OPTIONS]


def _base_language(language_code: Optional[str]) -> str:
    base = (language_code or "en").strip().lower().replace("_", "-").split("-")[0]
    return base if base in _FALLBACK_TEMPLATES else "en"


def _join_options(options: Sequence[str], conjunction: str) -> str:
    if len(options) == 1:
        return options[0]
    return f"{', '.join(options[:-1])} {conjunction} {options[-1]}"


def fallback_clarification(message: str, candidates: Sequence[str], language_code: Optional[str]) -> str:
    with_opts, without_opts, conjunction = _FALLBACK_TEMPLATES[_base_language(language_code)]
    quoted = " ".join((message or "").split())[:120]
    options = list(candidates)[:_MAX_OPTIONS]
    if len(options) >= 2:
        return with_opts.format(q=quoted, opts=_join_options(options, conjunction))
    return without_opts.format(q=quoted)


def _prompt(message: str, history: Sequence[Dict[str, Any]], candidates: Sequence[str], language: str) -> str:
    history_text = "\n".join(
        f"{'User' if t.get('type') == 'user' else 'Assistant'}: {t.get('content') or ''}"
        for t in list(history or [])[-4:]
    )
    options_line = (
        f"Possible options (use only those relevant to the message): {', '.join(candidates)}\n"
        if candidates
        else ""
    )
    grounded = (
        f"If the listed options fit, offer 2-{_MAX_OPTIONS} of them inline as normal text "
        "(e.g. 'Do you mean A, B or C?'). "
        if candidates
        else (
            "Do not invent product names, editions, disciplines, or full forms for acronyms. "
            "Ask a generic question about which product, service, or topic they mean "
            "(e.g. 'Which product or topic are you asking about?'). "
        )
    )
    return (
        f"Conversation so far:\n{history_text or '(none)'}\n\n"
        f"Latest user message: {message}\n"
        f"{options_line}\n"
        "It is unclear what the user is referring to. Write ONE short, friendly clarifying "
        f"question about this specific message so the user can say what they mean. {grounded}\n"
        "Rules: use only the provided options when any are listed; never invent unrelated "
        "full forms or world-knowledge expansions; do not answer the question; do not "
        "apologise; do not mention documents or context; no lists or markdown. "
        f"Write in {language}. Output only the question."
    )


def _valid_question(text: str) -> bool:
    low = text.lower()
    return (
        0 < len(text) <= _MAX_QUESTION_CHARS
        and any(mark in text for mark in _QUESTION_MARKS)
        and not any(marker in low for marker in _FORBIDDEN_MARKERS)
    )


async def generate_clarification(
    message: str,
    history: Sequence[Dict[str, Any]],
    *,
    frame: TopicFrame,
    project_id: Optional[str],
    language_code: Optional[str],
    llm_config: Optional[Dict[str, Any]],
    llm_factory: Any,
) -> Clarification:
    """Clarifying question for an ambiguous chat message (never raises)."""
    if not answer_next_step.clarify_enabled():
        return Clarification(LEGACY_CLARIFICATION_TEXT, generated=False)
    candidates = clarification_candidates(frame, history, project_id)
    # No grounded options → never ask the LLM (avoids inventing Civil vs Electrical, etc.).
    if not candidates:
        return Clarification(
            fallback_clarification(message, candidates, language_code),
            generated=False,
            options=(),
        )
    language = resolve_language_name(language_code) if language_code else "the language of the user's message"
    try:
        provider = (llm_config or {}).get("provider", "openai")
        model = (llm_config or {}).get("chat_model", "gpt-4")
        llm = llm_factory.get_llm(provider, model, (llm_config or {}).get("api_key"))
        prompt = _prompt(message, history, candidates, language)
        loop = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: llm.complete(prompt)), timeout=_TIMEOUT_S
        )
        text = " ".join((result.text if hasattr(result, "text") else str(result)).split()).strip("\"' ")
        if _valid_question(text):
            return Clarification(text, generated=True, options=tuple(candidates))
        logger.info("Clarification rejected (invalid output): %r", text[:120])
    except asyncio.TimeoutError:
        logger.warning("Clarification generation timed out; using template")
    except Exception as exc:
        logger.warning("Clarification generation failed; using template: %s", exc)
    return Clarification(
        fallback_clarification(message, candidates, language_code), generated=False, options=tuple(candidates)
    )
