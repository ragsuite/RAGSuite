"""Profile / org username must match sign-in charset rules."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import OrgUserCreate, UserCreate, UserProfileUpdate


@pytest.mark.parametrize(
    "username",
    ["user-name", "user name", "ab", "a" * 25, "user.name", "User@name"],
)
def test_profile_update_rejects_invalid_usernames(username: str):
    with pytest.raises(ValidationError):
        UserProfileUpdate(username=username)


@pytest.mark.parametrize("username", ["orgadmin", "user_name", "User123", "abc"])
def test_profile_update_accepts_sign_in_compatible_usernames(username: str):
    out = UserProfileUpdate(username=username)
    assert out.username == username


def test_user_create_rejects_hyphenated_username():
    with pytest.raises(ValidationError):
        UserCreate(username="user-name", email="a@b.co", password="Password1")


def test_org_user_create_rejects_hyphenated_username():
    with pytest.raises(ValidationError):
        OrgUserCreate(username="user-name", email="a@b.co")
