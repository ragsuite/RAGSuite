"""
JWT authentication helpers with enhanced security
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Header, Query, Cookie
from fastapi import Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import update as _sa_update
from .db import get_db
from ..models import User, APIKey, UserSession, OrganizationMember, ProjectMember, Project
from .settings import settings
from ..services.project_permissions import CONNECTOR_PATH_PREFIXES, has_effective_permission
import logging
import requests

logger = logging.getLogger(__name__)

import hashlib  # kept for legacy SHA-256 migration path only
import hmac
import secrets
import bcrypt as _bcrypt
import uuid

# Security scheme with auto_error=False for custom error handling
security = HTTPBearer(auto_error=False)

# Enhanced security scheme for protected routes
protected_security = HTTPBearer()

# Trusted reverse-proxy IPs — X-Forwarded-For is only accepted from these hosts
_TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def get_real_ip(request: Request) -> Optional[str]:
    """Return real client IP. Trust X-Forwarded-For only from known proxy hosts."""
    client_host = request.client.host if request.client else None
    if client_host in _TRUSTED_PROXIES:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return client_host


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password. Supports bcrypt (current) and legacy SHA-256 format."""
    # Try bcrypt (new hashes start with $2b$)
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        try:
            return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception:
            return False
    # Legacy migration: old format is 32-char hex salt + 64-char sha256 hex = 96 chars
    if len(hashed_password) == 96:
        salt = hashed_password[:32]
        hash_part = hashed_password[32:]
        return hashlib.sha256((plain_password + salt).encode()).hexdigest() == hash_part
    return False


