from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List
import uuid
import secrets
import hmac
import hashlib
import json
import httpx

from ..db import get_db
from ..auth import get_current_user_required
from ..models import User, Webhook, Project, Notification
from ..schemas import WebhookCreate, WebhookUpdate, WebhookOut, WebhookTestRequest, ApiResponse
from ..services.notification_service import create_notification
from ..services.audit_service import emit_audit
from ..security_utils import block_ssrf

router = APIRouter(
    prefix="/api/v1/webhooks",
    tags=["Webhooks"]
)

def create_success_response(data=None, message=""):
    return {
        "success": True,
        "data": data,
        "message": message
    }

@router.post("/", response_model=ApiResponse)
def create_webhook(
    webhook: WebhookCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    # Verify project exists and belongs to user
    project = db.query(Project).filter(
        Project.id == webhook.project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
    
    # Block SSRF — reject internal/private URLs before storing
    block_ssrf(str(webhook.url))

    # Generate a secret
    secret = "ragsec_" + secrets.token_hex(24)

    db_webhook = Webhook(
        user_id=current_user.id,
        project_id=webhook.project_id,
        name=webhook.name,
        url=str(webhook.url),
        description=webhook.description,
        events=webhook.events,
        secret=secret,
        is_active=True
    )
    
    db.add(db_webhook)
    db.commit()
    db.refresh(db_webhook)

    emit_audit(
        event_type="webhook.created",
        request=request,
        user_id=current_user.id,
        project_id=db_webhook.project_id,
        resource_type="webhook",
        resource_id=str(db_webhook.id),
        summary=f"Webhook created: {db_webhook.name}",
    )

    return create_success_response(
        data=WebhookOut.model_validate(db_webhook).model_dump(),
        message="Webhook created successfully"
    )

@router.get("/", response_model=ApiResponse)
def list_webhooks(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    # Verify project access
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.owner_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or access denied"
        )
        
    webhooks = db.query(Webhook).filter(
        Webhook.project_id == project_id
    ).order_by(desc(Webhook.created_at)).all()
    
    return create_success_response(
        data=[WebhookOut.model_validate(wh).model_dump() for wh in webhooks],
        message="Webhooks retrieved successfully"
    )

@router.get("/{webhook_id}", response_model=ApiResponse)
def get_webhook(
    webhook_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
        
    return create_success_response(
        data=WebhookOut.model_validate(webhook).model_dump(),
        message="Webhook retrieved successfully"
    )

@router.patch("/{webhook_id}", response_model=ApiResponse)
def update_webhook(
    webhook_id: uuid.UUID,
    webhook_update: WebhookUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    update_data = webhook_update.model_dump(exclude_unset=True)

    if "url" in update_data:
        block_ssrf(str(update_data["url"]))
        update_data["url"] = str(update_data["url"])

    for key, value in update_data.items():
        setattr(webhook, key, value)
        
    db.commit()
    db.refresh(webhook)

    emit_audit(
        event_type="webhook.updated",
        request=request,
        user_id=current_user.id,
        project_id=webhook.project_id,
        resource_type="webhook",
        resource_id=str(webhook.id),
        summary=f"Webhook updated: {webhook.name}",
    )

    return create_success_response(
        data=WebhookOut.model_validate(webhook).model_dump(),
        message="Webhook updated successfully"
    )

@router.post("/{webhook_id}/regenerate-secret", response_model=ApiResponse)
def regenerate_webhook_secret(
    webhook_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Regenerate the secret key for an existing webhook.
    The new secret is only returned once in this response.
    """
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    # Generate a new secret using the same format as creation
    new_secret = "ragsec_" + secrets.token_hex(24)
    
    # Update the webhook with the new secret
    webhook.secret = new_secret
    db.commit()
    db.refresh(webhook)

    emit_audit(
        event_type="webhook.secret.regenerated",
        request=request,
        user_id=current_user.id,
        project_id=webhook.project_id,
        resource_type="webhook",
        resource_id=str(webhook.id),
        summary=f"Webhook secret rotated: {webhook.name}",
    )

    return create_success_response(
        data=WebhookOut.model_validate(webhook).model_dump(),
        message="Webhook secret regenerated successfully"
    )

@router.delete("/{webhook_id}", response_model=ApiResponse)
def delete_webhook(
    webhook_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )

    webhook_project_id = webhook.project_id
    webhook_id = webhook.id
    webhook_name = webhook.name

    db.delete(webhook)
    db.commit()

    emit_audit(
        event_type="webhook.deleted",
        request=request,
        user_id=current_user.id,
        project_id=webhook_project_id,
        resource_type="webhook",
        resource_id=str(webhook_id),
        summary=f"Webhook deleted: {webhook_name}",
    )

    return create_success_response(
        data=None,
        message="Webhook deleted successfully"
    )

@router.post("/{webhook_id}/test", response_model=ApiResponse)
async def test_webhook(
    webhook_id: uuid.UUID,
    test_req: WebhookTestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    webhook = db.query(Webhook).filter(
        Webhook.id == webhook_id,
        Webhook.user_id == current_user.id
    ).first()
    
    if not webhook:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Webhook not found"
        )
    
    # Construct payload
    payload = {
        "event": test_req.event,
        "data": test_req.payload or {"message": "Hello from RAGSuite!"},
        "webhook_id": str(webhook.id),
        "timestamp": "2024-01-01T00:00:00Z"
    }
    
    payload_json = json.dumps(payload)
    
    # Calculate signature
    signature = hmac.new(
        webhook.secret.encode("utf-8"),
        payload_json.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
    
    # Block SSRF — validate stored URL before each delivery attempt
    block_ssrf(webhook.url)

    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": test_req.event
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                webhook.url,
                content=payload_json,
                headers=headers,
                timeout=5.0
            )
            
        # If webhook delivery failed (non-2xx status), increment failure count
        if response.status_code >= 400:
            webhook.failure_count += 1
            db.commit()
            
            # Create notification if failure count reaches threshold
            if webhook.failure_count >= 3:
                # Check if notification already exists
                existing_notif = db.query(Notification).filter(
                    Notification.user_id == current_user.id,
                    Notification.title == "Webhook Delivery Failed",
                    Notification.message.like(f"%{webhook.name}%"),
                    Notification.is_read == False
                ).first()
                
                if not existing_notif:
                    try:
                        create_notification(
                            db=db,
                            user_id=current_user.id,
                            title="Webhook Delivery Failed",
                            message=f"Webhook '{webhook.name}' has failed {webhook.failure_count} times. Please check the configuration.",
                            type="error",
                            action_url="/webhooks"
                        )
                    except Exception as notif_error:
                        pass  # Don't fail the request if notification creation fails
            
        return create_success_response(
            data={
                "status": response.status_code,
                "response": response.text[:1000]
            },
            message=f"Webhook delivery attempt returned status {response.status_code}"
        )
    except Exception as e:
        # Increment failure count on exception
        webhook.failure_count += 1
        db.commit()
        
        # Create notification if failure count reaches threshold
        if webhook.failure_count >= 3:
            existing_notif = db.query(Notification).filter(
                Notification.user_id == current_user.id,
                Notification.title == "Webhook Delivery Failed",
                Notification.message.like(f"%{webhook.name}%"),
                Notification.is_read == False
            ).first()
            
            if not existing_notif:
                try:
                    create_notification(
                        db=db,
                        user_id=current_user.id,
                        title="Webhook Delivery Failed",
                        message=f"Webhook '{webhook.name}' has failed {webhook.failure_count} times: {str(e)[:100]}",
                        type="error",
                        action_url="/webhooks"
                    )
                except Exception as notif_error:
                    pass
        
        return {
            "success": False,
            "data": {"error": str(e)},
            "message": f"Failed to deliver webhook: {str(e)}"
        }
