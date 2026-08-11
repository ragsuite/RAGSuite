from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, not_
from typing import List
from uuid import UUID
from datetime import datetime, timezone

from ..db import get_db
from ..models import User, UserSession
from ..schemas import UserSession as UserSessionSchema, UserSessionsResponse, RevokeSessionResponse, RevokeAllSessionsResponse
from ..auth import get_current_user_required, verify_token
from ..services.audit_service import emit_audit
# We rely on verify_token to get JTI from current request header manually

router = APIRouter(prefix="/api/v1/user/sessions", tags=["Session Management"])

def get_current_jti(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ")[1]
    try:
        # We assume token is valid if we reached here (dependency checked it)
        # But we need payload
        from jose import jwt
        from ..settings import settings
        # Use verify_token to be safe or just decode
        # verify_token returns (username, payload)
        _, payload = verify_token(token)
        return payload.get("jti")
    except Exception:
        return None

@router.get("", response_model=UserSessionsResponse)
async def get_active_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """List all active sessions for the current user"""
    current_jti = get_current_jti(request)
    
    sessions = db.query(UserSession).filter(
        and_(
            UserSession.user_id == current_user.id,
            UserSession.is_active == True,
            UserSession.expires_at > datetime.now(timezone.utc)
        )
    ).order_by(UserSession.last_activity.desc()).all()
    
    # Map to schema and set is_current
    session_list = []
    for s in sessions:
        is_current = (s.token_jti == current_jti)
        
        # Ensure timezone aware
        created_at = s.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
            
        last_activity = s.last_activity
        if last_activity and last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
            
        expires_at = s.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
            
        session_list.append(UserSessionSchema(
            id=s.id,
            device_info=s.device_info or "Unknown",
            ip_address=s.ip_address or "Unknown",
            location=s.location or "Unknown",
            created_at=created_at,
            last_activity=last_activity,
            expires_at=expires_at,
            is_current=is_current
        ))
        
    return UserSessionsResponse(sessions=session_list)

@router.delete("/{session_id}", response_model=RevokeSessionResponse)
async def revoke_session(
    session_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Revoke a specific session"""
    current_jti = get_current_jti(request)
    
    session = db.query(UserSession).filter(
        and_(
            UserSession.id == session_id,
            UserSession.user_id == current_user.id
        )
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
        
    if not session.is_active:
         raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already revoked or expired"
        )

    # Check if attempting to revoke current session
    if session.token_jti == current_jti:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot revoke current session. Use logout instead."
        )
        
    session.is_active = False
    db.commit()

    emit_audit(
        event_type="auth.session.revoked",
        request=request,
        user_id=current_user.id,
        resource_type="session",
        resource_id=str(session_id),
        summary="User session revoked",
    )
    
    return RevokeSessionResponse(message="Session revoked successfully")

@router.delete("", response_model=RevokeAllSessionsResponse)
async def revoke_all_sessions(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Revoke all sessions except the current one"""
    current_jti = get_current_jti(request)
    
    # Query all active sessions for this user EXCEPT current jti
    query = db.query(UserSession).filter(
        and_(
            UserSession.user_id == current_user.id,
            UserSession.is_active == True,
            UserSession.token_jti != current_jti
        )
    )
    
    sessions_to_revoke = query.all()
    count = len(sessions_to_revoke)
    
    for session in sessions_to_revoke:
        session.is_active = False
        
    db.commit()

    emit_audit(
        event_type="auth.session.revoked_all",
        request=request,
        user_id=current_user.id,
        summary=f"Revoked {count} other session(s)",
        details={"revoked_count": count},
    )
    
    return RevokeAllSessionsResponse(
        message="All other sessions revoked successfully",
        revoked_count=count
    )
