"""Profile / org username must match sign-in charset rules."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import OrgUserCreate, OrgUserUpdate, UserCreate, UserProfileUpdate


@pytest.mark.parametrize(
    "username",
    ["user-name", "user name", "ab", "a" * 25, "user.name", "User@name", "orgadmin"],
)
def test_profile_update_accepts_username_payload_but_field_is_ignored(username: str):
    out = UserProfileUpdate(username=username)
    assert out.username == username


def test_user_create_rejects_hyphenated_username():
    with pytest.raises(ValidationError):
        UserCreate(username="user-name", email="a@b.co", password="Password1")


def test_org_user_create_rejects_hyphenated_username():
    with pytest.raises(ValidationError):
        OrgUserCreate(username="user-name", email="a@b.co")


def test_user_create_allows_email_only_generated_path():
    out = UserCreate(email="a@b.co", password="Password1")
    assert out.username is None
    assert out.first_name is None


def test_org_user_create_allows_email_only_generated_path():
    out = OrgUserCreate(email="member@acme.com")
    assert out.username is None
    assert out.first_name is None


def test_org_user_update_accepts_ignored_username_and_email():
    out = OrgUserUpdate(username="user-name", email="not-an-email")
    assert out.username == "user-name"
    assert out.email == "not-an-email"
