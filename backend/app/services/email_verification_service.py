"""
Email verification OTP lifecycle and resend policy.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from ..models import EmailVerificationToken, User
from ..settings import settings

TOKEN_PURPOSE_SIGNUP = "signup"
TOKEN_PURPOSE_LOGIN_2FA = "login_2fa"


def is_email_verified(user: User) -> bool:
    return user.email_verified_at is not None


def resolve_pending_registration(
    db: Session,
    *,
    username: str,
    email: str,
) -> Tuple[Optional[User], Optional[str]]:
    """
    Decide whether registration can proceed.

    Returns (pending_user, error_detail).
    - pending_user: existing unverified account to update and resend OTP
    - error_detail: human-readable 409 message when registration must be blocked
    - both None: caller should create a new user row
    """
    by_username = db.query(User).filter(User.username == username).first()
    by_email = db.query(User).filter(User.email == email).first()

    if by_username and is_email_verified(by_username):
        return None, "Username already registered"
    if by_email and is_email_verified(by_email):
        return None, "Email already registered"

    if (
        by_username
        and by_email
        and by_username.id != by_email.id
        and not is_email_verified(by_username)
        and not is_email_verified(by_email)
    ):
        return (
            None,
            "This email is already pending verification under a different username. "
            "Sign in with that username, use resend verification, or choose another email.",
        )

    pending = by_username or by_email
    if pending and not is_email_verified(pending):
        return pending, None

    return None, None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_otp(raw_otp: str) -> str:
    return hashlib.sha256(raw_otp.encode("utf-8")).hexdigest()


def _normalize_expires(expires_at: datetime) -> datetime:
    if expires_at.tzinfo is None:
        return expires_at.replace(tzinfo=timezone.utc)
    return expires_at


def _generate_otp() -> str:
    length = max(4, min(8, int(settings.email_verification_otp_length)))
    lower = 10 ** (length - 1)
    upper = (10**length) - 1
    return str(secrets.randbelow(upper - lower + 1) + lower)


def _otp_ttl_minutes() -> int:
    return int(settings.email_verification_otp_ttl_minutes)


def _tokens_for_purpose(db: Session, user_id: int, purpose: str):
    return db.query(EmailVerificationToken).filter(
        EmailVerificationToken.user_id == user_id,
        EmailVerificationToken.purpose == purpose,
    )


def invalidate_unused_tokens(db: Session, user_id: int, *, purpose: str = TOKEN_PURPOSE_SIGNUP) -> None:
    now = _utcnow()
    rows = (
        _tokens_for_purpose(db, user_id, purpose)
        .filter(
            EmailVerificationToken.used_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
        .all()
    )
    for row in rows:
        row.used_at = now
    if rows:
        db.commit()


def _issue_otp(
    db: Session,
    user: User,
    *,
    purpose: str,
    request: Optional[Request] = None,
) -> Tuple[str, EmailVerificationToken]:
    invalidate_unused_tokens(db, user.id, purpose=purpose)

    raw_otp = _generate_otp()
    token_hash = _hash_otp(raw_otp)
    now = _utcnow()
    expires_at = now + timedelta(minutes=_otp_ttl_minutes())

    ip_address = None
    user_agent = None
    if request is not None:
        from ..auth import get_real_ip

        ip_address = get_real_ip(request)
        user_agent = request.headers.get("user-agent")

    row = EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        last_sent_at=now,
        resend_count=0,
        attempt_count=0,
        request_ip=ip_address,
        request_user_agent=user_agent,
        purpose=purpose,
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return raw_otp, row


def issue_verification_otp(
    db: Session,
    user: User,
    *,
    request: Optional[Request] = None,
) -> Tuple[str, EmailVerificationToken]:
    """Create a signup verification OTP; invalidates prior unused signup codes."""
    return _issue_otp(db, user, purpose=TOKEN_PURPOSE_SIGNUP, request=request)


def issue_login_2fa_otp(
    db: Session,
    user: User,
    *,
    request: Optional[Request] = None,
) -> Tuple[str, EmailVerificationToken]:
    """Create a login 2FA OTP; invalidates prior unused login codes for this user."""
    return _issue_otp(db, user, purpose=TOKEN_PURPOSE_LOGIN_2FA, request=request)


def _check_resend_allowed(db: Session, user: User, *, purpose: str = TOKEN_PURPOSE_SIGNUP) -> None:
    now = _utcnow()
    cooldown = timedelta(seconds=settings.email_verification_resend_cooldown_seconds)
    day_ago = now - timedelta(days=1)

    recent = (
        _tokens_for_purpose(db, user.id, purpose)
        .order_by(EmailVerificationToken.created_at.desc())
        .limit(1)
        .first()
    )
    if recent and recent.last_sent_at:
        last_sent = _normalize_expires(recent.last_sent_at)
        if now - last_sent < cooldown:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before requesting another verification code.",
            )

    sends_today = (
        _tokens_for_purpose(db, user.id, purpose)
        .filter(EmailVerificationToken.created_at >= day_ago)
        .count()
    )
    if sends_today >= settings.email_verification_resend_max_per_day:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification emails requested. Try again later.",
        )


def request_resend_verification(
    db: Session,
    email: str,
    *,
    request: Request,
) -> Tuple[Optional[str], Optional[EmailVerificationToken], Optional[User]]:
    user = db.query(User).filter(User.email == email).first()
    if not user or is_email_verified(user):
        return None, None, None

    _check_resend_allowed(db, user, purpose=TOKEN_PURPOSE_SIGNUP)
    raw_otp, row = issue_verification_otp(db, user, request=request)
    row.resend_count = (row.resend_count or 0) + 1
    db.commit()
    db.refresh(row)
    return raw_otp, row, user


def request_login_2fa_resend(
    db: Session,
    user: User,
    *,
    request: Optional[Request] = None,
) -> Tuple[str, EmailVerificationToken]:
    _check_resend_allowed(db, user, purpose=TOKEN_PURPOSE_LOGIN_2FA)
    raw_otp, row = issue_login_2fa_otp(db, user, request=request)
    row.resend_count = (row.resend_count or 0) + 1
    db.commit()
    db.refresh(row)
    return raw_otp, row


class VerificationResult:
    INVALID = "invalid"
    EXPIRED = "expired"
    REUSED = "reused"
    LOCKED = "locked"
    OK = "ok"


def _normalize_otp_input(code: str) -> str:
    return "".join(ch for ch in code.strip() if ch.isdigit())


def _verify_otp_for_purpose(
    db: Session,
    *,
    user_id: int,
    code: str,
    purpose: str,
) -> str:
    normalized = _normalize_otp_input(code)
    expected_len = int(settings.email_verification_otp_length)
    if len(normalized) != expected_len:
        return VerificationResult.INVALID

    now = _utcnow()
    row = (
        _tokens_for_purpose(db, user_id, purpose)
        .filter(EmailVerificationToken.used_at.is_(None))
        .order_by(EmailVerificationToken.created_at.desc())
        .first()
    )
    if not row:
        return VerificationResult.INVALID

    max_attempts = int(settings.email_verification_otp_max_attempts)
    if (row.attempt_count or 0) >= max_attempts:
        return VerificationResult.LOCKED

    if _normalize_expires(row.expires_at) < now:
        return VerificationResult.EXPIRED

    submitted_hash = _hash_otp(normalized)
    if not hmac.compare_digest(row.token_hash, submitted_hash):
        row.attempt_count = (row.attempt_count or 0) + 1
        db.commit()
        if row.attempt_count >= max_attempts:
            return VerificationResult.LOCKED
        return VerificationResult.INVALID

    row.used_at = now
    db.commit()
    return VerificationResult.OK


def verify_email_otp(db: Session, email: str, code: str) -> Tuple[VerificationResult, Optional[User]]:
    normalized = _normalize_otp_input(code)
    expected_len = int(settings.email_verification_otp_length)
    if len(normalized) != expected_len:
        return VerificationResult.INVALID, None

    user = db.query(User).filter(User.email == email).first()
    if not user:
        return VerificationResult.INVALID, None

    if is_email_verified(user):
        return VerificationResult.REUSED, None

    result = _verify_otp_for_purpose(
        db, user_id=user.id, code=code, purpose=TOKEN_PURPOSE_SIGNUP
    )
    if result != VerificationResult.OK:
        return result, None

    user.email_verified_at = _utcnow()
    db.commit()
    db.refresh(user)
    return VerificationResult.OK, user


def verify_login_2fa_otp(db: Session, user_id: int, code: str) -> str:
    """Verify login 2FA email code without changing email verification status."""
    return _verify_otp_for_purpose(
        db, user_id=user_id, code=code, purpose=TOKEN_PURPOSE_LOGIN_2FA
    )


def issue_verification_token(db: Session, user: User, *, request: Optional[Request] = None):
    return issue_verification_otp(db, user, request=request)


def verification_error_detail(result: str) -> str:
    if result == VerificationResult.EXPIRED:
        return "Verification code has expired. Please request a new one."
    if result == VerificationResult.REUSED:
        return "This email address is already verified."
    if result == VerificationResult.LOCKED:
        return "Too many incorrect attempts. Please request a new verification code."
    return "Invalid verification code."


def login_2fa_error_detail(result: str) -> str:
    if result == VerificationResult.EXPIRED:
        return "Sign-in code has expired. Please request a new code."
    if result == VerificationResult.LOCKED:
        return "Too many incorrect attempts. Please request a new sign-in code."
    return "Invalid sign-in code. Check your email for the current code."
