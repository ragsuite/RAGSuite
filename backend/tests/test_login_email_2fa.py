"""Login email 2FA OTP service tests."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, User
from app.services.email_verification_service import (
    TOKEN_PURPOSE_LOGIN_2FA,
    TOKEN_PURPOSE_SIGNUP,
    VerificationResult,
    issue_login_2fa_otp,
    issue_verification_otp,
    verify_email_otp,
    verify_login_2fa_otp,
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
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.commit()
    yield session
    session.close()


def test_login_2fa_otp_verify_happy_path(db_session):
    user = db_session.query(User).first()
    raw, _row = issue_login_2fa_otp(db_session, user)
    assert len(raw) == 6
    assert _row.purpose == TOKEN_PURPOSE_LOGIN_2FA
    result = verify_login_2fa_otp(db_session, user.id, raw)
    assert result == VerificationResult.OK
    assert user.email_verified_at is not None


def test_login_2fa_otp_does_not_consume_signup_tokens(db_session):
    user = db_session.query(User).first()
    user.email_verified_at = None
    db_session.commit()
    signup_raw, _ = issue_verification_otp(db_session, user)
    login_raw, _ = issue_login_2fa_otp(db_session, user)
    assert signup_raw != login_raw
    signup_result, verified = verify_email_otp(db_session, user.email, signup_raw)
    assert signup_result == VerificationResult.OK
    assert verified is not None
    assert verified.email_verified_at is not None
    assert verify_login_2fa_otp(db_session, user.id, login_raw) == VerificationResult.OK


def test_login_2fa_otp_wrong_code(db_session):
    user = db_session.query(User).first()
    issue_login_2fa_otp(db_session, user)
    assert verify_login_2fa_otp(db_session, user.id, "000000") == VerificationResult.INVALID


def test_login_2fa_otp_expired(db_session):
    user = db_session.query(User).first()
    raw, row = issue_login_2fa_otp(db_session, user)
    row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()
    assert verify_login_2fa_otp(db_session, user.id, raw) == VerificationResult.EXPIRED


def test_issue_login_2fa_invalidates_prior_login_tokens_only(db_session):
    user = db_session.query(User).first()
    first_raw, first_row = issue_login_2fa_otp(db_session, user)
    issue_login_2fa_otp(db_session, user)
    assert verify_login_2fa_otp(db_session, user.id, first_raw) == VerificationResult.INVALID
    assert first_row.used_at is not None


def test_signup_tokens_keep_signup_purpose(db_session):
    user = db_session.query(User).first()
    user.email_verified_at = None
    db_session.commit()
    _, row = issue_verification_otp(db_session, user)
    assert row.purpose == TOKEN_PURPOSE_SIGNUP
