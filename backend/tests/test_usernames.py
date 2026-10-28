"""Strong username generator: stem + email-bound token."""
from __future__ import annotations

from app.services.usernames import (
    USERNAME_MAX_LENGTH,
    allocate_unique_username,
    generate_username,
    resolve_create_username,
    slug_part,
    username_stem,
    username_token,
)


def test_slug_strips_accents_and_punctuation():
    assert slug_part("José María") == "jose_maria"
    assert slug_part("Hitesh-Chauhan!") == "hitesh_chauhan"


def test_cjk_stem_falls_back_to_email_local_part():
    assert username_stem("李", "娜", "hitesh.c@acme.com") == "hitesh_c"


def test_email_only_uses_local_part_stem():
    handle = generate_username(email="hitesh.chauhan@acme.com", org_id=1)
    assert handle.startswith("hitesh_chauhan_")
    assert handle.count("_") >= 2
    assert len(handle) <= USERNAME_MAX_LENGTH
    token = handle.rsplit("_", 1)[-1]
    assert len(token) == 6
    assert token.isalnum()


def test_same_names_different_emails_get_different_tokens():
    a = generate_username("Hitesh", "Chauhan", "hitesh.chauhan@acme.com", org_id=1)
    b = generate_username("Hitesh", "Chauhan", "hitesh.c@acme.com", org_id=1)
    assert a != b
    assert a.startswith("hitesh_chauhan_")
    assert b.startswith("hitesh_chauhan_")


def test_token_is_deterministic_for_email_and_org():
    assert username_token("a@b.co", 3) == username_token("A@B.CO", 3)
    assert username_token("a@b.co", 3) != username_token("a@b.co", 4)


def test_plain_admin_is_never_generated():
    handle = generate_username(email="admin@acme.com", org_id=9)
    assert handle != "admin"
    assert handle.startswith("admin_")


def test_extended_token_still_fits_max_length():
    handle = generate_username(
        first_name="Hiteshveryverylongfirstname",
        last_name="Chauhanveryverylonglastname",
        email="hitesh.chauhan@acme.com",
        org_id=1,
        token_length=10,
    )
    assert len(handle) <= USERNAME_MAX_LENGTH
    assert "_" in handle


def test_allocate_extends_token_instead_of_sequential_suffix(monkeypatch):
    seen: list[str] = []

    def fake_exists(_db, username: str, exclude_user_id=None) -> bool:
        seen.append(username)
        return len(seen) == 1

    monkeypatch.setattr("app.services.usernames.username_exists", fake_exists)
    handle = allocate_unique_username(None, email="admin@acme.com", org_id=1)
    assert handle == seen[1]
    assert not handle.endswith("2")
    assert "admin_2" not in seen
    first_token = seen[0].rsplit("_", 1)[-1]
    second_token = seen[1].rsplit("_", 1)[-1]
    assert len(second_token) == len(first_token) + 1


def test_legacy_username_kept_when_no_names(monkeypatch):
    monkeypatch.setattr("app.services.usernames.username_exists", lambda *args, **kwargs: False)
    assert (
        resolve_create_username(None, username="custom_admin", email="a@b.co") == "custom_admin"
    )


def test_names_trigger_generation_even_if_username_sent(monkeypatch):
    monkeypatch.setattr("app.services.usernames.username_exists", lambda *args, **kwargs: False)
    handle = resolve_create_username(
        None,
        username="custom_admin",
        first_name="Hitesh",
        last_name="Chauhan",
        email="hitesh.chauhan@acme.com",
        org_id=1,
    )
    assert handle.startswith("hitesh_chauhan_")
    assert handle != "custom_admin"
