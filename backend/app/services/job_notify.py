"""Redis wake lists for background jobs. Postgres remains the job record."""
from __future__ import annotations

import logging
from typing import Iterable, List, Optional, Sequence

from .job_roles import ALL_ROLES, role_for_job_type
from .redis_client import get_redis

logger = logging.getLogger(__name__)

KEY_PREFIX = "ragsuite:jobs:"


def list_key(role: str) -> str:
    return f"{KEY_PREFIX}{role}"


def notify_job_id(job_id: str, job_type: str) -> bool:
    client = get_redis()
    if client is None:
        return False
    role = role_for_job_type(job_type)
    try:
        client.rpush(list_key(role), str(job_id))
        return True
    except Exception as exc:
        logger.warning("Redis job notify failed id=%s: %s", job_id, exc)
        return False


def notify_job(job: object) -> bool:
    job_id = getattr(job, "id", None)
    job_type = getattr(job, "job_type", None)
    if job_id is None or not job_type:
        return False
    return notify_job_id(str(job_id), str(job_type))


def brpop_job_id(roles: Sequence[str], timeout: int = 2) -> Optional[str]:
    client = get_redis()
    if client is None:
        return None
    keys = [list_key(role) for role in roles if role in ALL_ROLES]
    if not keys:
        keys = [list_key(role) for role in sorted(ALL_ROLES)]
    try:
        item = client.brpop(keys, timeout=max(1, int(timeout)))
    except Exception as exc:
        logger.warning("Redis BRPOP failed: %s", exc)
        return None
    if not item:
        return None
    return str(item[1])


def rehydrate_ids(entries: Iterable[tuple[str, str]]) -> int:
    """RPUSH existing PENDING job ids. Duplicates are fine (CAS claim)."""
    pushed = 0
    for job_id, job_type in entries:
        if notify_job_id(str(job_id), str(job_type)):
            pushed += 1
    return pushed


def redis_notify_available() -> bool:
    return get_redis() is not None
