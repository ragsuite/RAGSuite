"""
User profile API routes
"""
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..auth import get_current_user_required, verify_password, get_password_hash, create_access_token
from ..schemas import (
    UserProfileUpdate, UserProfileResponse, PasswordChange,
    TwoFactorSetupResponse, TwoFactorVerifyRequest, TwoFactorDisableRequest,
    TwoFactorEmailEnableRequest, TwoFactorStatusResponse, BackupCodesResponse
)
from ..models import User, UserSession
from ..services.notification_service import create_notification
from ..services.audit_service import emit_audit
from ..services.two_factor_service import (
    generate_totp_secret, generate_qr_code, generate_backup_codes,
    store_backup_codes, verify_totp_code, verify_backup_code,
    remove_used_backup_code
)
from ..security_utils import encrypt_secret, safe_decrypt_secret

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/user", tags=["User Profile"])


def _two_factor_status(user: User) -> TwoFactorStatusResponse:
    return TwoFactorStatusResponse(
        is_2fa_enabled=user.is_2fa_enabled,
        has_backup_codes=bool(user.backup_codes),
        email_2fa_enabled=user.email_2fa_enabled,
    )


def _disable_totp_fields(user: User) -> None:
    user.is_2fa_enabled = False
    user.totp_secret = None
    user.backup_codes = None


def _disable_email_2fa(user: User) -> None:
    user.email_2fa_enabled = False

@router.get("/profile", response_model=UserProfileResponse, status_code=status.HTTP_200_OK)
async def get_user_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get current user's profile information.
    Email is included but is static and cannot be changed.
    """
    # Expire all objects in session cache to force fresh read from database
    # This ensures we get the latest data even if the user object was cached
    db.expire_all()
    
    # Explicitly query the user from the database to ensure we get fresh data
    # This prevents issues with stale session data after updates
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Force refresh to ensure we have the absolute latest data from database
    db.refresh(user)
    
    return UserProfileResponse(
        id=user.id,
        username=user.username,
        email=user.email,  # Email is read-only, returned from database
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        last_login=user.last_login,
        job_title=getattr(user, 'job_title', None),
        department=getattr(user, 'department', None),
        phone_number=getattr(user, 'phone_number', None),
        location=getattr(user, 'location', None),
        timezone=getattr(user, 'timezone', None),
        bio=getattr(user, 'bio', None),
        avatar=getattr(user, 'avatar', None),
        login_notifications=getattr(user, 'login_notifications', True)  # Default to True if not set
    )

@router.put("/profile", response_model=UserProfileResponse, status_code=status.HTTP_200_OK)
async def update_user_profile(
    profile_data: UserProfileUpdate,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Update user's profile information.
    Email address is static and cannot be changed - it will be ignored if provided.
    Email uniqueness is enforced at the database level based on user ID.
    """
    # Email is NOT in UserProfileUpdate schema, so it cannot be updated
    # This ensures email remains static
    
    # Track if username is being changed (needed to generate new token)
    username_changed = False
    old_username = current_user.username
    
    # Update username if provided
    if profile_data.username is not None and profile_data.username != current_user.username:
        # Check if the new username already exists (excluding current user)
        existing_user = db.query(User).filter(
            User.username == profile_data.username,
            User.id != current_user.id
        ).first()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken"
            )
        
        current_user.username = profile_data.username
        username_changed = True
    
    # Update profile fields if provided
    # Handle both None and empty strings - empty strings should clear the field (set to None)
    if profile_data.job_title is not None:
        current_user.job_title = profile_data.job_title if profile_data.job_title else None
    if profile_data.department is not None:
        current_user.department = profile_data.department if profile_data.department else None
    if profile_data.phone_number is not None:
        current_user.phone_number = profile_data.phone_number if profile_data.phone_number else None
    if profile_data.location is not None:
        current_user.location = profile_data.location if profile_data.location else None
    if profile_data.timezone is not None:
        current_user.timezone = profile_data.timezone if profile_data.timezone else None
    if profile_data.bio is not None:
        current_user.bio = profile_data.bio if profile_data.bio else None
    if profile_data.avatar is not None:
        current_user.avatar = profile_data.avatar if profile_data.avatar else None
    if profile_data.login_notifications is not None:
        current_user.login_notifications = profile_data.login_notifications
    
    try:
        # Flush changes to database before commit to ensure they're persisted
        db.flush()
        db.commit()
        
        # Expire all objects in the session to force fresh reads
        db.expire_all()
        
        # Re-query the user with a fresh query to ensure we get the latest data
        # This bypasses any identity map caching
        updated_user = db.query(User).filter(User.id == current_user.id).first()
        if not updated_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found after update"
            )
        
        # Explicitly refresh to ensure we have the absolute latest data
        db.refresh(updated_user)
        current_user = updated_user
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update profile for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update profile"
        )
    
    logger.info(f"Updated profile for user {current_user.id}")
    
    # Create notification for profile update (especially if username changed)
    try:
        if username_changed:
            create_notification(
                db=db,
                user_id=current_user.id,
                title="Profile Updated",
                message=f"Your username has been changed from '{old_username}' to '{current_user.username}'. A new login token has been generated.",
                type="info",
                action_url="/profile"
            )
        else:
            # Only notify if significant changes were made
            changes_made = any([
                profile_data.job_title is not None,
                profile_data.department is not None,
                profile_data.avatar is not None,
                profile_data.bio is not None
            ])
            if changes_made:
                create_notification(
                    db=db,
                    user_id=current_user.id,
                    title="Profile Updated",
                    message="Your profile has been updated successfully.",
                    type="success",
                    action_url="/profile"
                )
    except Exception as notif_error:
        logger.warning(f"Failed to create profile update notification: {notif_error}")
    
    # Generate new session + token if username was changed so old JTI is revoked
    new_access_token = None
    if username_changed:
        from ..settings import settings as _settings
        # Create new session with fresh JTI
        new_jti = str(uuid.uuid4())
        user_agent = request.headers.get("user-agent", "")
        ip_address = request.client.host if request.client else "unknown"
        expires_at = datetime.utcnow() + timedelta(minutes=_settings.jwt_expire_minutes)
        new_session = UserSession(
            user_id=current_user.id,
            token_jti=new_jti,
            device_info=user_agent[:255] if user_agent else None,
            ip_address=ip_address,
            location="Unknown Location",
            user_agent=user_agent,
            expires_at=expires_at,
            last_activity=datetime.utcnow(),
        )
        db.add(new_session)
        db.commit()

        new_access_token = create_access_token(data={"sub": current_user.username}, jti=new_jti)

        # Set new httpOnly cookie so browser uses new token immediately
        response.set_cookie(
            key="access_token",
            value=new_access_token,
            httponly=True,
            secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
            samesite="lax",
            max_age=_settings.jwt_expire_minutes * 60,
            path="/",
        )
        logger.info(f"New session created for user {current_user.id} after username change from '{old_username}' to '{current_user.username}'")
    
    # Return profile with email from database (static/immutable)
    return UserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,  # Email is always from database, never from request
        is_active=current_user.is_active,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        job_title=getattr(current_user, 'job_title', None),
        department=getattr(current_user, 'department', None),
        phone_number=getattr(current_user, 'phone_number', None),
        location=getattr(current_user, 'location', None),
        timezone=getattr(current_user, 'timezone', None),
        bio=getattr(current_user, 'bio', None),
        avatar=getattr(current_user, 'avatar', None),
        login_notifications=getattr(current_user, 'login_notifications', True),  # Default to True if not set
        access_token=new_access_token,
        token_type="bearer" if new_access_token else None
    )

