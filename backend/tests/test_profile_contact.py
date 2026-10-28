"""Country / timezone / E.164 phone helpers."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.services.profile_contact import apply_profile_fields, normalize_phone


def test_indian_ten_digit_phone_formats_e164():
    assert normalize_phone("9876543210", "IN") == "+919876543210"


def test_invalid_phone_is_rejected():
    with pytest.raises(HTTPException) as exc:
        normalize_phone("123", "IN")
    assert exc.value.status_code == 400


def test_apply_profile_fields_ignores_username_and_email():
    user = SimpleNamespace(
        username="old_handle",
        email="old@acme.com",
        first_name=None,
        last_name=None,
        job_title=None,
        bio=None,
        avatar=None,
        login_notifications=True,
        country=None,
        phone_country_code=None,
        timezone=None,
        phone_number=None,
    )
    apply_profile_fields(
        user,
        {
            "username": "changed",
            "email": "new@acme.com",
            "first_name": "Ada",
            "phone_number": "9876543210",
            "country": "IN",
        },
    )
    assert user.username == "old_handle"
    assert user.email == "old@acme.com"
    assert user.first_name == "Ada"
    assert user.country == "IN"
    assert user.phone_number == "+919876543210"


def test_apply_profile_fields_writes_avatar():
    user = SimpleNamespace(avatar=None)
    apply_profile_fields(user, {"avatar": "data:image/png;base64,abc"})
    assert user.avatar == "data:image/png;base64,abc"
