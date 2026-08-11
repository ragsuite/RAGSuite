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
        "Do not switch languages unless the user explicitly asks for another language."
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
