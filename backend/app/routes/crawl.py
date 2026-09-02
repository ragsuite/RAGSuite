"""

Crawl routes with authentication

"""

import logging
import hashlib
import secrets
import json
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request, Response
from fastapi.responses import JSONResponse

from sqlalchemy.orm import Session
from sqlalchemy import and_, func as sa_func
from sqlalchemy.exc import IntegrityError

from typing import List, Optional

from datetime import datetime, timedelta, timezone

from uuid import UUID
import uuid



from ..db import get_db
from ..settings import settings

from ..models import (
    User,
    CrawlSource,
    CrawlJob,
    Document,
    CrawlJobStatus,
    UserSession,
    Organization,
    Project,
    ProjectMember,
    OrganizationMember,
    InviteStatus,
)
from ..services.crawler import DEFAULT_CRAWL_SETTINGS, get_crawl_content_length_limit



logger = logging.getLogger(__name__)

from ..schemas import (

    CrawlSourceCreate, CrawlSourceUpdate, CrawlSourceOut,
    CrawlIngestEmbeddingTarget,
    CrawlEmbeddedModelOut,
    CrawlEmbeddingTargetOptionsOut,

    CrawlJobEnqueueResponse, CrawlStatusOut,

    PreviewRequest, PreviewOut,

    UserLogin, UserCreate, UserResponse, UserWithToken, Token,

    CrawlSourceStatus, LoginResponse, Login2FARequest, Login2FAResponse,
    Login2FAResendRequest, Login2FAResendResponse,
    RegistrationPendingResponse, VerifyEmailRequest, VerifyEmailResponse,
    ResendVerificationRequest, ResendVerificationResponse,
    PublicAuthConfigOut,
    ForgotPasswordRequest, ForgotPasswordResponse,
    PasswordResetPreviewOut, PasswordResetCompleteIn,

)

from ..auth import (
    get_current_user_required,
    require_email_verified,
    authenticate_user,
    async_authenticate_user,
    create_access_token,
    get_password_hash,
    async_get_password_hash,
    get_device_info,
    get_location_from_ip,
    get_real_ip,
    verify_token as auth_verify_token,
    resolve_active_project,
    verify_password,
)
from ..services.email_verification_service import (
    resolve_pending_registration,
    issue_verification_otp,
    issue_login_2fa_otp,
    request_resend_verification,
    request_login_2fa_resend,
    verify_email_otp,
    verify_login_2fa_otp,
    verification_error_detail,
    login_2fa_error_detail,
    VerificationResult,
)
from ..services.job_queue import enqueue_verification_email
from ..services.transactional_email import (
    send_verification_otp_email,
    send_login_2fa_otp_email,
    send_password_reset_email,
    smtp_delivery_ready,
)
from ..services.onboarding_gate import post_auth_redirect_path
from ..services.auth_session import create_login_session_and_token
from ..services.password_reset import (
    PASSWORD_RESET_EXPIRED_MESSAGE,
    PASSWORD_RESET_GENERIC_SENT_MESSAGE,
    PASSWORD_RESET_INVALID_MESSAGE,
    PASSWORD_RESET_SMTP_NOT_READY_MESSAGE,
    PASSWORD_RESET_SMTP_SEND_FAILED_MESSAGE,
    clear_password_reset_token,
    find_reset_eligible_user_by_email,
    find_user_by_reset_token,
    password_reset_expired,
    resolve_frontend_base,
)
from ..services.org_invite import hash_invite_token
from ..services.org_invite import (
    INVITE_EXPIRED_MESSAGE,
    INVITE_SETUP_REQUIRED_MESSAGE,
    get_pending_invite_membership,
    invite_temp_password_expired,
)
from ..db import SessionLocal
from ..services.two_factor_service import verify_totp_code, verify_backup_code, remove_used_backup_code
from ..security_utils import block_ssrf, safe_decrypt_secret
from ..limiter import limiter
from ..services.crawler import CrawlerOrchestrator
from ..services.audit_service import emit_audit
from ..services.notification_service import create_notification
from ..services.db_vector_consistency import purge_crawl_source_after_db_delete
from ..services.crawl_source_embedding import (
    build_embedding_target_options,
    crawl_create_ingest_targets,
    indexed_embedding_models_for_sources,
    source_has_vectors_in_target_collection,
)



def _parse_ingest_embedding_target(
    value: Optional[object],
) -> Optional[CrawlIngestEmbeddingTarget]:
    if value is None:
        return None
    raw = value.value if isinstance(value, CrawlIngestEmbeddingTarget) else str(value)
    try:
        return CrawlIngestEmbeddingTarget(str(raw).lower())
    except ValueError:
        return None


def _coerce_indexed_models(
    models: Optional[List[dict]],
) -> List[CrawlEmbeddedModelOut]:
    out: List[CrawlEmbeddedModelOut] = []
    for entry in models or []:
        collection = entry.get("collection")
        if not collection:
            continue
        raw_source = entry.get("source")
        source = raw_source if raw_source in ("search", "chat") else None
        out.append(
            CrawlEmbeddedModelOut(
                provider=entry.get("provider"),
                model=entry.get("model"),
                collection=str(collection),
                source=source,
            )
        )
    return out


def _build_crawl_source_out(
    source: CrawlSource,
    current_user: User,
    *,
    latest_job: Optional[CrawlJob] = None,
    pipeline_status: str = "idle",
    is_search_ready: bool = False,
    status_message: str = "",
    progress_percentage: Optional[float] = None,
    indexed_models: Optional[List[dict]] = None,
) -> CrawlSourceOut:
    trained_at = source.trained_at
    if trained_at is not None:
        if trained_at.tzinfo is None:
            trained_at = trained_at.replace(tzinfo=timezone.utc)
        else:
            trained_at = trained_at.astimezone(timezone.utc)

    last_crawl_at = source.last_crawl_at
    if last_crawl_at is not None:
        if last_crawl_at.tzinfo is None:
            last_crawl_at = last_crawl_at.replace(tzinfo=timezone.utc)
        else:
            last_crawl_at = last_crawl_at.astimezone(timezone.utc)

    return CrawlSourceOut(
        id=source.id,
        name=source.name,
        base_url=source.base_url,
        depth=source.depth if source.depth is not None else 3,
        cadence=source.cadence,
        headless_mode=source.headless,
        allowlist=source.allowlist if source.allowlist is not None else [],
        denylist=source.denylist if source.denylist is not None else [],
        skip_header_footer=getattr(source, "skip_header_footer", True),
        rescope_root_links=getattr(source, "rescope_root_links", False),
        description=source.description,
        status=source.status if source.status is not None else CrawlSourceStatus.READY,
        is_active=source.is_active,
        allow_empty_crawl=getattr(source, "allow_empty_crawl", False),
        ingest_embedding_target=_parse_ingest_embedding_target(
            getattr(source, "ingest_embedding_target", None)
        ),
        indexed_embedding_models=_coerce_indexed_models(indexed_models),
        created_at=source.created_at,
        updated_at=source.updated_at,
        last_crawl_at=last_crawl_at,
        documents_count=source.documents_count if source.documents_count is not None else 0,
        trained_at=trained_at,
        pipeline_status=pipeline_status,
        is_search_ready=is_search_ready,
        status_message=status_message,
        created_by=current_user.username,
        latest_job_id=latest_job.id if latest_job else None,
        active_job_id=_active_job_id(latest_job),
        progress_percentage=progress_percentage,
    )


_IN_FLIGHT_JOB_STATUSES = frozenset(
    {
        CrawlJobStatus.PENDING,
        CrawlJobStatus.RUNNING,
        CrawlJobStatus.INDEXING,
        CrawlJobStatus.WAITING,
    }
)


def _is_org_admin(db: Session, user: User) -> bool:
    if user.is_admin:
        return True
    if not user.org_id:
        return False
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == user.org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active == True,
            OrganizationMember.role == "org_admin",
        )
        .first()
    )
    return membership is not None


