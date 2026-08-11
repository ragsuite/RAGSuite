"""Helpers for masked API keys sent to/from the browser."""
from typing import Optional


def is_masked_api_key(key: Optional[str]) -> bool:
    """True when the value is the first-4 + '...' + last-4 sentinel from GET config."""
    if not key:
        return False
    key = key.strip()
    return "..." in key and len(key) <= 16


def resolve_api_key_for_test(incoming: Optional[str], stored: Optional[str]) -> Optional[str]:
    """
    Use a freshly typed key when provided; otherwise fall back to the stored key.
    Never send the masked sentinel to external providers.
    """
    incoming = (incoming or "").strip()
    if incoming and not is_masked_api_key(incoming):
        return incoming
    if stored and stored.strip():
        return stored.strip()
    return incoming or None
