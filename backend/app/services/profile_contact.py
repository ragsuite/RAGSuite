"""Country / timezone / E.164 phone helpers for profile updates."""
from __future__ import annotations

import re
from typing import Optional
from zoneinfo import available_timezones

from fastapi import HTTPException, status

_ISO2 = re.compile(r"^[A-Z]{2}$")
_TIMEZONES = None


def _timezone_set() -> set[str]:
    global _TIMEZONES
    if _TIMEZONES is None:
        _TIMEZONES = available_timezones()
    return _TIMEZONES


def blank_to_none(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = str(value).strip()
    return trimmed or None


def normalize_country(value: Optional[str]) -> Optional[str]:
    raw = blank_to_none(value)
    if raw is None:
        return None
    code = raw.upper()
    if not _ISO2.match(code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid country")
    return code


def normalize_timezone(value: Optional[str]) -> Optional[str]:
    raw = blank_to_none(value)
    if raw is None:
        return None
    if raw not in _timezone_set():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid timezone")
    return raw


def apply_profile_fields(user, data: dict) -> None:
    """Apply writable profile fields. Ignores username, email, and location."""
    if "first_name" in data:
        user.first_name = blank_to_none(data.get("first_name"))
    if "last_name" in data:
        user.last_name = blank_to_none(data.get("last_name"))
    if "job_title" in data:
        user.job_title = blank_to_none(data.get("job_title"))
    if "bio" in data:
        user.bio = blank_to_none(data.get("bio"))
    if "avatar" in data:
        user.avatar = data.get("avatar") if data.get("avatar") else None
    if "login_notifications" in data and data.get("login_notifications") is not None:
        user.login_notifications = bool(data.get("login_notifications"))

    if "country" in data:
        user.country = normalize_country(data.get("country"))
    if "phone_country_code" in data:
        user.phone_country_code = normalize_country(data.get("phone_country_code"))
    elif "country" in data:
        user.phone_country_code = user.country

    if "timezone" in data:
        user.timezone = normalize_timezone(data.get("timezone"))

    if "phone_number" in data:
        region = user.phone_country_code or user.country
        user.phone_number = normalize_phone(data.get("phone_number"), region)


def normalize_phone(number: Optional[str], country: Optional[str]) -> Optional[str]:
    raw = blank_to_none(number)
    if raw is None:
        return None
    try:
        import phonenumbers
    except ImportError as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Phone validation is unavailable",
        ) from exc
    region = country.upper() if country else None
    try:
        parsed = phonenumbers.parse(raw, region)
    except phonenumbers.NumberParseException as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid phone number") from exc
    if not phonenumbers.is_valid_number(parsed):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid phone number")
    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
