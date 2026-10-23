"""Chat prompt templates stored on ChatbotSettings.short_description as ``__PROMPT__``."""
from __future__ import annotations

from typing import Optional

TEMPLATES = ("helpful", "strict", "faq")
DEFAULT_TEMPLATE = "helpful"

HELPFUL_PROMPT = (
    "You are a helpful AI chatbot. Use ONLY the context below to answer questions.\n"
    "If the information is not in the context, say so. Be concise and accurate."
)
STRICT_PROMPT = (
    "You are a strict, sources-only assistant. Answer only from the provided documents.\n"
    "Do not invent facts, names, numbers, or policies. If the documents do not contain "
    "the answer, say so briefly."
)
FAQ_PROMPT = (
    "You are a concise FAQ assistant. Give short, direct answers from the documents.\n"
    "Prefer one or two sentences. If the documents do not contain the answer, say so briefly."
)

_PROMPTS = {
    "helpful": HELPFUL_PROMPT,
    "strict": STRICT_PROMPT,
    "faq": FAQ_PROMPT,
}


def normalize_template(value: Optional[str]) -> str:
    raw = (value or DEFAULT_TEMPLATE).strip().lower()
    return raw if raw in TEMPLATES else DEFAULT_TEMPLATE


def prompt_for(template: Optional[str]) -> str:
    return _PROMPTS[normalize_template(template)]


def prefixed_prompt(template: Optional[str]) -> str:
    return f"__PROMPT__{prompt_for(template)}"
