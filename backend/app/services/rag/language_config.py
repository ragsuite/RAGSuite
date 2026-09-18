"""Chat/search response language — maps admin UI codes to prompt instructions."""

from typing import Optional

# Matches Chatbot Configuration language dropdown (+ legacy codes).
CHATBOT_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "en-gb": "English (UK)",
    "hi": "Hindi",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "ar": "Arabic",
    "pt": "Portuguese (Brazil)",
    "zh": "Chinese (Simplified)",
    # Legacy / search extras
    "ja": "Japanese",
    "it": "Italian",
    "ru": "Russian",
}

_SUPPORTED_REQUEST = frozenset(
    {
        "en",
        "en-gb",
        "hi",
        "es",
        "fr",
        "de",
        "ar",
        "pt",
        "zh",
        "ja",
        "it",
        "ru",
    }
)


def normalize_request_language(language_code: Optional[str]) -> Optional[str]:
    """Normalize optional per-request language; returns None when missing/unsupported."""
    if language_code is None or not str(language_code).strip():
        return None
    key = str(language_code).strip().lower().replace("_", "-")
    if key in {"en-us", "en"}:
        return "en"
    if key in {"en-uk"}:
        return "en-gb"
    if key in {"pt-br", "pt"}:
        return "pt"
    if key in {"zh-cn", "zh-hans", "zh"}:
        return "zh"
    if key in _SUPPORTED_REQUEST:
        return key
    base = key.split("-", 1)[0]
    if base in _SUPPORTED_REQUEST:
        return base
    return None


def resolve_language_preference(
    request_language: Optional[str],
    settings_language: Optional[str],
) -> Optional[str]:
    """Prefer visitor/request language over admin settings; never mutates settings."""
    from_request = normalize_request_language(request_language)
    if from_request:
        return from_request
    if settings_language and str(settings_language).strip():
        return str(settings_language).strip()
    return None


def resolve_language_name(language_code: str) -> str:
    """Human-readable language name for prompt instructions."""
    key = language_code.strip().lower().replace("_", "-")
    if key in CHATBOT_LANGUAGE_NAMES:
        return CHATBOT_LANGUAGE_NAMES[key]
    if key.startswith("zh"):
        return CHATBOT_LANGUAGE_NAMES["zh"]
    if key.startswith("pt"):
        return CHATBOT_LANGUAGE_NAMES["pt"]
    if key.startswith("en"):
        return CHATBOT_LANGUAGE_NAMES["en-gb"] if "gb" in key else CHATBOT_LANGUAGE_NAMES["en"]
    return language_code.strip()


def _is_english_code(language_code: str) -> bool:
    key = language_code.strip().lower().replace("_", "-")
    return key == "en" or key == "en-gb" or key.startswith("en-")


def build_language_instruction(language_code: Optional[str]) -> str:
    """Strong reply-language rule for RAG prompts. Empty when code is missing."""
    if not language_code or not str(language_code).strip():
        return ""
    code = str(language_code).strip()
    language_name = resolve_language_name(code)
    base = (
        f" LANGUAGE: You MUST write your entire answer in {language_name}. "
        "Do not switch languages unless the user explicitly asks for another language. "
        "If CONVERSATION HISTORY or the user's question is in a different language, "
        f"rewrite the answer fully into {language_name} — never copy prior-turn wording "
        "in another language."
    )
    if _is_english_code(code):
        return (
            f"{base} "
            "If the user's latest question is clearly not in English, reply in the same "
            "language as the user's question instead of English. "
            "When the configured language is English and the user's question is in English, "
            "translate document content into English. "
            "Do not include foreign-language words in brackets when answering in English. "
            "Keep only universal proper nouns such as CASTOR."
        )
    return (
        f"{base} "
        "Short quotes from DOCUMENTS may stay in their original language when necessary."
    )
