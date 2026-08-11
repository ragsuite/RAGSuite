"""In-process event bus stub (Platform ownership — Phase 2).

Phase 3+ modules publish/subscribe via this contract; no bus infra yet.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Callable, DefaultDict, List

Handler = Callable[..., Any]

_subscribers: DefaultDict[str, List[Handler]] = defaultdict(list)


def subscribe(event_name: str, handler: Handler) -> None:
    """Register a handler for ``event_name``."""
    _subscribers[event_name].append(handler)


def unsubscribe(event_name: str, handler: Handler) -> None:
    """Remove a previously registered handler (no-op if absent)."""
    handlers = _subscribers.get(event_name)
    if not handlers:
        return
    try:
        handlers.remove(handler)
    except ValueError:
        return


def publish(event_name: str, **payload: Any) -> None:
    """Invoke all handlers for ``event_name`` with keyword payload."""
    for handler in list(_subscribers.get(event_name, ())):
        handler(**payload)


def clear_subscribers() -> None:
    """Test helper — wipe all subscriptions."""
    _subscribers.clear()