@router.put("/profile/password", status_code=status.HTTP_200_OK)
async def change_password(
    password_data: PasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Change user's password.
    Requires current password verification for security.
    """
    # Verify that new password and confirm password match
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirm password do not match"
        )
    
    # Verify current password
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect"
        )
    
    # Check that new password is different from current password
    if verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )
    
    # Hash and update password
    current_user.hashed_password = get_password_hash(password_data.new_password)

    # Revoke all active sessions so old tokens stop working immediately
    db.query(UserSession).filter(
        UserSession.user_id == current_user.id,
        UserSession.is_active == True
    ).update({"is_active": False})

    db.commit()
    db.refresh(current_user)
    
    logger.info(f"Password changed for user {current_user.id}")
    
    # Create notification for password change
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Password Changed",
            message="Your password has been changed successfully. If you didn't make this change, please contact support immediately.",
            type="warning",
            action_url="/profile"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create password change notification: {notif_error}")

    emit_audit(
        event_type="auth.password.changed",
        request=request,
        user_id=current_user.id,
        summary="Password changed",
    )

    return {"message": "Password updated successfully"}


# ============================================================================
# TWO-FACTOR AUTHENTICATION ENDPOINTS
# ============================================================================

@router.get("/2fa/status", response_model=TwoFactorStatusResponse, status_code=status.HTTP_200_OK)
async def get_2fa_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Get current 2FA status for the user.
    """
    has_backup_codes = bool(current_user.backup_codes)
    
    return _two_factor_status(current_user)


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse, status_code=status.HTTP_200_OK)
async def setup_2fa(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Setup 2FA for the user.
    Generates a new TOTP secret and QR code.
    This does NOT enable 2FA - user must verify the code first.
    """
    # Check if 2FA is already enabled
    if current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled. Disable it first to set up a new secret."
        )

    if current_user.email_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email-based 2FA is enabled. Disable it first to set up authenticator 2FA.",
        )
    
    # Generate new TOTP secret
    secret = generate_totp_secret()
    logger.info(f"Generated TOTP secret for user {current_user.id} (secret length: {len(secret)})")
    
    # Store secret encrypted (don't enable 2FA yet)
    current_user.totp_secret = encrypt_secret(secret)
    db.commit()
    db.refresh(current_user)

    # Verify secret was stored
    if not current_user.totp_secret or safe_decrypt_secret(current_user.totp_secret) != secret:
        logger.error(f"CRITICAL: TOTP secret was not stored correctly for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to store 2FA secret. Please try again."
        )
    
    logger.info(f"✅ TOTP secret stored successfully for user {current_user.id}")
    
    # Generate QR code
    qr_code_url = generate_qr_code(secret, current_user.username)
    
    # Generate backup codes
    backup_codes = generate_backup_codes()
    hashed_backup_codes = store_backup_codes(backup_codes)
    
    # Store backup codes temporarily (will be saved when 2FA is verified)
    current_user.backup_codes = hashed_backup_codes
    db.commit()
    
    logger.info(f"2FA setup initiated for user {current_user.id} - QR code and backup codes generated")

    emit_audit(
        event_type="auth.2fa.setup_started",
        request=request,
        user_id=current_user.id,
        summary="2FA setup started",
    )
    
    return TwoFactorSetupResponse(
        secret=secret,
        qr_code_url=qr_code_url,
        backup_codes=backup_codes
    )


@router.post("/2fa/verify", response_model=TwoFactorStatusResponse, status_code=status.HTTP_200_OK)
async def verify_and_enable_2fa(
    verify_data: TwoFactorVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Verify TOTP code and enable 2FA.
    User must have called /2fa/setup first to get a secret.
    """
    # Check if secret exists
    if not current_user.totp_secret:
        logger.warning(f"2FA verification attempted but no secret found for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No 2FA secret found. Please set up 2FA first."
        )
    
    # Check if 2FA is already enabled
    if current_user.is_2fa_enabled:
        logger.warning(f"2FA verification attempted but 2FA already enabled for user {current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled."
        )
    
    logger.info(f"Verifying 2FA setup code for user {current_user.id}")
    _totp_plain = safe_decrypt_secret(current_user.totp_secret)
    logger.info(f"Secret length: {len(_totp_plain)}, Code length: {len(verify_data.code)}")

    # Verify TOTP code (use valid_window=2 to account for clock drift)
    if not verify_totp_code(_totp_plain, verify_data.code, valid_window=2):
        logger.error(f"2FA setup verification failed for user {current_user.id} - invalid code")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid TOTP code. Please check your authenticator app and try again. Make sure you're using the current 6-digit code."
        )
    
    logger.info(f"✅ 2FA setup code verified successfully for user {current_user.id}")
    
    # Enable 2FA (mutually exclusive with email 2FA)
    _disable_email_2fa(current_user)
    current_user.is_2fa_enabled = True
    db.commit()
    db.refresh(current_user)
    
    # Verify the secret is still stored after commit
    if not current_user.totp_secret:
        logger.error(f"CRITICAL: TOTP secret was lost after commit for user {current_user.id}")
    else:
        logger.info(f"✅ 2FA enabled and secret confirmed stored for user {current_user.id} (secret length: {len(current_user.totp_secret)})")
    
    logger.info(f"2FA enabled for user {current_user.id}")
    
    # Create notification
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="2FA Enabled",
            message="Two-factor authentication has been enabled for your account. Your account is now more secure.",
            type="success",
            action_url="/settings?tab=security"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create 2FA enabled notification: {notif_error}")

    emit_audit(
        event_type="auth.2fa.enabled",
        request=request,
        user_id=current_user.id,
        summary="2FA enabled",
    )
    
    has_backup_codes = bool(current_user.backup_codes)
    
    return TwoFactorStatusResponse(
        is_2fa_enabled=True,
        has_backup_codes=has_backup_codes,
        email_2fa_enabled=False,
    )