def get_password_hash(password: str) -> str:
    """Hash a password with bcrypt."""
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None, jti: Optional[str] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    if jti:
        to_encode.update({"jti": jti})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def verify_token(token: str):
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        username: str = payload.get("sub")
        if username is None:
            logger.warning("Token verification failed: missing 'sub' claim in token")
            raise HTTPException(status_code=401, detail="Invalid token")
        return username, payload
    except JWTError as e:
        logger.warning(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def authenticate_user(db: Session, username: str, password: str):
    """Authenticate a user by username/email and password"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()

    if not user or not verify_password(password, user.hashed_password):
        return False
    return user


async def async_verify_password(plain_password: str, hashed_password: str) -> bool:
    """Non-blocking bcrypt verify — runs in thread pool."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, verify_password, plain_password, hashed_password)


async def async_get_password_hash(password: str) -> str:
    """Non-blocking bcrypt hash — runs in thread pool."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, get_password_hash, password)


async def async_authenticate_user(db: Session, username: str, password: str):
    """Authenticate user without blocking the event loop during bcrypt."""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    if not user:
        return False
    if not await async_verify_password(password, user.hashed_password):
        return False
    return user

def check_and_update_user_activity(user: User, db: Session) -> None:
    """
    Check if user has been inactive for more than the timeout period.
    If inactive, raise HTTPException. Otherwise, update last_activity.
    
    FIXED: Uses database refresh to ensure we have latest activity timestamp,
    and adds a small grace period to prevent edge cases at the threshold.
    This prevents false logouts and refresh loops.
    """
    current_time = datetime.now(timezone.utc)
    
    # Refresh user from database to get latest last_activity (prevents stale reads)
    # This is critical to prevent race conditions where multiple requests check simultaneously
    try:
        db.refresh(user)
    except Exception as e:
        logger.warning(f"Failed to refresh user from database: {str(e)}")
        # Continue with in-memory user object if refresh fails
    
    # Check inactivity FIRST (before updating)
    if user.last_activity:
        last_activity = user.last_activity
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        
        time_since_activity = current_time - last_activity
        inactivity_timeout = timedelta(minutes=settings.jwt_inactivity_timeout_minutes)
        
        # Add 1 minute grace period to prevent edge cases at exact threshold
        # This prevents false logouts when multiple requests arrive simultaneously
        grace_period = timedelta(minutes=1)
        
        if time_since_activity > (inactivity_timeout + grace_period):
            # Session expired - raise error without updating
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Session expired due to inactivity ({settings.jwt_inactivity_timeout_minutes} minutes)",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # Only update if session is still valid
    # Use a separate transaction to ensure atomicity
    try:
        user.last_activity = current_time
        db.commit()
        # Refresh to confirm update was successful
        db.refresh(user)
    except Exception as e:
        db.rollback()
        logger.error(f"CRITICAL: Failed to update user activity for user {user.id}: {str(e)}")
        # This is critical - if we can't update activity, user will be logged out incorrectly
        # Try one more time with a fresh session
        try:
            db.refresh(user)
            user.last_activity = current_time
            db.commit()
            logger.info(f"Successfully updated user activity on retry for user {user.id}")
        except Exception as retry_error:
            db.rollback()
            logger.error(f"CRITICAL: Retry also failed for user {user.id}: {str(retry_error)}")
            # Don't raise - allow request to proceed, but log as critical error
            # This prevents breaking the app if database has temporary issues

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """Get the current authenticated user (required authentication)"""
    token = credentials.credentials if credentials else access_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        username, payload = verify_token(token)
        jti = payload.get("jti")
        if not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required session identifier. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session = db.query(UserSession).filter(UserSession.token_jti == jti).first()
        if not session or not session.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            session.is_active = False
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session.last_activity = datetime.now(timezone.utc)
        try:
            db.commit()
        except:
            db.rollback()
    except HTTPException as e:
        logger.warning(f"Token verification failed: {e.detail}")
        raise

    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    if user is None:
        logger.warning(f"User not found for username/email: {username}. Token is valid but user doesn't exist in database.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        logger.warning(f"Inactive user attempted to access: {user.id} (username: {user.username})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is inactive"
        )

    # Check inactivity and update last_activity
    try:
        check_and_update_user_activity(user, db)
    except HTTPException as e:
        logger.warning(f"Session expired for user {user.id} (username: {user.username}): {e.detail}")
        raise

    return user

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """Get the current authenticated user (optional authentication)"""
    token = credentials.credentials if credentials else access_token
    if not token:
        return None

    try:
        username, payload = verify_token(token)
    except HTTPException:
        # If token is invalid (expired, etc), treat as unauthenticated for optional endpoints
        return None
    
    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    
    if user and user.is_active:
        # Check inactivity and update last_activity
        try:
            check_and_update_user_activity(user, db)
            return user
        except HTTPException:
             # Session expired - treat as unauthenticated
            return None
            
    return None

async def get_current_user_required(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """Get the current authenticated user (required authentication for protected routes)"""
    token = credentials.credentials if credentials else access_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        username, payload = verify_token(token)
        jti = payload.get("jti")
        if not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required session identifier. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session = db.query(UserSession).filter(UserSession.token_jti == jti).first()
        if not session or not session.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        expires_at = session.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            session.is_active = False
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session.last_activity = datetime.now(timezone.utc)
        try:
            db.commit()
        except:
            db.rollback()
    except HTTPException as e:
        logger.warning(f"Token verification failed: {e.detail}")
        raise

    user = db.query(User).filter(User.username == username).first()
    if not user:
        user = db.query(User).filter(User.email == username).first()
    if user is None:
        logger.warning(f"User not found for username/email: {username}. Token is valid but user doesn't exist in database. User may have been deleted or username changed.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        logger.warning(f"Inactive user attempted to access: {user.id} (username: {user.username})")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is inactive"
        )

    if user.email_verified_at is None:
        logger.warning(f"Unverified user attempted protected access: {user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please verify your email before continuing.",
            headers={"X-Error-Code": "EMAIL_NOT_VERIFIED"},
        )
    
    # Check inactivity and update last_activity
    try:
        check_and_update_user_activity(user, db)
    except HTTPException as e:
        logger.warning(f"Session expired for user {user.id} (username: {user.username}): {e.detail}")
        raise
    
    return user


def require_email_verified(user: User) -> None:
    """Raise if user has not completed email verification."""
    if settings.disable_email_verification:
        return
    if user.email_verified_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please check your inbox or resend the verification email.",
            headers={"X-Error-Code": "EMAIL_NOT_VERIFIED"},
        )


async def get_current_admin_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """Get the current authenticated admin user"""
    user = await get_current_user_required(credentials, db, access_token)
    org_admin_membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.user_id == user.id,
            OrganizationMember.org_id == user.org_id,
            OrganizationMember.is_active == True,
            OrganizationMember.role == "org_admin",
        )
        .first()
    )
    if not user.is_admin and not org_admin_membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return user


async def get_current_org_member(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
):
    """Get active membership for current user in their organization."""
    if not current_user.org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization membership required")
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == current_user.org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.is_active == True,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization membership required")
    return current_user, membership


async def require_org_admin(
    org_member: tuple[User, OrganizationMember] = Depends(get_current_org_member),
):
    """Ensure current user is an active organization admin."""
    user, membership = org_member
    if membership.role != "org_admin" and not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Organization admin access required")
    return user


def is_org_admin_user(db: Session, user: User) -> bool:
    """True when user is a global admin or active org_admin in their organization."""
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


def get_accessible_project_ids(db: Session, user: User) -> list[uuid.UUID]:
    """Return all project IDs a user can access in their org.

    Architecture: one deployment = one organization. Every project belongs to
    that org (org_id set during onboarding step 2 / project create). Org-less
    projects are not part of the product model and are never listed.
    """
    if is_org_admin_user(db, user):
        if not user.org_id:
            return []
        org_rows = db.query(Project.id).filter(Project.org_id == user.org_id).all()
        return list({row[0] for row in org_rows})

    # Pre-org users (before onboarding stamps org) have no org projects yet.
    if not user.org_id:
        return []

    # Org members only see projects explicitly assigned by an admin.
    assigned = (
        db.query(ProjectMember.project_id)
        .join(Project, Project.id == ProjectMember.project_id)
        .filter(
            ProjectMember.user_id == user.id,
            Project.org_id == user.org_id,
        )
        .all()
    )
    return list({row[0] for row in assigned})


def project_permissions_for_user(db: Session, user: User, project: Project) -> Optional[list[str]]:
    """Effective project permissions for a user, or None when access is denied."""
    # One-org architecture: projects without org_id are invalid once the user is in an org.
    if user.org_id is not None and project.org_id is None:
        return None
    if user.org_id and project.org_id and project.org_id != user.org_id:
        return None
    if is_org_admin_user(db, user) and user.org_id and project.org_id == user.org_id:
        return ["project:admin"]
    if project.owner_id == user.id and project.org_id == user.org_id:
        return ["project:admin"]
    if user.is_admin and user.org_id and project.org_id == user.org_id:
        return ["project:admin"]
    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )
    if not membership:
        return None
    return list(membership.permissions or [])


def ensure_project_access(
    db: Session,
    user: User,
    project_id: uuid.UUID,
    *,
    required_permission: Optional[str] = None,
) -> Project:
    """Raise HTTP 403/404 when the user cannot access the project or permission."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    permissions = project_permissions_for_user(db, user, project)
    if permissions is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")
    if required_permission and not has_effective_permission(permissions, required_permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {required_permission}",
        )
    return project


def try_project_access(
    db: Session,
    user: User,
    project_id: uuid.UUID,
    *,
    required_permission: Optional[str] = None,
) -> Optional[Project]:
    """Non-throwing access check for read-only endpoints (returns None on 403)."""
    try:
        return ensure_project_access(db, user, project_id, required_permission=required_permission)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            return None
        raise


def ensure_connector_project_access(db: Session, user: User, project_id: uuid.UUID) -> Project:
    """Connector write/manage routes require connectors:manage (or project:admin)."""
    return ensure_project_access(db, user, project_id, required_permission="connectors:manage")


def try_connector_project_access(db: Session, user: User, project_id: uuid.UUID) -> Optional[Project]:
    """Read-only connector status endpoints return empty/disconnected when permission is missing."""
    return try_project_access(db, user, project_id, required_permission="connectors:manage")


def resolve_scoped_project(
    db: Session,
    user: User,
    project_id: Optional[uuid.UUID],
    *,
    required_permission: Optional[str] = None,
    active_fallback: Optional[Project] = None,
) -> Project:
    """Resolve a project for scoped routes using membership ACL (not owner-only)."""
    if project_id:
        try:
            return ensure_project_access(db, user, project_id, required_permission=required_permission)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found or access denied",
                ) from exc
            raise
    if active_fallback is not None:
        try:
            return ensure_project_access(
                db,
                user,
                active_fallback.id,
                required_permission=required_permission,
            )
        except HTTPException as exc:
            if exc.status_code == status.HTTP_403_FORBIDDEN:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found or access denied",
                ) from exc
            raise
    resolved = resolve_active_project(db, user)
    if not resolved:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied",
        )
    try:
        return ensure_project_access(db, user, resolved.id, required_permission=required_permission)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_403_FORBIDDEN:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found or access denied",
            ) from exc
        raise


