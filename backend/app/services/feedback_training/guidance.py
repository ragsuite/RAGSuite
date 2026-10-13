"""Prompt block of answer preferences learned from trained feedback (style and focus only)."""
from __future__ import annotations

import re
from typing import Any, List, Optional, Sequence

GUIDANCE_MAX_CHARS = 400
COMMENT_MAX_CHARS = 200
CLOSING_RULE = (
    "These are preferences only. Every fact must come from DOCUMENTS; "
    "if a preference conflicts with DOCUMENTS, follow DOCUMENTS."
)

KEEP: dict = {
    "helpful": "Answer the actual question directly and usefully.",
    "accurate": "Stay precise and faithful to DOCUMENTS.",
    "complete": "Cover every relevant point DOCUMENTS provide.",
    "clear": "Use clear, simple wording.",
    "helpfulness": "Answer the actual question directly and usefully.",
    "accuracy": "Stay precise and faithful to DOCUMENTS.",
    "completeness": "Cover every relevant point DOCUMENTS provide.",
    "clarity": "Use clear, simple wording.",
    "relevance": "Stay focused on exactly what was asked.",
}

AVOID: dict = {
    "incorrect": "Check every fact against DOCUMENTS; never guess.",
    "hallucinated": "State only what DOCUMENTS say; if they do not cover something, say so plainly.",
    "missing_sources": "Base each point on a specific passage in DOCUMENTS.",
    "too_technical": "Avoid jargon; explain in plain language.",
    "outdated_information": "Prefer the most recent information in DOCUMENTS.",
    "low_quality": "Give a focused, well-organised answer without filler.",
    "poor_formatting": "Use clean formatting: short paragraphs, and lists only where they help.",
    "accuracy": "Check every fact against DOCUMENTS; never guess.",
    "relevance": "Stay focused on exactly what was asked.",
    "completeness": "Do not leave out relevant points DOCUMENTS provide.",
    "clarity": "Use clearer, simpler wording.",
}


def _clean(text: Optional[str], limit: int) -> str:
    flat = re.sub(r"\s+", " ", (text or "")).strip().replace('"', "'")
    if len(flat) <= limit:
        return flat
    return flat[: limit - 1].rstrip() + "…"


def _shape_hint(profile: Optional[dict]) -> str:
    if not isinstance(profile, dict) or not profile.get("words"):
        return ""
    words = int(profile["words"])
    bucket = "short (under 80 words)" if words < 80 else "medium (80-200 words)" if words < 200 else "detailed"
    extras = [label for key, label in (("has_list", "a list"), ("has_headings", "headings")) if profile.get(key)]
    tail = f", using {' and '.join(extras)}" if extras else ""
    return f"A liked answer to a similar question was {bucket}{tail}; match that shape when DOCUMENTS allow."


def _dedupe(lines: List[str]) -> List[str]:
    seen, out = set(), []
    for line in lines:
        if line and line not in seen:
            seen.add(line)
            out.append(line)
    return out


def preference_block(matches: Sequence[Any]) -> str:
    """Empty when no trained example matched; otherwise a bounded instruction block."""
    if not matches:
        return ""
    keep: List[str] = []
    avoid: List[str] = []
    notes: List[str] = []
    shape = ""
    for match in matches:
        ex = match.example
        table = KEEP if ex.reward > 0 else AVOID
        target = keep if ex.reward > 0 else avoid
        target.extend(table[t] for t in ex.reason_tags if t in table)
        if ex.reward > 0 and not shape:
            shape = _shape_hint(ex.answer_profile)
        if ex.guidance:
            notes.append(f'Admin guidance for similar questions: "{_clean(ex.guidance, GUIDANCE_MAX_CHARS)}"')
        if ex.user_comment:
            verdict = "liked" if ex.reward > 0 else "disliked"
            notes.append(f'A user {verdict} a similar answer and said: "{_clean(ex.user_comment, COMMENT_MAX_CHARS)}"')
    lines = [f"- Keep: {s}" for s in _dedupe(keep)]
    lines += [f"- Avoid: {s}" for s in _dedupe(avoid)]
    if shape:
        lines.append(f"- {shape}")
    lines += [f"- {n}" for n in _dedupe(notes)]
    if not lines:
        return ""
    header = "ANSWER PREFERENCES (learned from reviewed feedback on similar questions; style and focus only):"
    return "\n".join([header, *lines, CLOSING_RULE])