def _can_manage_project(db: Session, user: User, project_id) -> bool:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return False
    if user.org_id and project.org_id and user.org_id != project.org_id:
        return False
    if project.owner_id == user.id or _is_org_admin(db, user):
        return True
    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project.id, ProjectMember.user_id == user.id)
        .first()
    )
    permissions = member.permissions if member and member.permissions else []
    return "crawl:manage" in permissions or "project:admin" in permissions


def _active_job_id(latest_job: Optional[CrawlJob]) -> Optional[UUID]:
    """Job id only while work is in progress; None when terminal."""
    if latest_job and latest_job.status in _IN_FLIGHT_JOB_STATUSES:
        return latest_job.id
    return None


def _derive_pipeline_state(
    source: CrawlSource,
    latest_job: Optional[CrawlJob],
    *,
    has_target_vectors: bool = False,
) -> tuple[str, bool]:
    """
    Derive user-facing pipeline status from crawl job + training marker.
    """
    if latest_job:
        if latest_job.status == CrawlJobStatus.WAITING:
            return "waiting", False
        if latest_job.status == CrawlJobStatus.PENDING:
            return "queued", False          # real job queued for execution
        if latest_job.status == CrawlJobStatus.RUNNING:
            return "crawling", False
        if latest_job.status == CrawlJobStatus.INDEXING:
            return "indexing", False
        if latest_job.status in (CrawlJobStatus.FAILED, CrawlJobStatus.CANCELLED):
            return "failed", False
        if latest_job.status == CrawlJobStatus.COMPLETED:
            if source.trained_at or has_target_vectors:
                return "ready", True
            # Crawl completed but vectors were never written (0 pages, SSL, etc.)
            return "failed", False

    if source.trained_at or has_target_vectors:
        return "ready", True
    # No jobs have ever been created for this source
    return "idle", False


def _finalize_session_and_notify(
    session_id: int,
    user_id: int,
    ip_address: Optional[str],
    device_info: str,
    previous_last_login,
    login_notifications_enabled: bool,
) -> None:
    """Resolve geolocation and optionally send login notification in background."""
    location = get_location_from_ip(ip_address)
    db = SessionLocal()
    try:
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
        if session:
            session.location = location
            db.commit()

        if login_notifications_enabled:
            should_notify = True
            if previous_last_login:
                time_since_last_login = datetime.now(timezone.utc) - previous_last_login
                should_notify = time_since_last_login.total_seconds() > 300
            if should_notify:
                try:
                    create_notification(
                        db=db,
                        user_id=user_id,
                        title="New Sign-In Detected",
                        message=f"Your account was accessed from {device_info} in {location} ({ip_address}). If this wasn't you, please secure your account immediately.",
                        type="info",
                        action_url="/profile?tab=security"
                    )
                except Exception as e:
                    logger.warning(f"Failed to create login notification for user {user_id}: {e}")
    except Exception as e:
        logger.warning(f"Background session finalize failed for session {session_id}: {e}")
    finally:
        db.close()


def _send_verification_email_task(to_email: str, username: str, raw_otp: str) -> None:
    try:
        send_verification_otp_email(
            to_email=to_email,
            otp_code=raw_otp,
            username=username,
        )
    except Exception as exc:
        logger.exception("Failed to send verification email to %s: %s", to_email, exc)


def _send_login_2fa_email(user: User, raw_otp: str) -> None:
    send_login_2fa_otp_email(
        to_email=user.email,
        otp_code=raw_otp,
        username=user.username,
    )


def _verify_temp_2fa_token(temp_token: str) -> tuple[str, dict]:
    token_result = auth_verify_token(temp_token)
    if hasattr(token_result, "__await__"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unexpected async token verifier",
        )
    username, payload = token_result
    if not payload.get("temp_2fa"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid temporary token. Please log in again.",
        )
    return username, payload


def _schedule_verification_email(
    db: Session,
    *,
    user: User,
    raw_otp: str,
    background_tasks: BackgroundTasks,
) -> None:
    queued = enqueue_verification_email(
        db,
        user_id=user.id,
        to_email=user.email,
        username=user.username,
        raw_otp=raw_otp,
    )
    if not queued:
        background_tasks.add_task(
            _send_verification_email_task,
            user.email,
            user.username,
            raw_otp,
        )


def _create_login_session_and_token(
    request: Request,
    user: User,
    db: Session,
    background_tasks: BackgroundTasks,
) -> tuple[str, UserResponse]:
    from ..settings import settings

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    jti = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")
    ip_address = get_real_ip(request)
    device_info = get_device_info(user_agent)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)

    session = UserSession(
        user_id=user.id,
        token_jti=jti,
        device_info=device_info,
        ip_address=ip_address,
        location="Unknown Location",
        user_agent=user_agent,
        expires_at=expires_at,
        last_activity=datetime.utcnow(),
    )
    db.add(session)

    access_token = create_access_token(data={"sub": user.username}, jti=jti)

    previous_last_login = user.last_login
    user.last_login = datetime.now(timezone.utc)
    user.last_activity = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    login_notifications_enabled = getattr(user, "login_notifications", True)
    background_tasks.add_task(
        _finalize_session_and_notify,
        session.id,
        user.id,
        ip_address,
        device_info,
        previous_last_login,
        login_notifications_enabled,
    )

    return access_token, UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        last_login=user.last_login,
    )


def _has_active_org_admin(db: Session, org_id: int) -> bool:
    admin_membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == org_id,
            OrganizationMember.role == "org_admin",
            OrganizationMember.is_active == True,
        )
        .first()
    )
    return admin_membership is not None


def _bootstrap_org_and_admin(db: Session, user: User) -> None:
    org = db.query(Organization).order_by(Organization.id.asc()).first()
    if not org:
        org = Organization(name="Default Organization", slug="default", registration_enabled=False)
        db.add(org)
        db.flush()

    if _has_active_org_admin(db, org.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is currently disabled.",
        )

    user.org_id = org.id
    user.is_admin = True
    user.auth_provider = "local"

    membership = OrganizationMember(
        org_id=org.id,
        user_id=user.id,
        role="org_admin",
        is_active=True,
        invited_by=None,
        invite_status=InviteStatus.ACCEPTED,
        invite_activated_at=datetime.now(timezone.utc),
        joined_at=datetime.now(timezone.utc),
    )
    db.add(membership)
    org.registration_enabled = False


def _update_session_location(session_id: int, ip_address: Optional[str]) -> None:
    """Resolve geolocation and update session record in background."""
    location = get_location_from_ip(ip_address)
    db = SessionLocal()
    try:
        session = db.query(UserSession).filter(UserSession.id == session_id).first()
        if session:
            session.location = location
            db.commit()
    except Exception as e:
        logger.warning(f"Background location update failed for session {session_id}: {e}")
    finally:
        db.close()


# Create crawl router with prefix

router = APIRouter(prefix="/api/v1/crawl", tags=["Crawl"])



# ============================================================================

# AUTHENTICATION ENDPOINTS

# ============================================================================