def resolve_active_project(db: Session, user: User) -> Optional[Project]:
    """Resolve project context for a user, respecting org/project ACL."""
    from sqlalchemy import and_, not_

    accessible_ids = get_accessible_project_ids(db, user)
    if not accessible_ids:
        return None

    if getattr(user, "active_project_id", None) in accessible_ids:
        preferred = (
            db.query(Project)
            .filter(
                and_(
                    Project.id == user.active_project_id,
                    Project.id.in_(accessible_ids),
                    not_(Project.name.like("__TEMP_ONBOARDING_%")),
                )
            )
            .first()
        )
        if preferred:
            return preferred

    if is_org_admin_user(db, user):
        active_project = (
            db.query(Project)
            .filter(
                and_(
                    Project.id.in_(accessible_ids),
                    Project.is_active == True,
                    not_(Project.name.like("__TEMP_ONBOARDING_%")),
                )
            )
            .first()
        )
        if active_project:
            return active_project
        non_temp = (
            db.query(Project)
            .filter(
                and_(
                    Project.id.in_(accessible_ids),
                    not_(Project.name.like("__TEMP_ONBOARDING_%")),
                )
            )
            .order_by(Project.created_at.asc())
            .first()
        )
        if non_temp:
            return non_temp
    else:
        # Prefer earliest membership. Tie-break on membership id so equal
        # created_at (common on SQLite second-resolution clocks) is stable.
        member_project = (
            db.query(Project)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .filter(
                ProjectMember.user_id == user.id,
                Project.id.in_(accessible_ids),
                not_(Project.name.like("__TEMP_ONBOARDING_%")),
            )
            .order_by(ProjectMember.created_at.asc(), ProjectMember.id.asc())
            .first()
        )
        if member_project:
            return member_project

    # Bootstrap fallback for temporary onboarding projects.
    return db.query(Project).filter(Project.id.in_(accessible_ids)).first()


