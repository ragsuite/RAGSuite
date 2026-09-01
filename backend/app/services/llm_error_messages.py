"""Map LLM / provider exceptions to user-safe chat messages (no raw SDK text)."""
from __future__ import annotations

import re


def is_llm_auth_error(exc: BaseException | str) -> bool:
    """True when the provider rejected credentials or model access."""
    lower = str(exc).strip().lower()
    if not lower:
        return False
    if any(
        token in lower
        for token in (
            "401",
            "403",
            "unauthorized",
            "forbidden",
            "access denied",
            "invalid api key",
            "incorrect api key",
            "invalid_api_key",
            "authentication_error",
            "permission",
        )
    ):
        return True
    return False


def format_llm_error_for_user(exc: BaseException | str) -> str:
    """
    Turn provider errors (OpenAI 429 concurrent, rate limits, etc.) into
    messages suitable for chat UI. Never return raw 'Error: ... (status code: 429)'.
    """
    raw = str(exc).strip()
    # Strip common prefixes from RAG stream path
    raw = re.sub(r"^error:\s*", "", raw, flags=re.IGNORECASE).strip()
    lower = raw.lower()

    if "429" in lower or "rate limit" in lower or "too many requests" in lower:
        if "concurrent" in lower:
            return (
                "The AI service is handling too many requests at once. "
                "Please wait a moment and try again."
            )
        return "You're sending messages too fast. Please wait a moment and try again."

    if "503" in lower or "service unavailable" in lower or "overloaded" in lower:
        return "The AI service is temporarily unavailable. Please try again in a few minutes."

    if is_llm_auth_error(raw):
        return "The AI service credentials are not valid. Please check your model API key in settings."

    if "timeout" in lower or "timed out" in lower:
        return "The AI service took too long to respond. Please try again."

    if "connection" in lower or "network" in lower:
        return "We couldn't reach the AI service. Please try again in a moment."

    if raw and len(raw) < 200 and not lower.startswith("traceback"):
        # Short, non-stacktrace message — still sanitize status-code noise
        if re.search(r"status code:\s*\d+", lower):
            return format_llm_error_for_user(
                re.sub(r"\(status code:\s*\d+\)", "", raw, flags=re.IGNORECASE).strip()
                or "request failed"
            )

    return "Sorry, I couldn't generate a response. Please try again."


def format_embed_error_for_crawl(exc: BaseException | str) -> str:
    """User-facing crawl/indexing error text (embedding providers)."""
    raw = str(exc).strip()
    lower = raw.lower()

    if "429" in lower or "rate limit" in lower or "rate_limited" in lower or "too many requests" in lower:
        return (
            "Embedding service is busy (rate limit). "
            "The crawl will wait and continue automatically when the service is ready."
        )

    if "503" in lower or "overloaded" in lower or "service unavailable" in lower:
        return (
            "Embedding service is temporarily unavailable. "
            "The crawl will wait and retry automatically."
        )

    if "401" in lower or "403" in lower:
        if "api key" in lower or "authentication" in lower or "unauthorized" in lower:
            return "Embedding API credentials are invalid. Check your API key in model settings."

    if "timeout" in lower or "timed out" in lower:
        return "Embedding service took too long to respond. Try again or increase crawl time limits."

    if "stale crawl job" in lower:
        return "Crawl took too long and was stopped. Increase crawl time limit and try again."

    friendly = format_llm_error_for_user(exc)
    if friendly.startswith("Sorry, I couldn't"):
        if len(raw) <= 180:
            return f"Indexing failed: {raw}"
        return "Indexing failed during embedding. Check job details."
    return friendly