@router.post("/2fa/disable", response_model=TwoFactorStatusResponse, status_code=status.HTTP_200_OK)
async def disable_2fa(
    disable_data: TwoFactorDisableRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Disable 2FA for the user.
    Requires password verification and optionally TOTP code if 2FA is enabled.
    """
    # Verify password
    if not verify_password(disable_data.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password"
        )
    
    # If 2FA is enabled, require TOTP code
    if current_user.is_2fa_enabled:
        if not disable_data.code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TOTP code is required to disable 2FA"
            )
        
        # Try TOTP code first
        if current_user.totp_secret and verify_totp_code(safe_decrypt_secret(current_user.totp_secret), disable_data.code, valid_window=2):
            # TOTP code is valid
            pass
        # Try backup code
        elif current_user.backup_codes and verify_backup_code(disable_data.code, current_user.backup_codes):
            # Backup code is valid - remove it
            updated_codes = remove_used_backup_code(disable_data.code, current_user.backup_codes)
            current_user.backup_codes = updated_codes
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid TOTP code or backup code"
            )
    
    # Disable 2FA and clear secret
    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    current_user.backup_codes = None
    db.commit()
    db.refresh(current_user)
    
    logger.info(f"2FA disabled for user {current_user.id}")
    
    # Create notification
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="2FA Disabled",
            message="Two-factor authentication has been disabled for your account. Your account security has been reduced.",
            type="warning",
            action_url="/settings?tab=security"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create 2FA disabled notification: {notif_error}")

    emit_audit(
        event_type="auth.2fa.disabled",
        request=request,
        user_id=current_user.id,
        summary="2FA disabled",
    )
    
    return TwoFactorStatusResponse(
        is_2fa_enabled=False,
        has_backup_codes=False,
        email_2fa_enabled=current_user.email_2fa_enabled,
    )


@router.post("/2fa/email/enable", response_model=TwoFactorStatusResponse, status_code=status.HTTP_200_OK)
async def enable_email_2fa(
    body: TwoFactorEmailEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Enable email-based 2FA (mutually exclusive with TOTP 2FA)."""
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    if current_user.email_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email-based 2FA is already enabled.",
        )

    _disable_totp_fields(current_user)
    current_user.email_2fa_enabled = True
    db.commit()
    db.refresh(current_user)

    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Email 2FA Enabled",
            message="Email-based two-factor authentication has been enabled. You'll receive a code by email when signing in.",
            type="success",
            action_url="/settings?tab=security",
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create email 2FA enabled notification: {notif_error}")

    emit_audit(
        event_type="auth.2fa.email.enabled",
        request=request,
        user_id=current_user.id,
        summary="Email 2FA enabled",
    )

    return _two_factor_status(current_user)


