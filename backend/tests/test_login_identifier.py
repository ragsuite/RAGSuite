"""Login identifier: @ → email, else username; both case-insensitive."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.platform.auth import find_user_by_login_identifier
from app.models import Base, User


def test_at_sign_looks_up_email_case_insensitive():
    db = MagicMock()
    query = db.query.return_value
    filtered = query.filter.return_value
    filtered.first.return_value = object()
    find_user_by_login_identifier(db, "Person@Acme.COM")
    db.query.assert_called_once_with(User)
    clause = query.filter.call_args[0][0]
    assert "email" in str(clause).lower()


def test_plain_identifier_looks_up_username():
    db = MagicMock()
    query = db.query.return_value
    filtered = query.filter.return_value
    filtered.first.return_value = object()
    find_user_by_login_identifier(db, "OrgAdmin")
    db.query.assert_called_once_with(User)
    clause = query.filter.call_args[0][0]
    assert "username" in str(clause).lower()


def test_sqlite_lookup_is_case_insensitive_for_username_and_email():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(
        User(
            username="OrgAdmin",
            email="Admin@Acme.COM",
            hashed_password="x" * 60,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
    )
    session.commit()
    by_name = find_user_by_login_identifier(session, "orgadmin")
    by_email = find_user_by_login_identifier(session, "admin@acme.com")
    assert by_name is not None
    assert by_email is not None
    assert by_name.id == by_email.id
    session.close()
    engine.dispose()