def ensure_user_active_project(db: Session, user: User) -> Optional[Project]:
    """Resolve the user's active project via ACL.

    Never auto-creates projects. In one-org architecture, the first project is
    created during onboarding (named by the admin) or via explicit project
    create — not as an org-less / default "Main Project".
    """
    return resolve_active_project(db, user)


def set_user_active_project(db: Session, user: User, project: Project) -> Project:
    """Persist the user's workspace project selection."""
    accessible_ids = set(get_accessible_project_ids(db, user))
    if project.id not in accessible_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")

    user.active_project_id = project.id

    # Org admins keep org-wide active flag in sync for legacy clients.
    if is_org_admin_user(db, user) and user.org_id and project.org_id == user.org_id:
        db.query(Project).filter(
            Project.org_id == user.org_id,
            Project.id != project.id,
        ).update({"is_active": False})
        project.is_active = True

    db.commit()
    db.refresh(user)
    db.refresh(project)
    return project


def _extract_project_id(request: Request, query_project_id: Optional[str], header_project_id: Optional[str]) -> Optional[uuid.UUID]:
    candidate = (
        request.path_params.get("project_id")
        or request.path_params.get("project_uuid")
        or request.path_params.get("id")
        or query_project_id
        or header_project_id
    )
    if not candidate:
        return None
    try:
        return uuid.UUID(str(candidate))
    except ValueError:
        return None


def _permission_for_request_path(path: str) -> Optional[str]:
    if path.startswith("/api/v1/analytics"):
        return "analytics:read"
    if path.startswith("/api/v1/chat") or path.startswith("/api/v1/rag/chat"):
        return "chat:use"
    if path.startswith("/api/v1/search"):
        return "search:use"
    if path.startswith("/api/v1/compare"):
        return "compare:use"
    if path.startswith("/api/v1/documents"):
        return "documents:manage"
    if path.startswith("/api/v1/crawl"):
        return "crawl:manage"
    if path.startswith("/api/v1/feedback"):
        return "feedback:moderate"
    if path.startswith("/api/v1/history") or path.endswith("/history"):
        return "history:read"
    if path.startswith("/api/v1/configuration") or path.startswith("/api/v1/api-keys"):
        return "api_keys:manage"
    if path.startswith("/api/v1/settings"):
        return "settings:global"
    if path.startswith("/api/v1/user/profile"):
        return "profile:general"
    for prefix, permission in CONNECTOR_PATH_PREFIXES:
        if path.startswith(prefix):
            return permission
    if path.startswith("/api/v1/connectors") or path.startswith("/api/v1/clickup"):
        return "connectors:manage"
    return None


def _enforce_project_permission_for_request(db: Session, user: User, project: Project, request_path: str) -> None:
    required_permission = _permission_for_request_path(request_path)
    if not required_permission:
        return
    if project.owner_id == user.id or user.is_admin:
        return
    org_admin_membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.org_id == user.org_id,
            OrganizationMember.user_id == user.id,
            OrganizationMember.is_active == True,
            OrganizationMember.role == "org_admin",
        )
        .first()
    )
    if org_admin_membership:
        return
    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")
    permissions = membership.permissions or []
    if not has_effective_permission(permissions, required_permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing permission: {required_permission}",
        )


def require_project_permission(permission: str):
    async def _dependency(
        request: Request,
        current_user: User = Depends(get_current_user_required),
        db: Session = Depends(get_db),
        project_id_query: Optional[str] = Query(default=None, alias="project_id"),
        x_project_id: Optional[str] = Header(default=None, alias="X-Project-ID"),
    ) -> Project:
        project_uuid = _extract_project_id(request, project_id_query, x_project_id)
        if not project_uuid:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Project ID is required")

        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        if current_user.org_id and project.org_id and project.org_id != current_user.org_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-organization access denied")

        if project.owner_id == current_user.id or current_user.is_admin:
            return project

        org_admin_membership = (
            db.query(OrganizationMember)
            .filter(
                OrganizationMember.org_id == current_user.org_id,
                OrganizationMember.user_id == current_user.id,
                OrganizationMember.is_active == True,
                OrganizationMember.role == "org_admin",
            )
            .first()
        )
        if org_admin_membership:
            return project

        membership = (
            db.query(ProjectMember)
            .filter(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == current_user.id,
            )
            .first()
        )
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")
        permissions = membership.permissions or []
        if not has_effective_permission(permissions, permission):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")
        return project

    return _dependency

def require_auth(func):
    """Decorator to require authentication for any function"""
    async def wrapper(*args, **kwargs):
        # This would be used with FastAPI dependency injection
        return await func(*args, **kwargs)
    return wrapper

