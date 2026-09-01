"""Trust Center HTTP routes — document metadata only (legal body lives in the FE)."""
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import get_active_project, get_current_user_required
from app.db import get_db
from app.models import (
    ChatbotSettings,
    ConnectorIntegration,
    GmailIntegration,
    SearchSettings,
    User,
)

trust_center_router = APIRouter(prefix="/api/v1/trust-center", tags=["Trust Center"])

TRUST_CENTER_DOC_VERSION = "1.0.1"
TRUST_CENTER_UPDATED_AT = "2026-08-31"

TRUST_CENTER_DOCUMENTS = [
    {"id": "overview", "title_key": "trustCenter.tabs.overview"},
    {"id": "dpa", "title_key": "trustCenter.tabs.dpa"},
    {"id": "subprocessors", "title_key": "trustCenter.tabs.subprocessors"},
    {"id": "security", "title_key": "trustCenter.tabs.security"},
    {"id": "processing", "title_key": "trustCenter.tabs.processing"},
    {"id": "ai", "title_key": "trustCenter.tabs.ai"},
]


@trust_center_router.get("/meta")
def get_trust_center_meta(
    _current_user: User = Depends(get_current_user_required),
):
    """Return Trust Center document version and tab inventory."""
    return {
        "success": True,
        "message": "Trust Center metadata",
        "data": {
            "version": TRUST_CENTER_DOC_VERSION,
            "updated_at": TRUST_CENTER_UPDATED_AT,
            "product": "RAGSuite",
            "documents": TRUST_CENTER_DOCUMENTS,
            "locales": ["en", "de"],
            "placeholders": [
                "CONTROLLER_LEGAL_NAME",
                "CONTROLLER_ADDRESS",
                "CONTROLLER_CONTACT_EMAIL",
                "CONTROLLER_SIGNATORY_NAME",
                "EFFECTIVE_DATE",
            ],
        },
    }


@trust_center_router.get("/active-subprocessors")
def get_active_subprocessors(
    project_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project=Depends(get_active_project),
):
    """Return sub-processor categories enabled for the given project configuration."""
    pid = project_id or active_project.id
    categories: List[dict] = [
        {"id": "customer_infrastructure", "label": "Customer infrastructure (self-host)"},
    ]

    search = (
        db.query(SearchSettings)
        .filter(SearchSettings.project_id == pid, SearchSettings.user_id == current_user.id)
        .first()
    )
    chatbot = (
        db.query(ChatbotSettings)
        .filter(ChatbotSettings.project_id == pid, ChatbotSettings.user_id == current_user.id)
        .first()
    )

    providers = set()
    for row in (search, chatbot):
        if row and row.model_provider:
            providers.add(str(row.model_provider).lower())

    for provider in sorted(providers):
        if provider in {"ollama", "custom-llm", "custom_llm"}:
            categories.append(
                {"id": f"local_llm_{provider}", "label": "Local LLM / Ollama (no egress)"}
            )
        elif provider == "mistral":
            categories.append({"id": "mistral", "label": "Mistral (EU-oriented API)"})
        else:
            categories.append({"id": provider, "label": f"Hosted model provider: {provider}"})

    if db.query(GmailIntegration).filter(GmailIntegration.project_id == pid).first():
        categories.append({"id": "gmail", "label": "Gmail connector"})
    connectors = (
        db.query(ConnectorIntegration)
        .filter(ConnectorIntegration.project_id == pid, ConnectorIntegration.is_active.is_(True))
        .all()
    )
    for conn in connectors:
        categories.append(
            {"id": f"connector_{conn.connector_type}", "label": f"Connector: {conn.connector_type}"}
        )

    return {
        "success": True,
        "data": {
            "project_id": str(pid),
            "categories": categories,
        },
    }
