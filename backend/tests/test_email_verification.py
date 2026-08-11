"""Email verification OTP service tests."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, EmailVerificationToken, User
from app.services.email_verification_service import (
    VerificationResult,
    issue_verification_otp,
    resolve_pending_registration,
    verify_email_otp,
    _hash_otp,
)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    user = User(
        username="testuser",
        email="test@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
    )
    session.add(user)
    session.commit()
    yield session
    session.close()


def test_verify_otp_happy_path(db_session):
    user = db_session.query(User).first()
    raw, _row = issue_verification_otp(db_session, user)
    assert len(raw) == 6
    result, verified_user = verify_email_otp(db_session, user.email, raw)
    assert result == VerificationResult.OK
    assert verified_user is not None
    assert verified_user.email_verified_at is not None


def test_verify_otp_wrong_code(db_session):
    user = db_session.query(User).first()
    issue_verification_otp(db_session, user)
    result, _ = verify_email_otp(db_session, user.email, "000000")
    assert result == VerificationResult.INVALID


def test_verify_otp_expired(db_session):
    user = db_session.query(User).first()
    raw, row = issue_verification_otp(db_session, user)
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()
    result, _ = verify_email_otp(db_session, user.email, raw)
    assert result == VerificationResult.EXPIRED


def test_verify_otp_locked_after_max_attempts(db_session):
    user = db_session.query(User).first()
    issue_verification_otp(db_session, user)
    for _ in range(5):
        verify_email_otp(db_session, user.email, "000000")
    result, _ = verify_email_otp(db_session, user.email, "000000")
    assert result == VerificationResult.LOCKED


def test_resolve_pending_registration_resumes_unverified_username(db_session):
    user = db_session.query(User).first()
    pending, conflict = resolve_pending_registration(
        db_session, username=user.username, email=user.email
    )
    assert conflict is None
    assert pending is not None
    assert pending.id == user.id


def test_resolve_pending_registration_blocks_verified_username(db_session):
    user = db_session.query(User).first()
    user.email_verified_at = datetime.now(timezone.utc)
    db_session.commit()
    pending, conflict = resolve_pending_registration(
        db_session, username=user.username, email="other@example.com"
    )
    assert pending is None
    assert conflict == "Username already registered"


def test_resolve_pending_registration_allows_new_signup_after_none(db_session):
    pending, conflict = resolve_pending_registration(
        db_session, username="brandnew", email="brandnew@example.com"
    )
    assert pending is None
    assert conflict is None


def test_otp_stored_as_hash_only(db_session):
    user = db_session.query(User).first()
    raw, row = issue_verification_otp(db_session, user)
    assert row.token_hash == _hash_otp(raw)
    assert row.token_hash != raw