# Alias for compatibility
get_current_active_user = get_current_user_required

async def get_active_project(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Get the active project for the current user (excludes temporary onboarding projects)."""
    from sqlalchemy.exc import OperationalError
    
    try:
        project = resolve_active_project(db, current_user)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No project found for current user",
            )

        # Org admins may promote a fallback project to org-wide active.
        if is_org_admin_user(db, current_user) and not project.is_active:
            project.is_active = True
            try:
                db.commit()
                db.refresh(project)
            except OperationalError:
                db.rollback()

        return project
    except OperationalError as e:
        # Re-raise as HTTPException for better error handling
        error_str = str(e.orig) if hasattr(e, 'orig') else str(e)
        if "Connection refused" in error_str or "could not connect" in error_str.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service is currently unavailable. Please ensure PostgreSQL is running and try again."
            )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service error. Please try again later."
        )

async def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Verify API key from bearer token and return the API key object"""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    api_key_token = credentials.credentials

    # Look up the API key — hash-first with plaintext fallback for legacy (unhashed) rows
    _token_hash = hashlib.sha256(api_key_token.encode()).hexdigest()
    api_key = (
        db.query(APIKey).filter(APIKey.key_hash == _token_hash).first()
        or db.query(APIKey).filter(APIKey.key == api_key_token).first()
    )
    
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if API key is active
    if not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if API key has expired
    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API key has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    try:
        db.execute(
            _sa_update(APIKey)
            .where(APIKey.id == api_key.id)
            .values(
                request_count=APIKey.request_count + 1,
                last_used_at=datetime.utcnow(),
            )
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning("Failed to update API key usage tracking: %s", e)

    return api_key

async def get_current_user_or_api_key(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """
    Get current user from JWT token OR verify API key.
    This allows endpoints to accept either JWT tokens (for logged-in users) or API keys.
    """
    token = credentials.credentials if credentials else access_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if it looks like an API key (starts with rgs_live_ or rgs_test_)
    # If so, try API key verification first, otherwise try JWT first
    if token.startswith("rgs_live_") or token.startswith("rgs_test_"):
        # Looks like an API key, verify it directly (inline logic to avoid Depends issue)
        _token_hash = hashlib.sha256(token.encode()).hexdigest()
        api_key = (
            db.query(APIKey).filter(APIKey.key_hash == _token_hash).first()
            or db.query(APIKey).filter(APIKey.key == token).first()
        )
        
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if API key is active
        if not api_key.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key is inactive",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if API key has expired
        if api_key.expires_at and api_key.expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API key has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not getattr(api_key, "project_id", None):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="API key must be project-scoped",
            )
        
        try:
            db.execute(
                _sa_update(APIKey)
                .where(APIKey.id == api_key.id)
                .values(
                    request_count=APIKey.request_count + 1,
                    last_used_at=datetime.utcnow(),
                )
            )
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("Failed to update API key usage tracking: %s", e)

        return {"type": "api_key", "api_key": api_key}
    
    # Otherwise, try JWT token verification
    try:
        username, payload = verify_token(token)
        jti = payload.get("jti")
        if not jti:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing required session identifier. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session = db.query(UserSession).filter(UserSession.token_jti == jti).first()
        if not session or not session.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if session.expires_at < datetime.now(timezone.utc):
            session.is_active = False
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session.last_activity = datetime.now(timezone.utc)
        try:
            db.commit()
        except:
            db.rollback()

        user = db.query(User).filter(User.username == username).first()
        if not user:
            user = db.query(User).filter(User.email == username).first()
        if user and user.is_active:
            # Check inactivity and update last_activity for JWT users
            check_and_update_user_activity(user, db)
            return {"type": "user", "user": user}
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except (HTTPException, JWTError):
        # JWT verification failed
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

def validate_domain_for_project(
    request_domain: Optional[str],
    project_id,
    db: Session,
    widget_type: Optional[str] = None  # "chatbot" or "search"
) -> bool:
    """
    Validate if the requesting domain is allowed for the given project.
    
    STRICT MODE: Widgets will ONLY work if domain is validated.
    No backward compatibility - domain must be in allowed list.
    
    Args:
        request_domain: The domain from the request (e.g., "example.com")
        project_id: The project UUID
        db: Database session
    
    Returns:
        True if domain is allowed, False otherwise
    
    Raises:
        HTTPException: If domain validation fails
    """
    from ..models import IntegrationEmbed, Project
    import uuid
    
    # STRICT: Require domain to be provided
    if not request_domain:
        logger.warning(f"No domain provided for project {project_id} - blocking request")
        raise HTTPException(
            status_code=403,
            detail="Domain validation required. Please ensure the widget is loaded from a valid domain."
        )
    
    # Get project to find owner
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        logger.error(f"Project {project_id} not found for domain validation")
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )
    
    # Get integration embed config for project owner
    embed_config = db.query(IntegrationEmbed).filter(
        IntegrationEmbed.user_id == project.owner_id
    ).first()
    
    # STRICT: Require embed config to exist
    if not embed_config:
        logger.warning(f"No embed config found for user {project.owner_id} - blocking domain {request_domain}")
        raise HTTPException(
            status_code=403,
            detail="Domain validation is required. Please configure allowed domains in Settings > Allowed Domains."
        )
    
    # Get allowed domains from config based on widget type
    keys_data = embed_config.keys or {}
    
    # Determine which domain list to use based on widget type
    if widget_type == "chatbot":
        allowed_domains = keys_data.get("chatbot_domains", [])
        widget_name = "chatbot"
    elif widget_type == "search":
        allowed_domains = keys_data.get("search_domains", [])
        widget_name = "search"
    else:
        # Fallback for generic widget endpoints (e.g. /api/v1/settings):
        # accept any explicitly configured widget domain list.
        domains = keys_data.get("domains", []) or []
        chatbot_domains = keys_data.get("chatbot_domains", []) or []
        search_domains = keys_data.get("search_domains", []) or []
        allowed_domains = []
        for domain in domains + chatbot_domains + search_domains:
            if domain not in allowed_domains:
                allowed_domains.append(domain)
        widget_name = "widget"
    
    logger.info(f"🔍 Domain validation for project {project_id} ({widget_name}): request_domain={request_domain}, allowed_domains={allowed_domains}, widget_type={widget_type}, keys_data keys={list(keys_data.keys())}")
    
    # STRICT: Require at least one domain to be configured
    if not allowed_domains or len(allowed_domains) == 0:
        logger.warning(f"No {widget_name} domains configured for project {project_id} - blocking domain {request_domain}")
        raise HTTPException(
            status_code=403,
            detail=f"Domain validation is required. Please add at least one allowed domain for {widget_name} in Settings > Allowed Domains."
        )
    
    # Normalize domain (remove protocol, www, trailing slash, port)
    def normalize_domain(domain: str) -> str:
        if not domain:
            return ""
        domain = domain.lower().strip()
        # Remove protocol
        if '://' in domain:
            domain = domain.split('://')[1]
        # Remove path
        if '/' in domain:
            domain = domain.split('/')[0]
        # Remove port
        if ':' in domain:
            domain = domain.split(':')[0]
        # Remove www prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    
    normalized_request_domain = normalize_domain(request_domain)
    logger.info(f"🔍 Normalized request domain: '{request_domain}' -> '{normalized_request_domain}'")
    
    # Check if domain is in allowed list
    for allowed_domain in allowed_domains:
        normalized_allowed = normalize_domain(allowed_domain)
        logger.info(f"🔍 Comparing: request='{normalized_request_domain}' vs allowed='{normalized_allowed}' (from '{allowed_domain}')")
        if normalized_request_domain == normalized_allowed:
            logger.info(f"✅ Domain {request_domain} (normalized: {normalized_request_domain}) is allowed for project {project_id}")
            return True
    
    # Domain not found in allowed list - BLOCK
    logger.warning(f"❌ Domain {request_domain} (normalized: {normalized_request_domain}) is NOT allowed for project {project_id}. Allowed domains: {allowed_domains}")
    raise HTTPException(
        status_code=403,
        detail=f"Domain '{request_domain}' is not authorized for this project. Please add it to your allowed domains in Settings > Allowed Domains."
    )

def generate_embed_token(project_id: str, embed_secret: str) -> str:
    """Generate a signed embed token: {project_id}.{hmac_sha256}"""
    sig = hmac.new(embed_secret.encode(), project_id.encode(), hashlib.sha256).hexdigest()
    return f"{project_id}.{sig}"


def verify_embed_token(token: str, db) -> "Project":
    """Verify signed embed token. Returns Project or raises 403."""
    from ..models import IntegrationEmbed, Project
    try:
        project_id_str, signature = token.rsplit(".", 1)
        import uuid
        project_uuid = uuid.UUID(project_id_str)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=403, detail="Invalid embed token format")

    project = db.query(Project).filter(Project.id == project_uuid).first()
    if not project:
        raise HTTPException(status_code=403, detail="Invalid embed token: project not found")

    embed_config = db.query(IntegrationEmbed).filter(
        IntegrationEmbed.user_id == project.owner_id
    ).first()
    if not embed_config or not embed_config.embed_secret:
        raise HTTPException(status_code=403, detail="Embed token not configured for this project")

    expected_sig = hmac.new(
        embed_config.embed_secret.encode(), project_id_str.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected_sig, signature):
        raise HTTPException(status_code=403, detail="Invalid embed token signature")

    return project


