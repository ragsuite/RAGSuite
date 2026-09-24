"""Human-readable MCP envelopes. Existing keys (ok, error, code, payload) stay."""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

_CODE_MESSAGES = {
    "confirm_required": "This change needs a clear yes before it runs. Tell me to go ahead and I will confirm it.",
    "confirmation_required": "This action needs a confirmation token from the preview. Show the preview to the user and send the token only after they agree to that exact action.",
    "confirmation_invalid": "That confirmation is missing, expired, or was already used. Ask again and use the new preview.",
    "confirmation_wrong_action": "That confirmation belongs to a different action. Ask the user again.",
    "confirmation_args_changed": "The details changed since the preview. Show a fresh preview before continuing.",
    "forbidden": "You don't have permission to do that.",
    "forbidden_project": "You can't open that project.",
    "not_found": "I couldn't find that.",
    "fields_required": "Some required details are still missing.",
    "fields_rejected": "That change includes a field RAGSuite won't set from here. Nothing was saved.",
    "bad_request": "Those details aren't valid.",
    "payload_too_large": "That value is too large to send through this connection.",
    "project_required": "Say which project to use, or switch the active project first.",
    "active_project": "That project is the active one, so it can't be deleted. Switch to another project first.",
    "ambiguous": "More than one match was found. Ask which one they mean. Do not pick one.",
    "not_org_admin": "Only an organization admin can do that.",
    "entitlement": "That feature isn't included in this license.",
}


def new_reference_id() -> str:
    return uuid.uuid4().hex[:12]


def friendly_error(code: str, fallback: str) -> str:
    if code == "entitlement" and fallback:
        return fallback
    return _CODE_MESSAGES.get(code) or fallback


def envelope_ok(payload: dict[str, Any], *, friendly_name: Optional[str] = None) -> dict[str, Any]:
    body = dict(payload)
    success = bool(body.get("success", body.get("ok", True)))
    body["success"] = success
    body.setdefault("ok", success)
    if "message" not in body or not body.get("message"):
        if body.get("requires_confirmation"):
            body["message"] = body.get("preview", {}).get("summary") or (
                "This needs confirmation before anything changes."
            )
        elif body.get("already_exists"):
            body["message"] = f"{friendly_name or 'That'} already exists, so nothing new was created."
        elif success:
            body["message"] = f"{friendly_name or 'Done'} completed."
        else:
            body["message"] = friendly_error(str(body.get("code") or ""), "That didn't complete.")
    if body.get("job_id") and "job" not in body:
        body["job"] = {
            "id": body.get("job_id"),
            "status": body.get("enqueue_status") or body.get("status") or "queued",
            "progress": body.get("progress"),
        }
    return body


def envelope_err(message: str, *, code: str = "error", reference_id: Optional[str] = None, **extra: Any) -> dict[str, Any]:
    friendly = friendly_error(code, message)
    body: dict[str, Any] = {
        "ok": False,
        "success": False,
        "error": message,
        "message": friendly if friendly != message else message,
        "code": code,
        "requires_confirmation": code in {"confirmation_required", "confirm_required"},
    }
    if code == "error":
        ref = reference_id or new_reference_id()
        body["reference_id"] = ref
        body["message"] = f"RAGSuite couldn't complete this right now. Please try again. Reference ID: {ref}."
        body["debug"] = message
        logger.error("MCP tool failure reference_id=%s detail=%s", ref, message)
    body.update(extra)
    return body
