"""Tolerant JSON parsing of model replies (shared by every feature that asks for JSON)."""
from __future__ import annotations

from .chat_translate import _load_json_object as load_json_object

__all__ = ["load_json_object"]
