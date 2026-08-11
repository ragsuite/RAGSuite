"""
Notification API routes
"""
import logging
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db import get_db
from app.auth import get_current_user_required
from app.schemas import NotificationResponse, NotificationUpdate
from app.models import Notification, User
from .service import create_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])

@router.get("", response_model=List[NotificationResponse])
async def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Get user's notifications"""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
    return notifications

@router.get("/unread/count", response_model=dict)
async def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Get count of unread notifications"""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    return {"count": count}

@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Mark notification as read"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification

@router.put("/read-all", response_model=dict)
async def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Mark all notifications as read"""
    updated_count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"message": "All notifications marked as read", "updated_count": updated_count}

@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Delete a notification"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(notification)
    db.commit()
    return None


@router.delete("", response_model=dict)
async def delete_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Delete all notifications for the current user."""
    deleted_count = db.query(Notification).filter(
        Notification.user_id == current_user.id
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "All notifications deleted", "deleted_count": deleted_count}

@router.post("/test", response_model=NotificationResponse)
async def create_test_notification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """Create a test notification (for testing purposes)"""
    notification = create_notification(
        db=db,
        user_id=current_user.id,
        title="Test Notification",
        message="This is a test notification! The notification system is working correctly.",
        type="info",
        action_url="/crawl"
    )
    return notification
