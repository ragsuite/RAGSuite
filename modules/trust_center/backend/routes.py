"""Trust Center HTTP routes — document metadata only (legal body lives in the FE)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import get_current_user_required
from app.models import User

trust_center_router = APIRouter(prefix="/api/v1/trust-center", tags=["Trust Center"])

TRUST_CENTER_DOC_VERSION = "1.0.0"
TRUST_CENTER_UPDATED_AT = "2026-08-27"

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
