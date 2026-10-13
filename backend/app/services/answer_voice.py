"""Assistant voice: answers speak to the visitor, never about "the documents" or "the context".

Grounding prompts talk about DOCUMENTS and CONTEXT, and models echo that ("This is not
stated in the documents", "Based on the provided context, ..."). The prompt asks for a
natural voice; this is the deterministic safety net on the final chat answer. Only
references to the assistant's own material are rewritten — "in the context of skincare"
or "bring the documents to the store" are left alone.
"""
from __future__ import annotations

import re
from typing import Match, Optional

OUT_OF_SCOPE_MSG = "I'm sorry, I don't have information on that. Is there anything else I can help you with?"
LEGACY_OUT_OF_SCOPE_PHRASE = "out of the context of the provided documents"
_OOC_SENTINEL = "QUERY_OUT_OF_CONTEXT"

_ADJ = r"(?:provided|available|given|supplied|retrieved|uploaded|shared|indexed|attached|above|referenced)"
_MATERIAL = r"(?:documents?|passages?|excerpts?|snippets?|knowledge\s*base|context)"
# With an adjective any owner and more nouns are meta ("the provided information");
# bare forms only with "the"/"my" ("in this context," / "your documents" are real content).
_META_REF = (
    rf"(?:(?:the|these|those|my|this|our)\s+{_ADJ}\s+(?:{_MATERIAL}|sources?|information|details|data|texts?|"
    rf"materials?|content)|(?:the|my)\s+{_MATERIAL}(?:\s+{_ADJ})?|the\s+information\s+(?:provided|given|available)"
    rf"(?:\s+to\s+me)?)"
)
_END = r"(?=\s*(?:[.,;:!?)\n]|$))"
_SENTENCE_START = r"(^[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)?|[.!?][ \t]+)"
_NEGATION_RX = re.compile(r"\b(?:not|no|never|none|neither|nor)\b|n['’]t\b", re.IGNORECASE)

_LEGACY_OOC_RX = re.compile(
    r"I am sorry,?\s*this query is out of the context of the provided documents\.?", re.IGNORECASE
)
_OPENER_RX = re.compile(
    rf"{_SENTENCE_START}(?:based\s+(?:solely\s+|only\s+)?on|according\s+to|as\s+per|per|from|"
    rf"looking\s+at|as\s+(?:stated|mentioned|described|shown|outlined)\s+in)\s+{_META_REF}\s*[,:]\s*",
    re.IGNORECASE | re.MULTILINE,
)
_PRONOUN_REFUSAL_RX = re.compile(
    rf"\b(?:this|that|it|this information|that information|this detail|such information)\s+"
    rf"(?:is|was)\s+not\s+(?:explicitly\s+|specifically\s+|clearly\s+)?(?:stated|mentioned|specified|"
    rf"available|provided|included|covered|listed|found|given|addressed|described)\s+(?:in|within)\s+"
    rf"{_META_REF}{_END}",
    re.IGNORECASE,
)
_SUBJECT_NOT_IN_RX = re.compile(
    rf"\b(is|are|was|were)\s+not\s+(?:explicitly\s+|specifically\s+|clearly\s+)?(?:stated|mentioned|"
    rf"specified|listed|covered|included|provided|given|found|available|addressed|described)\s+"
    rf"(?:in|within)\s+{_META_REF}{_END}",
    re.IGNORECASE,
)
_META_DENIES_RX = re.compile(
    rf"\b{_META_REF}\s+(?:do|does|did)(?:n['’]t|\s+not)\s+(?:explicitly\s+|specifically\s+|clearly\s+)?"
    rf"(?:mention|state|specify|include|contain|provide|list|say|cover|indicate|confirm|discuss|describe|"
    rf"address|detail|give)(?:\s+(?:any|specific|explicit|clear|further))*"
    rf"(?:\s+(?:information|details?|data|mention))?(?:\s+(about|on|regarding|of|for|whether|if))?",
    re.IGNORECASE,
)
_QUALIFIER_RX = re.compile(
    rf"(?:[ \t]*,?[ \t]+(?:or|and)\b)?"
    rf"[ \t]*,?[ \t]*(\bas\s+(?:stated|mentioned|described|shown|outlined|noted|listed|specified)\s+)?"
    rf"\b(?:in|on|within|from|across|among|based\s+on|according\s+to|per)\s+{_META_REF}{_END}",
    re.IGNORECASE,
)
# "no information in the documents about X" → "no information about X".
_INFO_IN_META_RX = re.compile(
    rf"\b(information|details?|data|mention)\s+(?:in|within|from)\s+{_META_REF}\s+"
    rf"(?=(?:about|on|regarding|for|of)\b)",
    re.IGNORECASE,
)
_GERMAN_QUALIFIER_RX = re.compile(
    r"[ \t]*,?[ \t]*\b(?:in den|aus den|laut den)\s+(?:bereitgestellten\s+|vorliegenden\s+|verfügbaren\s+|"
    r"gegebenen\s+)?Dokumenten\b|[ \t]*\b(?:im|aus dem)\s+(?:bereitgestellten|gegebenen|vorliegenden)\s+"
    r"Kontext\b",
    re.IGNORECASE,
)
_SOURCES_SAY_RX = re.compile(
    r"\b(some|other|certain|several|a few|multiple|different)\s+(?:sources|documents|passages|excerpts)\s+"
    r"(mention|say|state|indicate|suggest|list|note)",
    re.IGNORECASE,
)
_NOT_ARE = {"is": "isn't", "are": "aren't", "was": "wasn't", "were": "weren't"}
_LOWER_FIRST = {"the", "this", "that", "there", "it", "its", "these", "those", "they", "their", "we", "our"}
# "However, as far as I know, no …": the hedge goes after a sentence's leading connective.
_CONNECTIVE_RX = re.compile(r"(?:however|but|still|unfortunately|sadly|also|that said)\s*,?\s+", re.IGNORECASE)


