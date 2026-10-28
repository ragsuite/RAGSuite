"""Strong unique username generation: {stem}_{token} from names/email + org id."""
from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 24

TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
DEFAULT_TOKEN_LENGTH = 6
MAX_TOKEN_LENGTH = 12

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slug_part(value: Optional[str]) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = _NON_ALNUM.sub("_", text)
    return text.strip("_")


def username_stem(
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
) -> str:
    first = slug_part(first_name)
    last = slug_part(last_name)
    if first and last:
        stem = f"{first}_{last}"
    elif first:
        stem = first
    elif last:
        stem = last
    else:
        local = (email or "").split("@", 1)[0]
        stem = slug_part(local)
    return stem or "user"


def username_token(email: str, org_id: Optional[int] = None, length: int = DEFAULT_TOKEN_LENGTH) -> str:
    length = max(DEFAULT_TOKEN_LENGTH, min(MAX_TOKEN_LENGTH, length))
    digest = hashlib.sha256(f"{(email or '').strip().lower()}:{org_id or 0}".encode("utf-8")).digest()
    n = int.from_bytes(digest, "big")
    chars: list[str] = []
    for _ in range(length):
        chars.append(TOKEN_ALPHABET[n % 36])
        n //= 36
    return "".join(chars)


def generate_username(
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
    org_id: Optional[int] = None,
    token_length: int = DEFAULT_TOKEN_LENGTH,
    extra_suffix: str = "",
) -> str:
    token = username_token(email or "", org_id, token_length)
    if extra_suffix:
        token = f"{token}{slug_part(extra_suffix)}"[:MAX_TOKEN_LENGTH]
    stem_budget = USERNAME_MAX_LENGTH - 1 - len(token)
    stem = username_stem(first_name, last_name, email)[: max(1, stem_budget)].rstrip("_")
    if not stem:
        stem = "user"[: max(1, stem_budget)]
    handle = f"{stem}_{token}"
    if len(handle) > USERNAME_MAX_LENGTH:
        handle = handle[:USERNAME_MAX_LENGTH].rstrip("_")
    if len(handle) < USERNAME_MIN_LENGTH:
        handle = (handle + "user")[:USERNAME_MIN_LENGTH]
    return handle.lower()


def username_exists(db: Session, username: str, exclude_user_id: Optional[int] = None) -> bool:
    from app.models import User

    query = db.query(User.id).filter(func.lower(User.username) == username.lower())
    if exclude_user_id is not None:
        query = query.filter(User.id != exclude_user_id)
    return query.first() is not None


def allocate_unique_username(
    db: Session,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
    org_id: Optional[int] = None,
) -> str:
    for extra in range(0, 8):
        candidate = generate_username(
            first_name=first_name,
            last_name=last_name,
            email=email,
            org_id=org_id,
            token_length=DEFAULT_TOKEN_LENGTH + extra,
        )
        if not username_exists(db, candidate):
            return candidate
    for _ in range(8):
        candidate = generate_username(
            first_name=first_name,
            last_name=last_name,
            email=email,
            org_id=org_id,
            extra_suffix=secrets.token_hex(2),
        )
        if not username_exists(db, candidate):
            return candidate
    raise RuntimeError("Unable to allocate a unique username")


def resolve_create_username(
    db: Session,
    *,
    username: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: str,
    org_id: Optional[int] = None,
) -> str:
    """Legacy username-only creates keep the client username; otherwise generate."""
    provided = (username or "").strip()
    has_names = bool((first_name or "").strip() or (last_name or "").strip())
    if provided and not has_names:
        return provided
    return allocate_unique_username(
        db,
        first_name=first_name,
        last_name=last_name,
        email=email,
        org_id=org_id,
    )
