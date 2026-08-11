"""
Notification service helper functions
"""
from sqlalchemy.orm import Session
from app.models import Notification
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)

def create_notification(
    db: Session,
    user_id: int,
    title: str,
    message: str,
    type: str = "info",
    action_url: str = None
):
    """
    Helper function to create notifications
    
    Args:
        db: Database session
        user_id: ID of the user to notify
        title: Notification title
        message: Notification message
        type: Notification type (info, success, warning, error). Defaults to "info"
        action_url: Optional URL for action button. Defaults to None
    
    Returns:
        Created Notification object
    """
    notification = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        title=title,
        message=message,
        type=type,
        action_url=action_url,
        is_read=False,
        created_at=datetime.now(timezone.utc)
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    logger.info(f"Created notification for user {user_id}: {title}")
    return notification
