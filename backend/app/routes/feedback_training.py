"""Admin feedback training — train / untrain one feedback (reward memory for the active project).

Mounted under ``/api/v1/feedback`` so the ``feedback:moderate`` project permission applies.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..auth import get_active_project, get_current_user_required
from ..db import get_db
from ..models import ChatMessage, Project, User
from ..schemas import FeedbackTrainingRequest, FeedbackTrainingState
from ..services.audit_service import emit_audit
from ..services.feedback_training import store

router = APIRouter(prefix="/api/v1/feedback", tags=["Feedback training"])


def _feedback_message(db: Session, message_id: str, project: Project) -> ChatMessage:
    try:
        mid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id")
    message = (
        db.query(ChatMessage)
        .filter(
            and_(
                ChatMessage.message_id == mid,
                ChatMessage.project_id == project.id,
                ChatMessage.feedback.isnot(None),
            )
        )
        .first()
    )
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found or has no feedback")
    return message


def _audit(request: Request, user: User, project: Project, message: ChatMessage, action: str, reward=None) -> None:
    emit_audit(
        event_type=f"data.feedback_training.{action}",
        request=request,
        user_id=user.id,
        project_id=project.id,
        resource_type="chat_message",
        resource_id=str(message.message_id),
        summary=f"Feedback {action}",
        details={"reward": reward} if reward is not None else None,
    )


@router.get("/moderation/{message_id}/training", response_model=FeedbackTrainingState)
def get_feedback_training(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    message = _feedback_message(db, message_id, active_project)
    example = store.examples_by_message(db, [message.message_id]).get(message.message_id)
    return FeedbackTrainingState(**store.training_state(message, example))


@router.post("/moderation/{message_id}/training", response_model=FeedbackTrainingState)
def train_feedback(
    message_id: str,
    body: FeedbackTrainingRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    message = _feedback_message(db, message_id, active_project)
    try:
        example = store.train(db, message, user_id=current_user.id, guidance=body.guidance)
    except store.TrainingNotEligible as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    _audit(request, current_user, active_project, message, "trained", reward=example.reward)
    return FeedbackTrainingState(**store.training_state(message, example))


@router.delete("/moderation/{message_id}/training", response_model=FeedbackTrainingState)
def untrain_feedback(
    message_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project),
):
    message = _feedback_message(db, message_id, active_project)
    example = store.untrain(db, message)
    if example is not None:
        _audit(request, current_user, active_project, message, "untrained")
    return FeedbackTrainingState(**store.training_state(message, example))