def resolve_embed_project_context(
    auth: dict,
    db: Session,
    *,
    query_project_id: Optional[uuid.UUID] = None,
) -> tuple[Project, int]:
    """
    Resolve (project, settings_user_id) for widget or mobile API-key read routes.

    settings_user_id is project.owner_id for widget/api_key (settings rows are keyed
    by owner). User JWT auth is handled by each route's existing branch.
    """
    auth_type = auth.get("type")

    if auth_type == "widget":
        project_id = auth.get("project_id")
        if not project_id:
            raise HTTPException(status_code=404, detail="Project not found")
        project_uuid = (
            project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
        )
        if query_project_id and str(query_project_id) != str(project_uuid):
            raise HTTPException(status_code=403, detail="Project ID mismatch with authentication")
        project = db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project, project.owner_id

    if auth_type == "api_key":
        api_key = auth.get("api_key")
        if api_key is None:
            raise HTTPException(status_code=403, detail="API key authentication required")
        project_id = getattr(api_key, "project_id", None)
        if not project_id:
            raise HTTPException(status_code=403, detail="API key must be project-scoped")
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project, project.owner_id

    raise HTTPException(status_code=403, detail="Unsupported auth type for embed project context")


async def get_project_id_or_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    x_project_id: Optional[str] = Header(None, alias="X-Project-ID"),
    x_widget_mode: Optional[str] = Header(None, alias="X-Widget-Mode"),
    x_request_domain: Optional[str] = Header(None, alias="X-Request-Domain"),
    x_widget_token: Optional[str] = Header(None, alias="X-Widget-Token"),
    project_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    access_token: Optional[str] = Cookie(default=None),
):
    """
    Allow authentication via:
    1. Bearer token (for logged-in users)
    2. X-Widget-Token (signed embed token — preferred for widgets)
    3. X-Project-ID header (legacy widget auth, kept for backward compat)
    4. project_id query parameter (legacy widget auth)

    Also validates domain for widget requests.

    Returns a dict with 'type' ('user' or 'widget') and the relevant object/ID.
    """
    from ..models import Project
    import uuid

    # Coerce FastAPI FieldInfo defaults to None when called directly (e.g. in tests)
    if not isinstance(x_widget_token, str):
        x_widget_token = None
    if not isinstance(access_token, str):
        access_token = None

    # Cookie fallback: if no Authorization header, synthesize one from httpOnly cookie
    if not authorization and access_token:
        authorization = f"Bearer {access_token}"

    # 0. Signed embed token — most secure widget auth path
    if x_widget_token:
        project = verify_embed_token(x_widget_token, db)
        return {
            "type": "widget",
            "project_id": project.id,
            "project": project,
            "user_id": project.owner_id,
        }

    widget_mode_requested = str(x_widget_mode or "").lower() in {"1", "true", "yes", "on"}
    pid_str = x_project_id or project_id

    # 1. Widget mode gets priority when explicitly requested with project context.
    if widget_mode_requested and pid_str:
        authorization = None

    # 2. Check for Bearer token (User/Auth API key) when not explicitly forced to widget mode.
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        try:
            # Re-use existing logic logic for token verification
            # We can't easily reuse get_current_user_or_api_key directly because of dependency injection structure
            # effectively duplicating the check logic or calling it manually if we could (but it depends on Depends)
            
            # Manually verify mobile API keys — never fall through to JWT for rgs_* tokens.
            if token.startswith("rgs_live_") or token.startswith("rgs_test_"):
                _token_hash = hashlib.sha256(token.encode()).hexdigest()
                api_key = (
                    db.query(APIKey).filter(APIKey.key_hash == _token_hash).first()
                    or db.query(APIKey).filter(APIKey.key == token).first()
                )
                if not api_key:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid API key",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                if not api_key.is_active:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="API key is inactive",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                if api_key.expires_at and api_key.expires_at < datetime.utcnow():
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="API key has expired",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                if not getattr(api_key, "project_id", None):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="API key must be project-scoped",
                    )
                try:
                    db.execute(
                        _sa_update(APIKey)
                        .where(APIKey.id == api_key.id)
                        .values(
                            request_count=APIKey.request_count + 1,
                            last_used_at=datetime.utcnow(),
                        )
                    )
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.warning("Failed to update API key usage tracking: %s", e)
                return {"type": "api_key", "api_key": api_key, "user_id": api_key.created_by_id}

            # Try JWT (non-mobile Bearer tokens only)
            username, payload = verify_token(token)
            jti = payload.get("jti")
            if not jti:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing required session identifier. Please log in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            session = db.query(UserSession).filter(UserSession.token_jti == jti).first()
            if not session or not session.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Session has been revoked. Please log in again.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            user = db.query(User).filter(User.username == username).first()
            if not user:
                user = db.query(User).filter(User.email == username).first()

            if user and user.is_active:
                try:
                    check_and_update_user_activity(user, db)
                except HTTPException as e:
                    raise
                except Exception as e:
                    logger.warning(f"Failed to update user activity: {e}")

                if pid_str:
                    project_uuid = uuid.UUID(pid_str)
                    project = db.query(Project).filter(Project.id == project_uuid).first()
                    if not project:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail="Project not found",
                        )
                    if user.org_id and project.org_id and project.org_id != user.org_id:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cross-organization access denied",
                        )
                    _enforce_project_permission_for_request(
                        db,
                        user,
                        project,
                        str(request.url.path),
                    )
                return {"type": "user", "user": user, "user_id": user.id}

        except HTTPException:
            raise
        except Exception as e:
            logger.debug(f"Token authentication failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
            
    # 3. Check for Project ID (Widget Auth)
    if pid_str:
        try:
            # Validate UUID format
            pid_uuid = uuid.UUID(pid_str)
            
            # Check if project exists
            project = db.query(Project).filter(Project.id == pid_uuid).first()
            
            # For widgets (X-Project-ID), we allow access even if the project is not "active" (selected in dashboard)
            # The is_active flag mainly tracks which project the user is currently viewing/editing in the UI.
            if project:
                # Validate domain for widget requests.
                # Prefer embedding-page domain for AppChat iframe (/embed/chatbot): browser Origin is
                # the asset host, while X-Request-Domain carries the parent hostname from the iframe.
                request_domain = None
                referer = request.headers.get("Referer", "") or ""
                is_appchat_embed = "/embed/chatbot" in referer
                if is_appchat_embed and x_request_domain:
                    request_domain = x_request_domain
                if not request_domain:
                    origin = request.headers.get("Origin", "")
                    if origin:
                        try:
                            from urllib.parse import urlparse
                            request_domain = urlparse(origin).hostname
                        except Exception:
                            pass
                if not request_domain:
                    request_domain = x_request_domain
                if not request_domain and referer:
                    try:
                        from urllib.parse import urlparse
                        request_domain = urlparse(referer).hostname
                    except Exception:
                        pass
                
                logger.info(f"🔍 Widget auth - Project: {pid_uuid}, Request domain: {request_domain}, X-Request-Domain header: {x_request_domain}, Referer: {request.headers.get('Referer', 'N/A')}")
                
                # Determine widget type from request path
                widget_type = None
                request_path = str(request.url.path) if hasattr(request, 'url') else ''
                if '/chat' in request_path or '/chatbot' in request_path or request_path == '/api/v1/settings':
                    widget_type = "chatbot"
                elif '/search' in request_path:
                    widget_type = "search"
                
                logger.info(f"🔍 Widget type detected: {widget_type} from path: {request_path}")
                
                # Validate domain with widget type
                validate_domain_for_project(request_domain, pid_uuid, db, widget_type=widget_type)
                
                return {
                    "type": "widget", 
                    "project_id": project.id, 
                    "project": project,
                    "user_id": project.owner_id # Widget acts on behalf of project owner
                }
        except HTTPException:
            # Re-raise HTTPExceptions (like 403 for invalid domain)
            raise
        except ValueError:
            pass # Invalid UUID format
            
    # No valid auth found
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required (Bearer token or Project ID)",
        headers={"WWW-Authenticate": "Bearer"},
    )