@router.post("/2fa/email/disable", response_model=TwoFactorStatusResponse, status_code=status.HTTP_200_OK)
async def disable_email_2fa(
    body: TwoFactorEmailEnableRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Disable email-based 2FA."""
    if not verify_password(body.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    if not current_user.email_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email-based 2FA is not enabled.",
        )

    _disable_email_2fa(current_user)
    db.commit()
    db.refresh(current_user)

    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Email 2FA Disabled",
            message="Email-based two-factor authentication has been disabled for your account.",
            type="warning",
            action_url="/settings?tab=security",
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create email 2FA disabled notification: {notif_error}")

    emit_audit(
        event_type="auth.2fa.email.disabled",
        request=request,
        user_id=current_user.id,
        summary="Email 2FA disabled",
    )

    return _two_factor_status(current_user)


@router.post("/2fa/backup-codes", response_model=BackupCodesResponse, status_code=status.HTTP_200_OK)
async def regenerate_backup_codes(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Generate new backup codes for 2FA.
    Replaces existing backup codes.
    """
    # Check if 2FA is enabled
    if not current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled. Please enable 2FA first."
        )
    
    # Generate new backup codes
    backup_codes = generate_backup_codes()
    hashed_backup_codes = store_backup_codes(backup_codes)
    
    # Store new backup codes
    current_user.backup_codes = hashed_backup_codes
    db.commit()
    
    logger.info(f"Backup codes regenerated for user {current_user.id}")
    
    # Create notification
    try:
        create_notification(
            db=db,
            user_id=current_user.id,
            title="Backup Codes Regenerated",
            message="New backup codes have been generated. Please save them securely. Old backup codes are no longer valid.",
            type="info",
            action_url="/settings?tab=security"
        )
    except Exception as notif_error:
        logger.warning(f"Failed to create backup codes notification: {notif_error}")

    emit_audit(
        event_type="auth.2fa.backup_codes.regenerated",
        request=request,
        user_id=current_user.id,
        summary="2FA backup codes regenerated",
    )
    
    return BackupCodesResponse(backup_codes=backup_codes)