@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login_user(request: Request, user_credentials: UserLogin, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Admin authentication - Login user and return access token.
    If 2FA is enabled, returns a temporary token that must be verified.
    """
    user = await async_authenticate_user(db, user_credentials.username, user_credentials.password)

    attempted_user = db.query(User).filter(User.username == user_credentials.username).first()
    if not attempted_user:
        attempted_user = db.query(User).filter(User.email == user_credentials.username).first()

    if attempted_user and not user:
        pending_membership = get_pending_invite_membership(db, attempted_user.id)
        if pending_membership and invite_temp_password_expired(pending_membership):
            emit_audit(
                event_type="auth.login.failed",
                request=request,
                user_id=attempted_user.id,
                status="failure",
                summary=f"Expired invite sign-in for {user_credentials.username}",
                details={"username": user_credentials.username, "invite_expired": True},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVITE_EXPIRED_MESSAGE,
            )

    if not user:
        emit_audit(
            event_type="auth.login.failed",
            request=request,
            user_id=attempted_user.id if attempted_user else None,
            status="failure",
            summary=f"Failed sign-in for username {user_credentials.username}",
            details={
                "username": user_credentials.username,
                "unknown_user": attempted_user is None,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    pending_membership = get_pending_invite_membership(db, user.id)
    if pending_membership:
        if invite_temp_password_expired(pending_membership):
            emit_audit(
                event_type="auth.login.failed",
                request=request,
                user_id=user.id,
                status="failure",
                summary=f"Expired invite sign-in for {user.username}",
                details={"username": user.username, "invite_expired": True},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVITE_EXPIRED_MESSAGE,
            )
        if not user.is_active:
            emit_audit(
                event_type="auth.login.failed",
                request=request,
                user_id=user.id,
                status="failure",
                summary=f"Pending invite setup required for {user.username}",
                details={"username": user.username, "invite_pending": True},
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=INVITE_SETUP_REQUIRED_MESSAGE,
            )

    # Migrate legacy SHA-256 hash to bcrypt on successful login
    if len(user.hashed_password) == 96:
        user.hashed_password = await async_get_password_hash(user_credentials.password)
        db.commit()

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )
    require_email_verified(user)
    
    # Check if 2FA is enabled (TOTP or email-based)
    is_2fa_enabled = getattr(user, 'is_2fa_enabled', False)
    email_2fa_enabled = getattr(user, 'email_2fa_enabled', False)

    if is_2fa_enabled or email_2fa_enabled:
        if email_2fa_enabled:
            raw_otp, _token_row = issue_login_2fa_otp(db, user, request=request)
            try:
                _send_login_2fa_email(user, raw_otp)
            except Exception as exc:
                logger.error("Failed to send login 2FA email for user %s: %s", user.id, exc)
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Unable to send sign-in verification email. Please try again later.",
                ) from exc
            emit_audit(
                event_type="auth.2fa.login_code.sent",
                request=request,
                user_id=user.id,
                summary="Login 2FA code sent by email",
            )

        # User has 2FA enabled - return temporary token for 2FA verification
        # Temporary token expires in 10 minutes (increased from 5 to give users more time)
        temp_jti = str(uuid.uuid4())
        temp_token = create_access_token(
            data={"sub": user.username, "temp_2fa": True},
            expires_delta=timedelta(minutes=10),
            jti=temp_jti
        )
        
        logger.info(f"2FA required for user {user.id}, returning temporary token")
        
        return LoginResponse(
            requires_2fa=True,
            temp_token=temp_token,
            access_token=None,
            token_type=None,
            user=None
        )
    
    # No 2FA - proceed with normal login
    # Create Session
    jti = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")
    ip_address = get_real_ip(request)
    device_info = get_device_info(user_agent)

    from ..settings import settings
    logger.info(f"Creating access token with expiration: {settings.jwt_expire_minutes} minutes ({settings.jwt_expire_minutes / 60 / 24} days)")

    expires_at = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)

    session = UserSession(
        user_id=user.id,
        token_jti=jti,
        device_info=device_info,
        ip_address=ip_address,
        location="Unknown Location",
        user_agent=user_agent,
        expires_at=expires_at,
        last_activity=datetime.utcnow()
    )
    db.add(session)

    access_token = create_access_token(
        data={"sub": user.username},
        jti=jti
    )

    # Store previous last_login to check if this is a new login
    previous_last_login = user.last_login

    user.last_login = datetime.now(timezone.utc)
    user.last_activity = datetime.now(timezone.utc)  # Set initial activity on login

    # Single commit: fewer round-trips and shorter row lock on users
    db.commit()
    db.refresh(session)

    login_notifications_enabled = getattr(user, 'login_notifications', True)
    background_tasks.add_task(
        _finalize_session_and_notify,
        session.id, user.id, ip_address, device_info, previous_last_login, login_notifications_enabled
    )
    emit_audit(
        event_type="auth.login.success",
        request=request,
        user_id=user.id,
        summary=f"User {user.username} signed in",
    )

    response_body = LoginResponse(
        requires_2fa=False,
        temp_token=None,
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            last_login=user.last_login
        )
    )
    response = JSONResponse(content=response_body.model_dump(mode="json"))
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return response


@router.post("/auth/logout")
async def logout_user(response: Response):
    """Clear the httpOnly auth cookie on logout."""
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}


@router.post("/auth/login/verify-2fa", response_model=Login2FAResponse, status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def verify_login_2fa(
    request: Request,
    verify_data: Login2FARequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Verify 2FA code during login and return full access token.
    Requires temporary token from /auth/login endpoint.
    """
    # Verify temporary token
    try:
        username, payload = _verify_temp_2fa_token(verify_data.temp_token)
        logger.info(f"Temporary 2FA token verified for user: {username}")
    except HTTPException as e:
        logger.warning(f"2FA token verification failed (HTTPException): {e.detail}")
        raise
    except Exception as e:
        logger.warning(f"2FA token verification failed: {str(e)}")
        error_detail = str(e).lower()
        if "expired" in error_detail or "exp" in error_detail:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Temporary token has expired. Please log in again to get a new token."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid temporary token. Please log in again."
            )
    
    # Get user
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is inactive"
        )

    require_email_verified(user)
    
    # Check if 2FA is enabled
    email_2fa_enabled = getattr(user, 'email_2fa_enabled', False)
    if not getattr(user, 'is_2fa_enabled', False) and not email_2fa_enabled:
        logger.warning(f"2FA verification attempted but 2FA is not enabled for user {user.id}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled for this account"
        )
    
    # Check if TOTP secret exists
    has_totp_secret = bool(user.totp_secret)
    has_backup_codes = bool(user.backup_codes)
    
    logger.info(f"2FA verification attempt for user {user.id} (username: {username})")
    logger.info(
        f"User 2FA status: totp_enabled={user.is_2fa_enabled}, email_2fa_enabled={email_2fa_enabled}, "
        f"has_totp_secret={has_totp_secret}, has_backup_codes={has_backup_codes}"
    )
    logger.info(f"Code provided: {verify_data.code[:2]}**** (length: {len(verify_data.code)})")
    
    # Verify 2FA code (email OTP, TOTP, or backup code)
    code_valid = False
    verification_method = None
    email_result = None

    if email_2fa_enabled:
        email_result = verify_login_2fa_otp(db, user.id, verify_data.code)
        if email_result == VerificationResult.OK:
            code_valid = True
            verification_method = "email_otp"
            logger.info(f"✅ Email 2FA code verified successfully for user {user.id}")
        else:
            logger.warning(f"❌ Email 2FA verification failed for user {user.id}: {email_result}")
    
    # Try TOTP code first (use valid_window=2 to account for clock drift)
    if not code_valid and user.is_2fa_enabled and user.totp_secret:
        _totp_plain = safe_decrypt_secret(user.totp_secret)
        logger.info(f"Attempting TOTP verification for user {user.id} with secret length: {len(_totp_plain)}")
        try:
            if verify_totp_code(_totp_plain, verify_data.code, valid_window=2):
                code_valid = True
                verification_method = "TOTP"
                logger.info(f"✅ TOTP code verified successfully for user {user.id}")
            else:
                logger.warning(f"❌ TOTP code verification failed for user {user.id} - code mismatch")
        except Exception as e:
            logger.error(f"❌ TOTP verification exception for user {user.id}: {str(e)}")
    elif user.is_2fa_enabled and not user.totp_secret:
        logger.warning(f"User {user.id} has TOTP 2FA enabled but no TOTP secret stored")
    
    # Try backup code if TOTP failed
    if not code_valid and user.backup_codes:
        logger.info(f"Attempting backup code verification for user {user.id}")
        try:
            if verify_backup_code(verify_data.code, user.backup_codes):
                code_valid = True
                verification_method = "backup_code"
                # Remove used backup code
                updated_codes = remove_used_backup_code(verify_data.code, user.backup_codes)
                user.backup_codes = updated_codes
                db.commit()
                logger.info(f"✅ Backup code used successfully for user {user.id}")
            else:
                logger.warning(f"❌ Backup code verification failed for user {user.id}")
        except Exception as e:
            logger.error(f"❌ Backup code verification exception for user {user.id}: {str(e)}")
    
    if not code_valid:
        error_msg = f"2FA verification failed for user {user.id} - invalid code provided"
        if email_2fa_enabled:
            error_msg += " (email 2FA enabled)"
        elif not has_totp_secret and not has_backup_codes:
            error_msg += " (No TOTP secret or backup codes found - 2FA may not be properly configured)"
        logger.error(error_msg)
        emit_audit(
            event_type="auth.login.failed",
            request=request,
            user_id=user.id,
            status="failure",
            summary="2FA verification failed during sign-in",
        )
        detail = login_2fa_error_detail(email_result or VerificationResult.INVALID)
        if email_2fa_enabled:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code. Please check your authenticator app and try again. Make sure you're using the current 6-digit code. If the problem persists, you may need to re-setup 2FA."
        )
    
    logger.info(f"✅ 2FA verification successful for user {user.id} using {verification_method}")
    
    # 2FA verified - create full session and access token
    jti = str(uuid.uuid4())
    user_agent = request.headers.get("user-agent", "")
    ip_address = get_real_ip(request)
        
    device_info = get_device_info(user_agent)

    from ..settings import settings
    expires_at = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)

    session = UserSession(
        user_id=user.id,
        token_jti=jti,
        device_info=device_info,
        ip_address=ip_address,
        location="Unknown Location",
        user_agent=user_agent,
        expires_at=expires_at,
        last_activity=datetime.utcnow()
    )
    db.add(session)

    access_token = create_access_token(
        data={"sub": user.username},
        jti=jti
    )

    # Store previous last_login to check if this is a new login
    previous_last_login = user.last_login

    user.last_login = datetime.now(timezone.utc)
    user.last_activity = datetime.now(timezone.utc)

    db.commit()
    db.refresh(session)

    login_notifications_enabled = getattr(user, 'login_notifications', True)
    background_tasks.add_task(
        _finalize_session_and_notify,
        session.id, user.id, ip_address, device_info, previous_last_login, login_notifications_enabled
    )
    emit_audit(
        event_type="auth.login.success",
        request=request,
        user_id=user.id,
        summary=f"User {user.username} signed in (2FA)",
    )

    logger.info(f"2FA verified successfully for user {user.id}")

    response_body = Login2FAResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
            last_login=user.last_login
        )
    )
    response = JSONResponse(content=response_body.model_dump(mode="json"))
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return response



