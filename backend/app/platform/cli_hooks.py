"""CLI lifecycle hooks placeholder (Platform — Phase 2).

The published CLI (``cli/``) orchestrates processes; Platform owns hooks the
CLI may call later (status, doctor probes, extension listing). No behavior
change in Phase 2 — documentation + empty registry only.
"""
from __future__ import annotations

from typing import Any, Callable, Dict

Hook = Callable[..., Any]

_hooks: Dict[str, Hook] = {}


def register_hook(name: str, fn: Hook) -> None:
    """Register a named lifecycle hook (e.g. ``doctor``, ``status``)."""
    _hooks[name] = fn


def get_hook(name: str) -> Hook | None:
    return _hooks.get(name)


def list_hooks() -> list[str]:
    return sorted(_hooks)