def is_out_of_scope_reply(text: Optional[str]) -> bool:
    """The fixed "can't help with that" reply, current or legacy wording."""
    raw = text or ""
    lower = raw.lower()
    return (
        LEGACY_OUT_OF_SCOPE_PHRASE in lower
        or OUT_OF_SCOPE_MSG.lower() in lower
        or _OOC_SENTINEL in raw
    )


def _strip_openers(text: str) -> str:
    out = []
    pos = 0
    for m in _OPENER_RX.finditer(text):
        out.append(text[pos:m.start()] + m.group(1))
        pos = m.end()
        if pos < len(text):
            out.append(text[pos].upper())
            pos += 1
    out.append(text[pos:])
    return "".join(out)


def _denial(match: Match[str]) -> str:
    prep = (match.group(1) or "").lower()
    tail = match.string[match.end():match.end() + 2]
    if not prep and (not tail.strip() or tail.lstrip()[:1] in ".!?;\n"):
        return "I don't have that information"
    if prep in ("whether", "if"):
        return f"I don't have information on {prep}"
    return "I don't have information about"


def _sentence_start(text: str, index: int) -> int:
    start = 0
    for m in re.finditer(r"[.!?](?=\s)|\n", text[:index]):
        start = m.end()
    lead = re.match(r"[ \t]*(?:[-*+][ \t]+|\d+[.)][ \t]+)?", text[start:])
    return start + (lead.end() if lead else 0)


def _hedge_negated_qualifiers(text: str) -> str:
    """Drop "... in the provided documents"; a negated claim keeps its hedge in plain words."""
    for _ in range(8):
        m = _QUALIFIER_RX.search(text)
        if not m:
            break
        start = _sentence_start(text, m.start())
        sentence = text[start:m.start()]
        prefix = ""
        confirms = bool(m.group(1))
        lead = _CONNECTIVE_RX.match(sentence)
        connective, sentence = (sentence[:lead.end()], sentence[lead.end():]) if lead else ("", sentence)
        if (
            not confirms
            and _NEGATION_RX.search(sentence)
            and not sentence.lower().startswith(("as far as i know", "i "))
        ):
            first = re.match(r"\w+", sentence)
            if first and first.group(0).lower() in _LOWER_FIRST:
                sentence = sentence[:1].lower() + sentence[1:]
            prefix = "as far as I know, " if connective else "As far as I know, "
        text = text[:start] + connective + prefix + sentence + text[m.end():]
    return text


# "Follow-up: Would you like …?" echoes the prompt's section name; the question stays.
_STEP_LABEL_RX = re.compile(
    r"^([ \t>]*)(?:[*_]{1,2})?(?:follow[- ]?ups?(?:\s+questions?)?|clarifying\s+questions?|clarification|"
    r"next\s+steps?)(?:[*_]{1,2})?[ \t]*[:：][ \t]*(?:[*_]{1,2}(?=[ \t]))?[ \t]*(?=[^\n]*[?？])",
    re.IGNORECASE | re.MULTILINE,
)


def _tidy(text: str) -> str:
    text = re.sub(r"[ \t]+([.,;:!?])", r"\1", text)
    text = re.sub(r",\s*([.!?])", r"\1", text)
    text = re.sub(r"\(\s*\)", "", text)
    return re.sub(r"[ \t]{2,}", " ", text)


def humanize_answer(text: Optional[str]) -> Optional[str]:
    """Rewrite references to "the documents" / "the context" into the assistant's own voice."""
    if not text or not text.strip():
        return text
    out = _LEGACY_OOC_RX.sub(OUT_OF_SCOPE_MSG, text)
    out = _strip_openers(out)
    out = _PRONOUN_REFUSAL_RX.sub("I don't have that information", out)
    out = _SUBJECT_NOT_IN_RX.sub(lambda m: f"{_NOT_ARE[m.group(1).lower()]} something I have information on", out)
    out = _META_DENIES_RX.sub(_denial, out)
    out = _INFO_IN_META_RX.sub(r"\1 ", out)
    out = _hedge_negated_qualifiers(out)
    out = _GERMAN_QUALIFIER_RX.sub("", out)
    out = _SOURCES_SAY_RX.sub(lambda m: f"{m.group(1)} pages {m.group(2)}", out)
    out = _STEP_LABEL_RX.sub(r"\1", out)
    return _tidy(out) if out != text else text