@router.post("/auth/login/resend-2fa", response_model=Login2FAResendResponse, status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def resend_login_2fa_code(
    request: Request,
    body: Login2FAResendRequest,
    db: Session = Depends(get_db),
):
    """Resend login 2FA email code for an in-progress sign-in."""
    try:
        username, _payload = _verify_temp_2fa_token(body.temp_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Login 2FA resend token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired temporary token. Please log in again.",
        ) from e

    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired temporary token. Please log in again.",
        )

    if not getattr(user, "email_2fa_enabled", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email-based 2FA is not enabled for this account.",
        )

    raw_otp, _row = request_login_2fa_resend(db, user, request=request)
    try:
        _send_login_2fa_email(user, raw_otp)
    except Exception as exc:
        logger.error("Failed to resend login 2FA email for user %s: %s", user.id, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send sign-in verification email. Please try again later.",
        ) from exc

    from ..settings import settings

    emit_audit(
        event_type="auth.2fa.login_code.resend_requested",
        request=request,
        user_id=user.id,
        summary="Login 2FA code resent by email",
    )

    return Login2FAResendResponse(
        message="A new sign-in code has been sent to your email.",
        expires_in_minutes=int(settings.email_verification_otp_ttl_minutes),
    )



@router.post("/auth/logout")
async def logout_user(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Logout user - invalidates the current session"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
             # Decode token to get JTI without verifying expiration
             from jose import jwt
             from ..settings import settings
             # We just need claims so we don't verify signature or expiration to handle all cases
             # But strictly we should verify signature. verify_token does that.
             # However verify_token raises error if expired. Logout should succeed.
             try:
                 payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
             except jwt.ExpiredSignatureError:
                 # If expired, maybe we don't care, but we can still try to get claims
                 payload = jwt.get_unverified_claims(token)
             except Exception:
                 payload = {}
                 
             jti = payload.get("jti")
             if jti:
                 session = db.query(UserSession).filter(UserSession.token_jti == jti).first()
                 if session:
                     session.is_active = False
                     db.commit()
        except Exception as e:
            logger.warning(f"Error revoking session on logout: {e}")

    emit_audit(
        event_type="auth.logout",
        request=request,
        user_id=current_user.id,
        summary=f"User {current_user.username} signed out",
    )
    return {"message": "Successfully logged out"}



@router.get("/auth/verify")
async def verify_auth_token(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """
    Verify token and check inactivity timeout.
    This endpoint triggers the backend's inactivity check (24 hours by default).
    Returns user info if token is valid and user is active.
    Raises 401 if session expired due to inactivity or other auth issues.
    """
    # get_current_user_required already checks:
    # - Token validity
    # - Session is active
    # - Session hasn't expired
    # - User inactivity timeout (via check_and_update_user_activity)
    # So if we reach here, the user is authenticated and active
    
    return {
        "valid": True,
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "email": current_user.email,
        },
        "message": "Token is valid and user is active"
    }



def _is_public_registration_enabled(db: Session, org: Optional[Organization] = None) -> bool:
    """True when env allows public signup and org gate is open (or no org yet / first-admin bootstrap)."""
    if org is None:
        org = db.query(Organization).order_by(Organization.id.asc()).first()
    if org is None:
        return True
    if not _has_active_org_admin(db, org.id):
        return True
    return bool(settings.allow_public_registration and org.registration_enabled)


@router.get("/auth/public-config", response_model=PublicAuthConfigOut)
async def get_public_auth_config(db: Session = Depends(get_db)):
    """Public auth flags for the login/signup UI (no authentication required)."""
    from ..models import OrganizationSsoConfig
    from ..settings import settings as app_settings

    org = db.query(Organization).order_by(Organization.id.asc()).first()
    sso_enabled = False
    if org and app_settings.sso_enabled:
        config = db.query(OrganizationSsoConfig).filter(
            OrganizationSsoConfig.org_id == org.id,
            OrganizationSsoConfig.enabled == True,  # noqa: E712
        ).first()
        sso_enabled = bool(config and config.client_id and config.client_secret_encrypted)
    return PublicAuthConfigOut(
        registration_enabled=_is_public_registration_enabled(db, org),
        sso_enabled=sso_enabled,
        organization_slug=org.slug if org else None,
    )


@router.post("/auth/register", response_model=RegistrationPendingResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_user(request: Request, user_data: UserCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Register a new user; verification email sent — no session until email is verified."""
    pending_user, conflict_detail = resolve_pending_registration(
        db, username=user_data.username, email=user_data.email
    )
    if conflict_detail:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflict_detail,
        )

    org = db.query(Organization).order_by(Organization.id.asc()).first()
    has_org_admin = _has_active_org_admin(db, org.id) if org else False
    public_registration_enabled = _is_public_registration_enabled(db, org)
    invite_membership = None
    if pending_user and pending_user.org_id:
        invite_membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.org_id == pending_user.org_id,
                OrganizationMember.user_id == pending_user.id,
            )
            .first()
        )
    is_pending_invite = bool(invite_membership and invite_membership.invite_status == InviteStatus.PENDING)

    if is_pending_invite:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=INVITE_SETUP_REQUIRED_MESSAGE,
        )

    # Allow: first-admin bootstrap, or explicit public registration.
    if has_org_admin and not public_registration_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is currently disabled.",
        )
    hashed_password = await async_get_password_hash(user_data.password)
    resumed = pending_user is not None

    if pending_user:
        pending_user.username = user_data.username
        pending_user.email = user_data.email
        pending_user.hashed_password = hashed_password
        if settings.disable_email_verification:
            pending_user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(pending_user)
        new_user = pending_user
    else:
        new_user = User(
            username=user_data.username,
            email=user_data.email,
            hashed_password=hashed_password,
            is_active=True,
            is_admin=False,
            org_id=org.id if (has_org_admin and org and public_registration_enabled) else None,
            email_verified_at=(
                datetime.now(timezone.utc) if settings.disable_email_verification else None
            ),
        )
        db.add(new_user)
        if has_org_admin:
            db.flush()
            if org and public_registration_enabled:
                db.add(
                    OrganizationMember(
                        org_id=org.id,
                        user_id=new_user.id,
                        role="member",
                        is_active=True,
                        invited_by=None,
                        invite_status=InviteStatus.ACCEPTED,
                        invite_activated_at=datetime.now(timezone.utc),
                        joined_at=datetime.now(timezone.utc),
                    )
                )
            db.commit()
            db.refresh(new_user)
        else:
            db.flush()

    if pending_user is None and not has_org_admin:
        try:
            _bootstrap_org_and_admin(db, new_user)
            db.commit()
            db.refresh(new_user)
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A bootstrap admin was created concurrently. Please sign in.",
            )

    if settings.disable_email_verification:
        emit_audit(
            event_type="auth.register",
            request=request,
            user_id=new_user.id,
            summary=(
                f"Registration resumed for {new_user.username} (email verification disabled)"
                if resumed
                else f"Account registered for {new_user.username} (email verification disabled)"
            ),
        )
        return RegistrationPendingResponse(
            status="verified",
            message=(
                "Account created. Email verification is off, so you can sign in now."
            ),
            email=new_user.email,
            email_verified=True,
        )

    raw_otp, _token_row = issue_verification_otp(db, new_user, request=request)
    _schedule_verification_email(db, user=new_user, raw_otp=raw_otp, background_tasks=background_tasks)

    emit_audit(
        event_type="auth.register",
        request=request,
        user_id=new_user.id,
        summary=(
            f"Registration resumed for {new_user.username} (pending email verification)"
            if resumed
            else f"Account registered for {new_user.username} (pending email verification)"
        ),
    )
    emit_audit(
        event_type="auth.email_verification.sent",
        request=request,
        user_id=new_user.id,
        summary=f"Verification email queued for {new_user.email}",
    )

    return RegistrationPendingResponse(
        status="pending_verification",
        message=(
            "Verification code sent. Please check your email to verify your address before signing in."
            if resumed
            else "Account created. Please check your email to verify your address before signing in."
        ),
        email=new_user.email,
        email_verified=False,
    )


@router.post("/auth/verify-email", response_model=VerifyEmailResponse)
@limiter.limit("10/minute")
async def verify_email(
    request: Request,
    body: VerifyEmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Validate verification OTP and mark the account as verified; returns session for auto sign-in."""
    result, user = verify_email_otp(db, str(body.email), body.code)

    if result != VerificationResult.OK or not user:
        emit_audit(
            event_type="auth.email_verification.failed",
            request=request,
            user_id=None,
            status="failure",
            summary=f"Email verification failed ({result})",
            details={"reason": result},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=verification_error_detail(result),
        )

    emit_audit(
        event_type="auth.email_verification.verified",
        request=request,
        user_id=user.id,
        summary=f"Email verified for {user.username}",
    )

    access_token, user_response = _create_login_session_and_token(
        request, user, db, background_tasks
    )
    emit_audit(
        event_type="auth.login.success",
        request=request,
        user_id=user.id,
        summary=f"User {user.username} signed in after email verification",
    )

    redirect_to = post_auth_redirect_path(db, user.id)

    response_body = VerifyEmailResponse(
        status="verified",
        message="Email verified successfully. You are now signed in.",
        access_token=access_token,
        token_type="bearer",
        user=user_response,
        redirect_to=redirect_to,
    )
    from ..settings import settings
    response = JSONResponse(content=response_body.model_dump(mode="json"))
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return response


@router.post("/auth/resend-verification", response_model=ResendVerificationResponse)
@limiter.limit("3/minute")
async def resend_verification_email(
    request: Request,
    body: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Resend verification email (rate-limited; does not reveal whether the email exists)."""
    raw_otp, _row, user = request_resend_verification(db, str(body.email), request=request)

    if user and raw_otp:
        _schedule_verification_email(db, user=user, raw_otp=raw_otp, background_tasks=background_tasks)
        emit_audit(
            event_type="auth.email_verification.resend_requested",
            request=request,
            user_id=user.id,
            summary=f"Verification email resend for {user.email}",
        )
        emit_audit(
            event_type="auth.email_verification.sent",
            request=request,
            user_id=user.id,
            summary=f"Verification email queued (resend) for {user.email}",
        )

    return ResendVerificationResponse()


def _send_password_reset_email_now(
    *,
    to_email: str,
    username: str,
    organization_name: str,
    reset_url: str,
) -> None:
    send_password_reset_email(
        to_email=to_email,
        username=username,
        organization_name=organization_name,
        reset_url=reset_url,
        expires_minutes=settings.password_reset_ttl_minutes,
    )


@router.post("/auth/forgot-password", response_model=ForgotPasswordResponse)
@limiter.limit("5/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    """Request a password reset link.

    Returns 503 when SMTP cannot deliver (including smoke/placeholder credentials).
    On success always returns a generic message (no account enumeration).
    """
    if not smtp_delivery_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=PASSWORD_RESET_SMTP_NOT_READY_MESSAGE,
        )

    user = find_reset_eligible_user_by_email(db, str(body.email))
    if user:
        reset_token = secrets.token_urlsafe(32)
        user.password_reset_token_hash = hash_invite_token(reset_token)
        user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.password_reset_ttl_minutes
        )
        db.commit()

        org_name = "RAGSuite"
        role_label = "member"
        if user.org_id:
            org = db.query(Organization).filter(Organization.id == user.org_id).first()
            if org:
                org_name = org.name
            membership = (
                db.query(OrganizationMember)
                .filter(
                    OrganizationMember.org_id == user.org_id,
                    OrganizationMember.user_id == user.id,
                )
                .first()
            )
            if membership:
                role_label = membership.role

        frontend_base = resolve_frontend_base(request)
        reset_url = f"{frontend_base}/reset-password?{urlencode({'token': reset_token})}"
        try:
            _send_password_reset_email_now(
                to_email=user.email,
                username=user.username,
                organization_name=org_name,
                reset_url=reset_url,
            )
        except Exception:
            logger.exception("Failed to send password reset email to %s", user.email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=PASSWORD_RESET_SMTP_SEND_FAILED_MESSAGE,
            )
        emit_audit(
            event_type="auth.password_reset.requested",
            request=request,
            user_id=user.id,
            summary=f"Password reset requested for {user.email}",
            details={"role": role_label},
        )

    return ForgotPasswordResponse(message=PASSWORD_RESET_GENERIC_SENT_MESSAGE)


@router.get("/auth/reset-password", response_model=PasswordResetPreviewOut)
async def preview_password_reset(
    token: str = Query(..., min_length=10),
    db: Session = Depends(get_db),
):
    """Public preview for password reset page."""
    row = find_user_by_reset_token(db, token)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PASSWORD_RESET_INVALID_MESSAGE)
    user, membership, org = row
    expired = password_reset_expired(user)
    if expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=PASSWORD_RESET_EXPIRED_MESSAGE)
    expires_at = user.password_reset_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return PasswordResetPreviewOut(
        username=user.username,
        email=user.email,
        organization_name=org.name,
        role=membership.role,
        expires_at=expires_at or datetime.now(timezone.utc),
        expired=False,
    )


@router.post("/auth/reset-password")
async def complete_password_reset(
    payload: PasswordResetCompleteIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Complete password reset and sign the user in."""
    row = find_user_by_reset_token(db, payload.token)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=PASSWORD_RESET_INVALID_MESSAGE)
    user, membership, org = row
    if password_reset_expired(user):
        clear_password_reset_token(user)
        db.commit()
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=PASSWORD_RESET_EXPIRED_MESSAGE)

    if verify_password(payload.new_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from your current password",
        )

    user.hashed_password = await async_get_password_hash(payload.new_password)
    user.must_change_password = False
    user.is_admin = membership.role == "org_admin"
    if not user.email_verified_at:
        user.email_verified_at = datetime.now(timezone.utc)
    clear_password_reset_token(user)

    db.query(UserSession).filter(
        UserSession.user_id == user.id,
        UserSession.is_active == True,  # noqa: E712
    ).update({"is_active": False})

    db.flush()
    emit_audit(
        event_type="auth.password_reset.completed",
        request=request,
        user_id=user.id,
        summary=f"Password reset completed for {user.username}",
        details={"org_id": org.id, "role": membership.role},
    )

    _, response = create_login_session_and_token(
        request,
        user,
        db,
        background_tasks,
        audit_event="auth.password_reset.login",
        audit_summary=f"Password reset sign-in for {user.username}",
    )
    payload_json = json.loads(response.body.decode("utf-8"))
    payload_json["redirect_path"] = post_auth_redirect_path(db, user.id)

    new_response = JSONResponse(content=payload_json)
    set_cookie = response.headers.get("set-cookie")
    if set_cookie:
        new_response.headers["set-cookie"] = set_cookie
    return new_response



# ============================================================================

# CRAWL SOURCE ENDPOINTS

# ============================================================================


@router.get("/embedding-target-options", response_model=CrawlEmbeddingTargetOptionsOut)
async def get_crawl_embedding_target_options(
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID (defaults to active project)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Return Search/Chat embedding labels for the Add Source form."""
    if not project_id:
        active_project = resolve_active_project(db, current_user)
        if not active_project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No project found. Complete onboarding or create a project first.",
            )
        project_id = active_project.id
    elif not _can_manage_project(db, current_user, project_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")

    payload = build_embedding_target_options(db, project_id)
    return CrawlEmbeddingTargetOptionsOut(**payload)


@router.post("/sites", response_model=CrawlSourceOut, status_code=status.HTTP_201_CREATED)

async def create_crawl_source(

    source_data: CrawlSourceCreate,

    request: Request,

    background_tasks: BackgroundTasks,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """Create a crawl source"""
    
    # Get project_id - use provided or get active project
    project_id = source_data.project_id
    if not project_id:
        active_project = resolve_active_project(db, current_user)
        if active_project:
            project_id = active_project.id
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No project found. Complete onboarding or create a project first.",
            )
    else:
        if not _can_manage_project(db, current_user, project_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Project access denied"
            )

    # SSRF guard: block private/loopback/cloud-metadata addresses before persisting
    block_ssrf(str(source_data.base_url))

    ingest_target = source_data.ingest_embedding_target
    ingest_targets = crawl_create_ingest_targets(
        db,
        project_id,
        ingest_target.value if ingest_target else None,
    )

    logger.debug("Crawl source create — depth: %s (type: %s)", source_data.depth, type(source_data.depth).__name__)
    logger.debug("Crawl source create — source_data: %s", source_data.model_dump())

    created_sources: List[CrawlSource] = []
    for target_surface in ingest_targets:
        source = CrawlSource(
            name=source_data.name,
            base_url=str(source_data.base_url),
            depth=source_data.depth if source_data.depth is not None else 3,
            cadence=source_data.cadence,
            headless=source_data.headless_mode,
            allowlist=source_data.allowlist or [],
            denylist=source_data.denylist or [],
            skip_header_footer=(
                source_data.skip_header_footer
                if source_data.skip_header_footer is not None
                else True
            ),
            rescope_root_links=(
                source_data.rescope_root_links
                if source_data.rescope_root_links is not None
                else False
            ),
            description=source_data.description,
            created_by_id=current_user.id,
            project_id=project_id,
            max_pages=DEFAULT_CRAWL_SETTINGS["max_pages"],
            max_runtime_minutes=DEFAULT_CRAWL_SETTINGS["max_runtime_minutes"],
            max_links_per_page=DEFAULT_CRAWL_SETTINGS["max_links_per_page"],
            content_length_limit=get_crawl_content_length_limit(),
            delay_seconds=DEFAULT_CRAWL_SETTINGS["delay_seconds"],
            ingest_embedding_target=target_surface,
        )
        db.add(source)
        created_sources.append(source)

    try:
        db.commit()
    except Exception as e:
        error_msg = str(e)
        if "project_id" in error_msg and ("does not exist" in error_msg or "UndefinedColumn" in error_msg):
            db.rollback()
            logger.error("Database schema mismatch: project_id column missing from crawl_sources table")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database migration required. Please run 'alembic upgrade head' to add the project_id column to crawl_sources table. Contact your administrator."
            )
        raise

    for source in created_sources:
        db.refresh(source)
        logger.debug("Crawl source stored — id=%s depth=%s target=%s", source.id, source.depth, source.ingest_embedding_target)
        emit_audit(
            event_type="crawl.source.created",
            request=request,
            user_id=current_user.id,
            project_id=source.project_id,
            resource_type="crawl_source",
            resource_id=str(source.id),
            summary=f"Crawl source created: {source.name}",
            background_tasks=background_tasks,
        )

    primary = created_sources[0]
    indexed_models = indexed_embedding_models_for_sources(
        db, primary.project_id, [primary]
    ).get(str(primary.id), [])

    return _build_crawl_source_out(
        primary,
        current_user,
        pipeline_status="idle",
        is_search_ready=False,
        indexed_models=indexed_models,
    )



@router.get("/sites", response_model=List[CrawlSourceOut])

async def list_crawl_sources(

    status_filter: Optional[CrawlSourceStatus] = Query(None),
    project_id: Optional[uuid.UUID] = Query(None, description="Filter by project ID (defaults to active project)"),

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """List crawl sources"""
    
    # Get project_id - use provided or get active project
    if not project_id:
        active_project = resolve_active_project(db, current_user)
        if active_project:
            project_id = active_project.id
        else:
            # If no accessible project, return empty list
            return []

    logger.debug("Listing crawl sources — user: %s (ID: %s), project: %s", current_user.username, current_user.id, project_id)

    

    # Only show crawl sources for this project, sorted by newest first
    
    query = (
        db.query(CrawlSource)
        .filter(
            and_(
                CrawlSource.project_id == project_id
            )
        )
        .order_by(CrawlSource.created_at.desc())
    )

    

    if status_filter:

        query = query.filter(CrawlSource.status == status_filter)

    

    sources = query.all()
    if not _is_org_admin(db, current_user):
        allowed_project_ids = {
            row.project_id
            for row in db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
        }
        allowed_project_ids.update(
            {
                row.id
                for row in db.query(Project.id).filter(Project.owner_id == current_user.id).all()
            }
        )
        if project_id not in allowed_project_ids:
            return []

    

    logger.debug("Found %s crawl sources for user %s (status_filter=%s)", len(sources), current_user.username, status_filter)

    

    from datetime import timezone
    from ..services.crawl_ingest_helpers import (
        batch_document_counts_by_source_ids,
        crawl_progress_percentage,
        crawl_status_message_from_job,
    )

    # Batch-fetch latest job per source (avoids N+1 queries).
    latest_jobs_by_source: dict = {}
    doc_counts_by_source: dict = {}
    if sources:
        source_ids = [s.id for s in sources]
        doc_counts_by_source = batch_document_counts_by_source_ids(db, source_ids)
        latest_job_subq = (
            db.query(
                CrawlJob.source_id,
                sa_func.max(CrawlJob.queued_at).label("max_at"),
            )
            .filter(CrawlJob.source_id.in_(source_ids))
            .group_by(CrawlJob.source_id)
            .subquery()
        )
        latest_jobs_rows = (
            db.query(CrawlJob)
            .join(
                latest_job_subq,
                and_(
                    CrawlJob.source_id == latest_job_subq.c.source_id,
                    CrawlJob.queued_at == latest_job_subq.c.max_at,
                ),
            )
            .all()
        )
        latest_jobs_by_source = {str(j.source_id): j for j in latest_jobs_rows}

    from ..services.reindex_service import embedded_models_by_item_id

    embedded_by_id = embedded_models_by_item_id(
        str(project_id),
        candidate_ids={str(s.id) for s in sources},
    )
    indexed_by_source = indexed_embedding_models_for_sources(
        db, project_id, sources, embedded_by_id=embedded_by_id
    )

    response_sources = []
    healed_sources = False

    for source in sources:
        actual_doc_count = int(doc_counts_by_source.get(source.id, 0))
        if source.documents_count != actual_doc_count:
            source.documents_count = actual_doc_count
            healed_sources = True

        if source.last_crawl_at:
            now_utc = datetime.now(timezone.utc)
            last_crawl_at = source.last_crawl_at
            if last_crawl_at.tzinfo is None:
                last_crawl_at = last_crawl_at.replace(tzinfo=timezone.utc)
            else:
                last_crawl_at = last_crawl_at.astimezone(timezone.utc)
            diff_seconds = (now_utc - last_crawl_at).total_seconds()
            logger.info(
                "Source %s: last_crawl_at=%s, now=%s, diff=%.1f minutes",
                source.name,
                last_crawl_at.isoformat(),
                now_utc.isoformat(),
                diff_seconds / 60,
            )

        latest_job = latest_jobs_by_source.get(str(source.id))
        has_target_vectors = source_has_vectors_in_target_collection(
            db, source, embedded_by_id=embedded_by_id
        )
        if (
            not source.trained_at
            and latest_job
            and latest_job.status == CrawlJobStatus.COMPLETED
            and has_target_vectors
        ):
            source.trained_at = (
                latest_job.finished_at
                or latest_job.started_at
                or datetime.now(timezone.utc)
            )
            healed_sources = True
        pipeline_status, is_search_ready = _derive_pipeline_state(
            source,
            latest_job,
            has_target_vectors=has_target_vectors,
        )
        list_status_message = crawl_status_message_from_job(latest_job) if latest_job else ""

        list_progress: Optional[float] = None
        if latest_job and latest_job.status in (
            CrawlJobStatus.RUNNING,
            CrawlJobStatus.INDEXING,
            CrawlJobStatus.WAITING,
            CrawlJobStatus.PENDING,
        ):
            list_progress = crawl_progress_percentage(
                latest_job, max_pages=source.max_pages
            )

        response_sources.append(
            _build_crawl_source_out(
                source,
                current_user,
                latest_job=latest_job,
                pipeline_status=pipeline_status,
                is_search_ready=is_search_ready,
                status_message=list_status_message,
                progress_percentage=list_progress,
                indexed_models=indexed_by_source.get(str(source.id), []),
            )
        )

    if healed_sources:
        db.commit()

    return response_sources



@router.put("/sites/{source_id}", response_model=CrawlSourceOut)

async def update_crawl_source(

    source_id: UUID,

    source_data: CrawlSourceUpdate,

    request: Request,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """Update a source"""

    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()

    

    if not source or not _can_manage_project(db, current_user, source.project_id):

        raise HTTPException(status_code=404, detail="Source not found")

    if source_data.ingest_embedding_target is not None:
        next_target = source_data.ingest_embedding_target.value
        if next_target == "both":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use separate crawl sources per embedding model. Create a new source with Both models instead of switching an existing source to both.",
            )

    old_ingest_target = (getattr(source, "ingest_embedding_target", None) or "").strip().lower()

    # Update fields if provided

    for field, value in source_data.model_dump(exclude_unset=True).items():

        if field == "base_url":

            block_ssrf(str(value))  # SSRF guard: block private/loopback/metadata addresses
            setattr(source, field, str(value))

        elif field == "headless_mode":

            # Map headless_mode (schema) to headless (model)

            setattr(source, "headless", value)

        elif field == "ingest_embedding_target":

            new_target = value.value if hasattr(value, "value") else value
            setattr(source, field, new_target)
            if (
                source.trained_at is not None
                and old_ingest_target
                and str(new_target).strip().lower() != old_ingest_target
                and not source_has_vectors_in_target_collection(db, source)
            ):
                source.trained_at = None

        else:

            setattr(source, field, value)

    

    source.updated_at = datetime.now(timezone.utc)

    db.commit()

    db.refresh(source)

    emit_audit(
        event_type="crawl.source.updated",
        request=request,
        user_id=current_user.id,
        project_id=source.project_id,
        resource_type="crawl_source",
        resource_id=str(source.id),
        summary=f"Crawl source updated: {source.name}",
    )

    # Handle trained_at timezone
    indexed_models = indexed_embedding_models_for_sources(
        db, source.project_id, [source]
    ).get(str(source.id), [])

    has_target_vectors = source_has_vectors_in_target_collection(db, source)
    pipeline_status, is_search_ready = _derive_pipeline_state(
        source,
        None,
        has_target_vectors=has_target_vectors,
    )

    return _build_crawl_source_out(
        source,
        current_user,
        pipeline_status=pipeline_status,
        is_search_ready=is_search_ready,
        indexed_models=indexed_models,
    )



@router.delete("/sites/{source_id}")

async def delete_crawl_source(

    source_id: UUID,

    request: Request,

    background_tasks: BackgroundTasks,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):
    """Delete a source owned by the current authenticated user."""
    # Enforce ownership: only the creator can delete their crawl source.
    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()

    

    if not source or not _can_manage_project(db, current_user, source.project_id):

        raise HTTPException(status_code=404, detail="Source not found")

    _audit_pid = source.project_id
    _audit_name = source.name

    # Cancel any active crawl jobs before deleting so running threads don't
    # keep writing to records that no longer exist.
    from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
    from ..services.crawler import request_crawl_cancel
    active_crawl_jobs = db.query(CrawlJob).filter(
        CrawlJob.source_id == source_id,
        CrawlJob.status.in_([
            CrawlJobStatus.PENDING, CrawlJobStatus.RUNNING,
            CrawlJobStatus.INDEXING, CrawlJobStatus.WAITING,
        ]),
    ).all()
    for active_job in active_crawl_jobs:
        active_job.status = CrawlJobStatus.CANCELLED
        active_job.finished_at = datetime.now(timezone.utc)
        # Cancel the matching background job so the worker won't pick it up.
        bg = db.query(BackgroundJob).filter(
            BackgroundJob.job_type.in_([BackgroundJobType.CRAWL.value, BackgroundJobType.CRAWL_FETCH.value]),
            BackgroundJob.status.in_([BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]),
            BackgroundJob.payload["crawl_job_id"].as_string() == str(active_job.id),
        ).first()
        if bg:
            bg.status = BackgroundJobStatus.FAILED.value
            bg.error = "Cancelled: crawl source deleted by user"

    # Cancel CRAWL_INGEST_BATCH jobs active during the INDEXING phase.
    ingest_batch_jobs = db.query(BackgroundJob).filter(
        BackgroundJob.job_type == BackgroundJobType.CRAWL_INGEST_BATCH.value,
        BackgroundJob.status.in_([BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]),
        BackgroundJob.payload["source_id"].as_string() == str(source_id),
    ).all()
    for bg in ingest_batch_jobs:
        bg.status = BackgroundJobStatus.FAILED.value
        bg.error = "Cancelled: crawl source deleted by user"

    if active_crawl_jobs or ingest_batch_jobs:
        db.commit()
        # Signal any in-progress crawl thread to stop at next loop iteration.
        request_crawl_cancel(str(source_id))
        logger.info(
            "Cancelled %d crawl job(s) and %d ingest batch job(s) for source %s before deletion",
            len(active_crawl_jobs), len(ingest_batch_jobs), source_id,
        )

    # Delete associated crawl pages in one SQL statement (fast path).
    db.query(Document).filter(Document.source_id == source_id).delete(
        synchronize_session=False
    )

    # Delete associated jobs in one SQL statement.
    db.query(CrawlJob).filter(CrawlJob.source_id == source_id).delete(
        synchronize_session=False
    )

    # Delete the source
    db.delete(source)
    db.commit()

    # Drop coverage / query caches immediately so Compare/Chat ignore deleted ids
    # even if Chroma purge is still running in the background.
    try:
        from ..services.reindex_service import invalidate_item_embedding_coverage_cache

        invalidate_item_embedding_coverage_cache(str(_audit_pid))
    except Exception as cache_exc:
        logger.warning(
            "Coverage cache invalidate after crawl delete failed for %s: %s",
            source_id,
            cache_exc,
        )
    try:
        from ..services.rag.singleton import get_pipeline

        p = get_pipeline()
        if p is not None:
            p.clear_query_cache()
    except Exception as cache_exc:
        logger.warning(
            "Query cache clear after crawl delete failed for %s: %s",
            source_id,
            cache_exc,
        )

    # Vector purge after commit — do not block the HTTP response (can be slow).
    sid = str(source_id)
    uid = current_user.id

    def _purge_crawl_vectors() -> None:
        try:
            ok = purge_crawl_source_after_db_delete(sid, user_id=uid)
            if ok:
                logger.info("Deleted Chroma embeddings for crawl source %s", sid)
            else:
                logger.warning("Chroma deletion may be incomplete for crawl source %s", sid)
        except Exception as e:
            logger.error("Error deleting ChromaDB embeddings for source %s: %s", sid, e)

    background_tasks.add_task(_purge_crawl_vectors)

    emit_audit(
        event_type="crawl.source.deleted",
        request=request,
        user_id=current_user.id,
        project_id=_audit_pid,
        resource_type="crawl_source",
        resource_id=str(source_id),
        summary=f"Crawl source deleted: {_audit_name}",
        background_tasks=background_tasks,
    )

    return {"message": "Source and associated data deleted successfully"}



# ============================================================================

# CRAWL JOB ENDPOINTS

# ============================================================================



@router.post("/start/{source_id}", response_model=CrawlJobEnqueueResponse)

async def start_crawl_job(

    source_id: UUID,

    background_tasks: BackgroundTasks,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """Start a crawl job - returns job_id immediately, crawl runs in background"""

    # Check if source exists and belongs to user

    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()

    

    if not source or not _can_manage_project(db, current_user, source.project_id):

        raise HTTPException(status_code=404, detail="Source not found")

    

    from fastapi.responses import JSONResponse

    from ..services.crawl_orchestration import CrawlStartTrigger, start_crawl_for_source

    result = start_crawl_for_source(
        db,
        source_id,
        user_id=current_user.id,
        trigger=CrawlStartTrigger.MANUAL,
    )

    db.expire_all()

    body = CrawlJobEnqueueResponse(
        job_id=result.job_id,
        queued_at=result.queued_at,
        message=result.message,
        enqueue_status=result.enqueue_status,
    )
    return JSONResponse(
        status_code=result.http_status,
        content=body.model_dump(mode="json"),
    )



@router.get("/status/{job_id}", response_model=CrawlStatusOut)

async def get_crawl_status(

    job_id: UUID,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """Check crawl status"""

    # Refresh session to ensure we see latest data

    db.expire_all()

    

    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()

    if not job:

        # Provide more helpful error message

        user_jobs = db.query(CrawlJob).join(CrawlSource).join(Project, Project.id == CrawlSource.project_id).filter(
            Project.org_id == current_user.org_id
        ).all()

        raise HTTPException(

            status_code=404, 

            detail=f"Job {job_id} not found. You have {len(user_jobs)} total jobs."

        )

    

    # Ensure the user owns the job's source

    source = db.query(CrawlSource).filter(CrawlSource.id == job.source_id).first()

    

    if not source or not _can_manage_project(db, current_user, source.project_id):

        raise HTTPException(status_code=403, detail="Access denied to this crawl job.")

    

    # Calculate progress percentage based on job status (real crawl + index batches)
    from ..services.crawl_ingest_helpers import crawl_progress_percentage
    progress_percentage = crawl_progress_percentage(job, max_pages=source.max_pages)

    

    diagnostics = {}
    if isinstance(job.errors, list):
        for entry in job.errors:
            if isinstance(entry, dict) and entry.get("type") == "crawl_diagnostics":
                diagnostics = entry
                break

    # Get training status from source
    is_trained = source.trained_at is not None
    trained_at = source.trained_at
    has_target_vectors = source_has_vectors_in_target_collection(db, source)
    pipeline_status, is_search_ready = _derive_pipeline_state(
        source,
        job,
        has_target_vectors=has_target_vectors,
    )
    from ..services.crawl_ingest_helpers import crawl_status_message_from_job

    status_message = crawl_status_message_from_job(job)

    return CrawlStatusOut(

        job_id=job.id,

        status=job.status,

        pages_fetched=job.pages_fetched,

        failed_count=diagnostics.get("failed_count", 0),

        skipped_count=diagnostics.get("skipped_count", 0),

        failed_urls=diagnostics.get("failed_urls", []),

        skipped_urls=diagnostics.get("skipped_urls", []),

        crawled_urls=diagnostics.get("crawled_urls", []),

        crawled_urls_total=diagnostics.get("crawled_urls_total", job.pages_fetched or 0),

        progress_percentage=progress_percentage,

        errors=job.errors,

        queued_at=job.queued_at,

        started_at=job.started_at,

        finished_at=job.finished_at,
        
        # Training status
        is_trained=is_trained,
        trained_at=trained_at,
        pipeline_status=pipeline_status,
        is_search_ready=is_search_ready,
        status_message=status_message,

    )



# ============================================================================

# CRAWL PREVIEW ENDPOINT

# ============================================================================



@router.put("/preview", response_model=PreviewOut)

async def preview_crawl(

    preview_data: PreviewRequest,

    db: Session = Depends(get_db),

    current_user: User = Depends(get_current_user_required)

):

    """Preview a URL"""

    try:

        import httpx

        from bs4 import BeautifulSoup



        # Make request to preview URL
        block_ssrf(str(preview_data.url))

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            response = await client.get(str(preview_data.url), headers=headers)

        response.raise_for_status()

        

        # Parse content

        soup = BeautifulSoup(response.content, 'html.parser')

        

        # Extract title

        title = soup.find('title')

        title_text = title.get_text().strip() if title else "No Title Found"

        

        # Extract content

        for script in soup(["script", "style", "nav", "footer", "header"]):

            script.decompose()

        

        content = soup.get_text()

        content = ' '.join(content.split())

        content = content[:2000] if len(content) > 2000 else content

        

        # Count links

        links = soup.find_all('a', href=True)

        links_found = len(links)

        

        return PreviewOut(

            url=preview_data.url,

            html_sample=str(soup)[:5000],

            text_sample=content,

            meta={"title": title_text, "status_code": response.status_code, "links_found": links_found}

        )

        

    except Exception as e:

        raise HTTPException(status_code=400, detail=f"Preview failed: {str(e)}")