def get_device_info(user_agent: str) -> str:
    """Parse User-Agent string to get simple device info"""
    if not user_agent:
        return "Unknown Device"
    
    agent = user_agent.lower()
    
    # Detect Browser
    browser = "Unknown Browser"
    if "edg/" in agent:
        browser = "Edge"
    elif "chrome/" in agent:
        browser = "Chrome"
    elif "firefox/" in agent:
        browser = "Firefox"
    elif "safari/" in agent and "chrome/" not in agent:
        browser = "Safari"
    elif "opera/" in agent or "opr/" in agent:
        browser = "Opera"
    elif "trident/" in agent or "msie " in agent:
        browser = "Internet Explorer"
    
    # Detect OS
    os_name = "Unknown OS"
    if "windows" in agent:
        os_name = "Windows"
    elif "macintosh" in agent or "mac os" in agent:
        os_name = "macOS"
    elif "linux" in agent:
        os_name = "Linux"
    elif "android" in agent:
        os_name = "Android"
    elif "iphone" in agent or "ipad" in agent or "ios" in agent:
        os_name = "iOS"
        
    return f"{browser} on {os_name}"

def get_location_from_ip(ip_address: str) -> str:
    """Get approximate location from IP address using ipapi.co (HTTPS, free tier)."""
    if not ip_address or ip_address in ["127.0.0.1", "::1", "localhost", "0.0.0.0"]:
        return "Localhost"

    try:
        response = requests.get(f"https://ipapi.co/{ip_address}/json/", timeout=2)
        if response.status_code == 200:
            data = response.json()
            # ipapi.co returns {"error": true} for invalid IPs
            if not data.get("error"):
                city = data.get("city", "")
                country = data.get("country", "")  # 2-letter code e.g. "US"
                if city and country:
                    return f"{city}, {country}"
                return country or city or "Unknown Location"
    except Exception:
        pass

    return "Unknown Location"
