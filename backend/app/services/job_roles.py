"""Map background job types onto worker roles (crawl / index / sync / misc)."""
from __future__ import annotations

from typing import FrozenSet, Iterable, Optional

from ..models import BackgroundJobType

ROLE_CRAWL = "crawl"
ROLE_INDEX = "index"
ROLE_SYNC = "sync"
ROLE_MISC = "misc"
ALL_ROLES: FrozenSet[str] = frozenset({ROLE_CRAWL, ROLE_INDEX, ROLE_SYNC, ROLE_MISC})

CRAWL_TYPES: FrozenSet[str] = frozenset(
    {
        BackgroundJobType.CRAWL.value,
        BackgroundJobType.CRAWL_FETCH.value,
    }
)
INDEX_TYPES: FrozenSet[str] = frozenset(
    {
        BackgroundJobType.DOCUMENT_INGEST.value,
        BackgroundJobType.DOCUMENT_PARSE.value,
        BackgroundJobType.DOCUMENT_EMBED.value,
        BackgroundJobType.CRAWL_INGEST_BATCH.value,
        BackgroundJobType.REINDEX.value,
        BackgroundJobType.DATA_FOLDER_INGEST.value,
    }
)
SYNC_TYPES: FrozenSet[str] = frozenset(
    {
        BackgroundJobType.CONNECTOR_SYNC.value,
        BackgroundJobType.GMAIL_SYNC.value,
    }
)

_ROLE_TYPES = {
    ROLE_CRAWL: CRAWL_TYPES,
    ROLE_INDEX: INDEX_TYPES,
    ROLE_SYNC: SYNC_TYPES,
}


def role_for_job_type(job_type: str) -> str:
    kind = (job_type or "").strip()
    if kind in CRAWL_TYPES:
        return ROLE_CRAWL
    if kind in INDEX_TYPES:
        return ROLE_INDEX
    if kind in SYNC_TYPES:
        return ROLE_SYNC
    return ROLE_MISC


def parse_worker_roles(raw: Optional[str]) -> FrozenSet[str]:
    text = (raw or "all").strip().lower()
    if not text or text in {"all", "*"}:
        return ALL_ROLES
    parts = {part.strip() for part in text.split(",") if part.strip()}
    return frozenset(part for part in parts if part in ALL_ROLES) or ALL_ROLES


def job_types_for_roles(roles: Iterable[str]) -> FrozenSet[str]:
    wanted = set(roles)
    if not wanted or wanted >= ALL_ROLES:
        return frozenset()
    types: set[str] = set()
    for role in wanted:
        if role == ROLE_MISC:
            continue
        types.update(_ROLE_TYPES.get(role, ()))
    if ROLE_MISC in wanted:
        return frozenset(types | {"__misc__"})
    return frozenset(types)


def job_type_allowed(job_type: str, roles: Iterable[str]) -> bool:
    role_set = frozenset(roles)
    if not role_set or role_set >= ALL_ROLES:
        return True
    role = role_for_job_type(job_type)
    return role in role_set
