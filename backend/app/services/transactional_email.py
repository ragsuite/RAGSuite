"""
Outbound transactional email via SMTP (e.g. Gmail app password).
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from ..settings import settings

logger = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_user
        and settings.smtp_password
        and (settings.email_from or settings.smtp_user)
    )


def _looks_like_placeholder_smtp_value(value: Optional[str]) -> bool:
    """True for smoke/init placeholders that must not be treated as deliverable mail."""
    v = (value or "").strip().lower()
    if not v:
        return True
    if v in {"smoke-smtp@localhost", "ci-smoke-smtp-not-for-production"}:
        return True
    if v.startswith("change-me") or v.startswith("your-smtp-"):
        return True
    return False


def smtp_delivery_ready() -> bool:
    """True when SMTP is configured with non-placeholder credentials that can deliver mail."""
    if not smtp_configured():
        return False
    from_addr = settings.email_from or settings.smtp_user
    return not (
        _looks_like_placeholder_smtp_value(settings.smtp_user)
        or _looks_like_placeholder_smtp_value(settings.smtp_password)
        or _looks_like_placeholder_smtp_value(from_addr)
    )


def _send_smtp_sync(*, to_email: str, subject: str, html_body: str, text_body: str) -> None:
    if not smtp_configured():
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in your .env"
        )

    from_addr = settings.email_from or settings.smtp_user
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as server:
        if settings.smtp_use_tls:
            server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(from_addr, [to_email], msg.as_string())

    logger.info("Transactional email sent to %s (subject=%s)", to_email, subject)


def send_verification_otp_email(
    *, to_email: str, otp_code: str, username: Optional[str] = None
) -> None:
    """Send 6-digit verification code (no link)."""
    display = username or to_email
    ttl = settings.email_verification_otp_ttl_minutes
    subject = f"Your {settings.app_name} verification code"
    text_body = (
        f"Hello {display},\n\n"
        f"Your verification code is: {otp_code}\n\n"
        f"This code expires in {ttl} minutes.\n\n"
        f"Enter this code on the sign-up page to verify your email and continue setup.\n\n"
        f"If you did not create an account, you can ignore this email.\n"
    )
    html_body = (
        f"<p>Hello <strong>{display}</strong>,</p>"
        f"<p>Your verification code is:</p>"
        f'<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{otp_code}</p>'
        f"<p>This code expires in {ttl} minutes.</p>"
        f"<p>Enter this code on the sign-up page to verify your email and continue setup.</p>"
        f"<p>If you did not create an account, you can ignore this email.</p>"
    )
    _send_smtp_sync(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_login_2fa_otp_email(
    *, to_email: str, otp_code: str, username: Optional[str] = None
) -> None:
    """Send login 2FA code (distinct from signup verification copy)."""
    display = username or to_email
    ttl = settings.email_verification_otp_ttl_minutes
    subject = f"Your {settings.app_name} sign-in code"
    text_body = (
        f"Hello {display},\n\n"
        f"Your sign-in verification code is: {otp_code}\n\n"
        f"This code expires in {ttl} minutes.\n\n"
        f"Enter this code on the login page to complete sign-in.\n\n"
        f"If you did not attempt to sign in, change your password immediately.\n"
    )
    html_body = (
        f"<p>Hello <strong>{display}</strong>,</p>"
        f"<p>Your sign-in verification code is:</p>"
        f'<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{otp_code}</p>'
        f"<p>This code expires in {ttl} minutes.</p>"
        f"<p>Enter this code on the login page to complete sign-in.</p>"
        f"<p>If you did not attempt to sign in, change your password immediately.</p>"
    )
    _send_smtp_sync(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_org_invite_email(
    *,
    to_email: str,
    invited_by_username: str,
    organization_name: str,
    setup_url: str,
    username: str,
    temporary_password: str,
    expires_minutes: int,
    role_label: str = "member",
) -> None:
    """Send organization invite email for admin-provisioned users."""
    app_name = settings.app_name
    subject = f"You have been invited to join {organization_name} on {app_name}"
    text_body = (
        f"Hello,\n\n"
        f"{invited_by_username} invited you to join '{organization_name}' as {role_label} in {app_name}.\n\n"
        f"Use the sign-in link below to set your password and access your workspace. You will need these credentials:\n\n"
        f"  Email: {to_email}\n"
        f"  Username: {username}\n"
        f"  Temporary password: {temporary_password}\n\n"
        f"These temporary credentials expire in {expires_minutes} minutes. "
        f"After that, contact your organization administrator for a new invite.\n\n"
        f"Sign in to complete your account setup:\n{setup_url}\n\n"
        f"If you were not expecting this invitation, you can ignore this email.\n"
    )
    html_body = (
        f"<p>Hello,</p>"
        f"<p><strong>{invited_by_username}</strong> invited you to join "
        f"<strong>{organization_name}</strong> as <strong>{role_label}</strong> in {app_name}.</p>"
        f"<p>Use the sign-in link below to set your password and access your workspace. You will need these credentials:</p>"
        f"<ul>"
        f"<li><strong>Email:</strong> {to_email}</li>"
        f"<li><strong>Username:</strong> {username}</li>"
        f"<li><strong>Temporary password:</strong> {temporary_password}</li>"
        f"</ul>"
        f"<p><strong>Security note:</strong> these temporary credentials expire in "
        f"<strong>{expires_minutes} minutes</strong>. After that, contact your organization "
        f"administrator for a new invite.</p>"
        f"<p><a href=\"{setup_url}\">Sign in to complete account setup</a></p>"
        f"<p>If you were not expecting this invitation, you can ignore this email.</p>"
    )
    _send_smtp_sync(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


def send_password_reset_email(
    *,
    to_email: str,
    username: str,
    organization_name: str,
    reset_url: str,
    expires_minutes: int,
) -> None:
    """Send password reset link for active local-auth users."""
    app_name = settings.app_name
    subject = f"Reset your {app_name} password"
    text_body = (
        f"Hello {username},\n\n"
        f"We received a request to reset the password for your {organization_name} workspace on {app_name}.\n\n"
        f"Reset your password using this link (expires in {expires_minutes} minutes):\n{reset_url}\n\n"
        f"If you did not request a password reset, you can ignore this email. "
        f"Your password will not change until you open the link above.\n"
    )
    html_body = (
        f"<p>Hello <strong>{username}</strong>,</p>"
        f"<p>We received a request to reset the password for your "
        f"<strong>{organization_name}</strong> workspace on {app_name}.</p>"
        f"<p><a href=\"{reset_url}\">Reset your password</a></p>"
        f"<p>This link expires in <strong>{expires_minutes} minutes</strong>.</p>"
        f"<p>If you did not request a password reset, you can ignore this email. "
        f"Your password will not change until you use the link above.</p>"
    )
    _send_smtp_sync(
        to_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )
