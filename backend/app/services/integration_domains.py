"""
Per-project allowed domains for IntegrationEmbed.keys JSON.

Storage shape (domains only; keys / publicId remain user-level):

{
  "keys": [...],
  "chatbot_domains": [...],   # legacy flat — kept as fallback, not deleted
  "search_domains": [...],
  "by_project": {
    "<project-uuid>": {
      "chatbot_domains": [...],
      "search_domains": [...]
    }
  }
}
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Literal, Optional, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

DomainKind = Literal["chatbot", "search", "both"]


def _as_dict(keys: Any) -> dict[str, Any]:
    if isinstance(keys, dict):
        return dict(keys)
    if isinstance(keys, list):
        return {"keys": keys}
    return {}


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for entry in value:
        if isinstance(entry, str):
            text = entry.strip()
        elif isinstance(entry, dict):
            text = str(entry.get("normalizedUrl") or entry.get("hostname") or "").strip()
        else:
            text = str(entry).strip() if entry is not None else ""
        if not text or text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def _project_key(project_id: UUID | str) -> str:
    return str(project_id)


def flat_chatbot_domains(keys: Any) -> list[str]:
    data = _as_dict(keys)
    chatbot = _as_str_list(data.get("chatbot_domains"))
    if chatbot:
        return chatbot
    return _as_str_list(data.get("domains"))


def flat_search_domains(keys: Any) -> list[str]:
    data = _as_dict(keys)
    search = _as_str_list(data.get("search_domains"))
    if search:
        return search
    return _as_str_list(data.get("domains"))


def ensure_domains_by_project(
    keys: Any,
    *,
    owned_project_ids: Sequence[UUID | str],
) -> dict[str, Any]:
    """
    One-time migration: if by_project is missing, copy flat domain lists into
    every owned project. Leaves flat lists intact. Idempotent when by_project exists.
    """
    data = _as_dict(keys)
    if isinstance(data.get("by_project"), dict):
        # Ensure structure is a mutable copy; do not re-seed from flat.
        data["by_project"] = dict(data["by_project"])
        return data

    chatbot = flat_chatbot_domains(data)
    search = flat_search_domains(data)
    by_project: dict[str, Any] = {}
    for pid in owned_project_ids:
        by_project[_project_key(pid)] = {
            "chatbot_domains": list(chatbot),
            "search_domains": list(search),
        }
    data["by_project"] = by_project
    # Preserve flat lists as legacy fallback (do not delete).
    if "chatbot_domains" not in data:
        data["chatbot_domains"] = list(chatbot)
    if "search_domains" not in data:
        data["search_domains"] = list(search)
    return data


def ensure_domains_by_project_for_owner(
    keys: Any,
    db: Session,
    owner_id: int,
) -> dict[str, Any]:
    """Load owned project ids and run ensure_domains_by_project."""
    from ..models import Project

    project_ids = [
        row[0]
        for row in db.query(Project.id).filter(Project.owner_id == owner_id).all()
    ]
    return ensure_domains_by_project(keys, owned_project_ids=project_ids)


def get_domains_for_project(
    keys: Any,
    project_id: UUID | str,
    kind: DomainKind = "both",
) -> list[str]:
    """
    Prefer by_project[project_id]; if that bucket is missing, fall back to flat lists
    (pre-migration / unknown project). New empty buckets return [].
    """
    data = _as_dict(keys)
    by_project = data.get("by_project")
    pid = _project_key(project_id)

    if isinstance(by_project, dict) and pid in by_project:
        bucket = by_project.get(pid) or {}
        if not isinstance(bucket, dict):
            bucket = {}
        chatbot = _as_str_list(bucket.get("chatbot_domains"))
        search = _as_str_list(bucket.get("search_domains"))
    elif isinstance(by_project, dict):
        # Migrated store but this project has no bucket yet → empty (do not inherit flat).
        chatbot = []
        search = []
    else:
        chatbot = flat_chatbot_domains(data)
        search = flat_search_domains(data)

    if kind == "chatbot":
        return chatbot
    if kind == "search":
        return search

    # both
    merged: list[str] = []
    seen: set[str] = set()
    for d in chatbot + search:
        if d not in seen:
            seen.add(d)
            merged.append(d)
    return merged


def get_project_domain_lists(
    keys: Any,
    project_id: UUID | str,
) -> tuple[list[str], list[str]]:
    """Return (chatbot_domains, search_domains) for a project."""
    data = _as_dict(keys)
    by_project = data.get("by_project")
    pid = _project_key(project_id)

    if isinstance(by_project, dict) and pid in by_project:
        bucket = by_project.get(pid) or {}
        if not isinstance(bucket, dict):
            bucket = {}
        return (
            _as_str_list(bucket.get("chatbot_domains")),
            _as_str_list(bucket.get("search_domains")),
        )
    if isinstance(by_project, dict):
        return [], []
    return flat_chatbot_domains(data), flat_search_domains(data)


def set_domains_for_project(
    keys: Any,
    project_id: UUID | str,
    *,
    chatbot_domains: Optional[list[str]] = None,
    search_domains: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Update only this project's domain bucket. Preserves other projects and top-level keys.
    Creates an empty bucket if missing (post-migration new project).
    """
    data = _as_dict(keys)
    by_project = data.get("by_project")
    if not isinstance(by_project, dict):
        by_project = {}
    else:
        by_project = dict(by_project)

    pid = _project_key(project_id)
    existing = by_project.get(pid) if isinstance(by_project.get(pid), dict) else {}
    bucket = {
        "chatbot_domains": (
            _as_str_list(chatbot_domains)
            if chatbot_domains is not None
            else _as_str_list(existing.get("chatbot_domains"))
        ),
        "search_domains": (
            _as_str_list(search_domains)
            if search_domains is not None
            else _as_str_list(existing.get("search_domains"))
        ),
    }
    by_project[pid] = bucket
    data["by_project"] = by_project
    return data


def append_domains_for_project(
    keys: Any,
    project_id: UUID | str,
    domains: Sequence[str],
    *,
    to_chatbot: bool = True,
    to_search: bool = True,
) -> tuple[dict[str, Any], list[str], list[str]]:
    """
    Append domains to the project bucket. Returns (keys, added_chatbot, added_search).
    """
    chatbot, search = get_project_domain_lists(keys, project_id)
    # If store was never migrated, get_project_domain_lists may return flat lists —
    # callers should run ensure_domains_by_project first.
    chatbot = list(chatbot)
    search = list(search)
    added_chatbot: list[str] = []
    added_search: list[str] = []
    for domain in domains:
        text = str(domain).strip()
        if not text:
            continue
        if to_chatbot and text not in chatbot:
            chatbot.append(text)
            added_chatbot.append(text)
        if to_search and text not in search:
            search.append(text)
            added_search.append(text)
    updated = set_domains_for_project(
        keys,
        project_id,
        chatbot_domains=chatbot,
        search_domains=search,
    )
    return updated, added_chatbot, added_search


def clone_keys_preserving_api_keys(keys: Any) -> dict[str, Any]:
    """Deep-copy keys JSON for safe mutation."""
    return deepcopy(_as_dict(keys))
