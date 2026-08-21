"""Language-aware chat max_tokens adjustments for dense scripts."""
from __future__ import annotations

from typing import Optional

# Dense scripts tokenize more aggressively (Devanagari / CJK / Arabic).
_DENSE_LANGUAGE_PREFIXES = ("hi", "zh", "ar", "ja", "ko", "th")
_DENSE_LANGUAGE_MULTIPLIER = 1.5
_CHAT_MAX_TOKENS_CEILING = 3000


def is_dense_chat_language(language_code: Optional[str]) -> bool:
    if not language_code:
        return False
    code = language_code.strip().lower().replace("_", "-")
    if not code:
        return False
    primary = code.split("-", 1)[0]
    return primary in _DENSE_LANGUAGE_PREFIXES or any(
        code.startswith(f"{p}-") for p in _DENSE_LANGUAGE_PREFIXES
    )


def apply_dense_language_chat_budget(
    chat_max_tokens: int,
    language_code: Optional[str],
    *,
    ceiling: int = _CHAT_MAX_TOKENS_CEILING,
) -> int:
    """Raise chat token budget for dense languages; leave Latin languages unchanged."""
    if chat_max_tokens <= 0 or not is_dense_chat_language(language_code):
        return chat_max_tokens
    boosted = int(round(chat_max_tokens * _DENSE_LANGUAGE_MULTIPLIER))
    return min(boosted, ceiling)
