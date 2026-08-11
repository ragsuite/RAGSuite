"""Document content URL helpers for citation links."""
from __future__ import annotations

import uuid
from typing import Any, Optional


def document_content_api_path(document_id: Any) -> Optional[str]:
    """
    Relative URL to stream an uploaded document from the Documents API.
    Matches frontend usage: GET /api/v1/documents/{id}/content
    """
    if document_id is None:
        return None
    doc_id = str(document_id).strip()
    if not doc_id or doc_id == "unknown":
        return None
    try:
        uuid.UUID(doc_id)
    except (ValueError, TypeError):
        return None
    return f"/api/v1/documents/{doc_id}/content"
