"""
Gmail integration service: OAuth2 + email fetching + ingestion
"""
import base64
import email
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from ..security_utils import (
    create_oauth_state,
    pop_oauth_code_verifier,
    store_oauth_code_verifier,
    verify_oauth_state,
)

logger = logging.getLogger(__name__)
STAGED_RETENTION_DAYS = 30

# Allow Google to return a superset of requested scopes (happens when user previously
# granted broader permissions — oauthlib raises ScopeChanged without this)
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]


def _get_flow(redirect_uri: str, client_id: str, client_secret: str):
    """Build Google OAuth2 flow. Raises ImportError if google libs missing."""
    from google_auth_oauthlib.flow import Flow
    return Flow.from_client_config(
        {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=GMAIL_SCOPES,
        redirect_uri=redirect_uri,
    )


def get_auth_url(project_id: str, user_id: int, client_id: str, client_secret: str, redirect_uri: str) -> str:
    """Return Google OAuth2 URL with signed, expiring state."""
    flow = _get_flow(redirect_uri, client_id, client_secret)
    state = create_oauth_state(provider="gmail", user_id=user_id, project_id=str(project_id))
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )
    verifier = getattr(flow, "code_verifier", None)
    if verifier:
        store_oauth_code_verifier(state, verifier)
    return auth_url


def parse_oauth_state(state: str, expected_provider: str = "gmail") -> Dict:
    """Verify and decode OAuth callback state."""
    return verify_oauth_state(state, expected_provider=expected_provider)


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
    state: Optional[str] = None,
) -> Dict:
    """Exchange authorization code for access + refresh tokens."""
    flow = _get_flow(redirect_uri, client_id, client_secret)
    verifier = pop_oauth_code_verifier(state) if state else None
    flow.fetch_token(code=code, code_verifier=verifier)
    creds = flow.credentials
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry": creds.expiry,
    }


def get_gmail_user_email(access_token: str) -> str:
    """Fetch authenticated user's email address."""
    import requests

    resp = requests.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("email", "")


def _build_gmail_service(
    access_token: str,
    refresh_token: str,
    client_id: str,
    client_secret: str,
):
    """Build Google API Gmail resource with token refresh support."""
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=GMAIL_SCOPES,
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _decode_body(part) -> str:
    """Recursively extract plain text from a Gmail message part."""
    mime = part.get("mimeType", "")
    body_data = part.get("body", {}).get("data", "")

    if mime == "text/plain" and body_data:
        return base64.urlsafe_b64decode(body_data + "==").decode("utf-8", errors="replace")

    if mime.startswith("multipart/"):
        parts = part.get("parts", [])
        for p in parts:
            text = _decode_body(p)
            if text:
                return text

    return ""


def _parse_message(msg: Dict) -> Dict:
    """Extract subject, sender, date, body from a raw Gmail message."""
    headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
    subject = headers.get("subject", "(no subject)")
    sender = headers.get("from", "unknown")
    date_str = headers.get("date", "")
    body = _decode_body(msg.get("payload", {}))

    # Cap body size using the same global limit as crawl (settings.crawl_content_length_limit).
    from .crawler import get_crawl_content_length_limit

    max_body = get_crawl_content_length_limit()
    if len(body) > max_body:
        body = body[:max_body] + "\n[truncated]"

    return {
        "message_id": msg["id"],
        "thread_id": msg.get("threadId", ""),
        "subject": subject,
        "sender": sender,
        "date": date_str,
        "body": body,
    }


def _email_to_text(parsed: Dict) -> str:
    """Convert parsed email dict to plain text for ingestion."""
    return (
        f"From: {parsed['sender']}\n"
        f"Subject: {parsed['subject']}\n"
        f"Date: {parsed['date']}\n\n"
        f"{parsed['body']}"
    ).strip()


def fetch_emails(
    access_token: str,
    refresh_token: str,
    client_id: str,
    client_secret: str,
    max_results: int = 100,
    last_history_id: Optional[str] = None,
) -> Tuple[List[Dict], Optional[str]]:
    """
    Fetch emails from Gmail. Uses incremental history if last_history_id provided.
    Returns (list_of_parsed_emails, new_history_id).
    """
    service = _build_gmail_service(access_token, refresh_token, client_id, client_secret)

    message_ids: List[str] = []
    new_history_id: Optional[str] = None

    if last_history_id:
        # Incremental sync via history API
        try:
            history_resp = (
                service.users()
                .history()
                .list(
                    userId="me",
                    startHistoryId=last_history_id,
                    historyTypes=["messageAdded"],
                    labelId="INBOX",
                    maxResults=max_results,
                )
                .execute()
            )
            new_history_id = history_resp.get("historyId")
            for record in history_resp.get("history", []):
                for added in record.get("messagesAdded", []):
                    message_ids.append(added["message"]["id"])
        except Exception as exc:
            logger.warning(f"History API failed ({exc}), falling back to full fetch")
            last_history_id = None

    if not last_history_id:
        # Full initial sync
        list_resp = (
            service.users()
            .messages()
            .list(userId="me", maxResults=max_results, labelIds=["INBOX"])
            .execute()
        )
        new_history_id = list_resp.get("historyId")
        message_ids = [m["id"] for m in list_resp.get("messages", [])]

    # Deduplicate IDs while preserving order to avoid redundant API calls.
    message_ids = list(dict.fromkeys(message_ids))

    # Fetch full message content
    parsed_emails = []
    for msg_id in message_ids[:max_results]:
        try:
            msg = (
                service.users()
                .messages()
                .get(userId="me", id=msg_id, format="full")
                .execute()
            )
            # Enforce INBOX-only behavior even during incremental history sync.
            if "INBOX" not in msg.get("labelIds", []):
                continue
            parsed_emails.append(_parse_message(msg))
        except Exception as exc:
            logger.warning(f"Failed to fetch message {msg_id}: {exc}")

    # Keep advancing history pointer even when no messages were parsed.
    if not new_history_id:
        try:
            profile = service.users().getProfile(userId="me").execute()
            new_history_id = profile.get("historyId")
        except Exception as exc:
            logger.warning(f"Failed to fetch latest Gmail historyId: {exc}")

    return parsed_emails, new_history_id


def gmail_message_already_indexed(db: Session, project_id: uuid.UUID, gmail_message_id: str) -> bool:
    """True if this Gmail message id is already an UploadedDocument for the project."""
    from ..models import UploadedDocument
    from sqlalchemy import cast, String

    existing = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == "gmail",
            cast(UploadedDocument.meta_data["gmail_message_id"], String) == f'"{gmail_message_id}"',
        )
        .first()
    )
    return existing is not None


def upsert_staged_from_parsed_list(
    db: Session,
    integration_id: uuid.UUID,
    project_id: uuid.UUID,
    parsed_emails: List[Dict],
) -> Tuple[int, List[Dict]]:
    """
    Stage fetched emails for user review before indexing.
    Skips rows already present as indexed documents. Updates body/metadata if already staged.
    Returns (count_new_rows, errors).
    """
    from ..models import GmailStagedMessage

    errors: List[Dict] = []
    new_rows = 0

    for parsed in parsed_emails:
        mid = parsed.get("message_id")
        if not mid:
            continue
        try:
            if gmail_message_already_indexed(db, project_id, mid):
                continue

            row = (
                db.query(GmailStagedMessage)
                .filter(
                    GmailStagedMessage.integration_id == integration_id,
                    GmailStagedMessage.gmail_message_id == mid,
                )
                .first()
            )
            subject = (parsed.get("subject") or "(no subject)")[:5000]
            sender = (parsed.get("sender") or "")[:1024]
            date_raw = (parsed.get("date") or "")[:512]
            body = parsed.get("body") or ""
            thread_id = parsed.get("thread_id") or ""

            if row:
                row.subject = subject
                row.sender = sender
                row.date_raw = date_raw
                row.body_text = body
                row.thread_id = thread_id[:255]
            else:
                db.add(
                    GmailStagedMessage(
                        integration_id=integration_id,
                        gmail_message_id=mid[:255],
                        thread_id=thread_id[:255],
                        subject=subject,
                        sender=sender,
                        date_raw=date_raw,
                        body_text=body,
                    )
                )
                new_rows += 1
        except Exception as exc:
            errors.append({"message_id": mid, "error": str(exc)})

    # Keep staged inbox bounded over time (oldest-first cleanup by age).
    try:
        cleanup_old_staged_messages(db, integration_id, retention_days=STAGED_RETENTION_DAYS)
    except Exception as exc:
        errors.append({"error": f"retention_cleanup_failed: {exc}"})

    return new_rows, errors


def list_staged_messages(db: Session, integration_id: uuid.UUID, limit: int = 50, offset: int = 0):
    """Pending staged messages for an integration, newest first."""
    from ..models import GmailStagedMessage

    return (
        db.query(GmailStagedMessage)
        .filter(GmailStagedMessage.integration_id == integration_id)
        .order_by(GmailStagedMessage.staged_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def count_staged_messages(db: Session, integration_id: uuid.UUID) -> int:
    from ..models import GmailStagedMessage

    return (
        db.query(GmailStagedMessage)
        .filter(GmailStagedMessage.integration_id == integration_id)
        .count()
    )


def list_all_staged_message_ids(db: Session, integration_id: uuid.UUID) -> List[uuid.UUID]:
    """Return all staged ids for integration in deterministic oldest-first order."""
    from ..models import GmailStagedMessage

    rows = (
        db.query(GmailStagedMessage.id)
        .filter(GmailStagedMessage.integration_id == integration_id)
        .order_by(GmailStagedMessage.staged_at.asc(), GmailStagedMessage.id.asc())
        .all()
    )
    return [row[0] for row in rows]


def cleanup_old_staged_messages(db: Session, integration_id: uuid.UUID, retention_days: int = 30) -> int:
    """Delete staged rows older than retention_days for one integration."""
    from datetime import timedelta
    from ..models import GmailStagedMessage

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    old_rows = (
        db.query(GmailStagedMessage)
        .filter(
            GmailStagedMessage.integration_id == integration_id,
            GmailStagedMessage.staged_at < cutoff,
        )
        .all()
    )
    deleted = len(old_rows)
    for row in old_rows:
        db.delete(row)
    if deleted:
        db.commit()
    return deleted


def dismiss_staged_messages(db: Session, integration_id: uuid.UUID, staged_ids: List[uuid.UUID]) -> int:
    """Remove staged rows without indexing."""
    from ..models import GmailStagedMessage

    deleted = 0
    for sid in staged_ids:
        row = (
            db.query(GmailStagedMessage)
            .filter(
                GmailStagedMessage.id == sid,
                GmailStagedMessage.integration_id == integration_id,
            )
            .first()
        )
        if row:
            db.delete(row)
            deleted += 1
    db.commit()
    return deleted


def index_staged_messages(
    db: Session,
    integration_id: uuid.UUID,
    user_id: int,
    project_id: uuid.UUID,
    staged_ids: List[uuid.UUID],
) -> Tuple[int, List[Dict]]:
    """Run ingest_email for selected staged rows; remove staged row on success or if already indexed."""
    from ..models import GmailStagedMessage

    indexed = 0
    errors: List[Dict] = []

    for sid in staged_ids:
        row = (
            db.query(GmailStagedMessage)
            .filter(
                GmailStagedMessage.id == sid,
                GmailStagedMessage.integration_id == integration_id,
            )
            .first()
        )
        if not row:
            continue

        parsed = {
            "message_id": row.gmail_message_id,
            "thread_id": row.thread_id or "",
            "subject": row.subject or "(no subject)",
            "sender": row.sender or "unknown",
            "date": row.date_raw or "",
            "body": row.body_text or "",
        }

        doc_id = ingest_email(parsed, user_id, str(project_id), db)

        if doc_id:
            r2 = (
                db.query(GmailStagedMessage)
                .filter(GmailStagedMessage.id == sid)
                .first()
            )
            if r2:
                db.delete(r2)
            indexed += 1
        elif gmail_message_already_indexed(db, project_id, row.gmail_message_id):
            r2 = (
                db.query(GmailStagedMessage)
                .filter(GmailStagedMessage.id == sid)
                .first()
            )
            if r2:
                db.delete(r2)
        else:
            errors.append({"staged_id": str(sid), "error": "ingest_failed"})

    db.commit()
    return indexed, errors


def ingest_email(
    parsed: Dict,
    user_id: int,
    project_id: str,
    db: Session,
) -> Optional[str]:
    """
    Ingest a single email into ChromaDB + create UploadedDocument record.
    Returns document_id if successful, None otherwise.
    Skips if already indexed (dedup by gmail_message_id).
    """
    from ..models import UploadedDocument
    from .rag.singleton import locked_ingest
    from .rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project

    gmail_message_id = parsed["message_id"]

    if gmail_message_already_indexed(db, uuid.UUID(project_id), gmail_message_id):
        return None

    doc_id = str(uuid.uuid4())
    text = _email_to_text(parsed)

    # Write temp file for ingestion
    tmp_dir = Path("data/tmp")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    safe_subject = re.sub(r"[^\w\-]", "_", parsed["subject"])[:50]
    tmp_path = tmp_dir / f"{doc_id}_gmail_{safe_subject}.txt"

    try:
        tmp_path.write_text(text, encoding="utf-8")

        try:
            emb_provider, emb_model, emb_api_key = _resolve_emb_for_project(
                db, project_id
            )
        except Exception:
            emb_provider, emb_model, emb_api_key = None, None, None

        from .ingest_runtime import run_ingest_sync

        result = run_ingest_sync(
            locked_ingest,
            str(tmp_path),
            document_id=doc_id,
            user_id=user_id,
            project_id=project_id,
            embedding_provider=emb_provider,
            embedding_model=emb_model,
            embedding_api_key=emb_api_key,
        )

        chunks = result.get("chunks", 0) if result else 0
        if chunks == 0:
            logger.warning(f"Email {gmail_message_id} produced 0 chunks")

        # Create UploadedDocument record
        doc = UploadedDocument(
            id=uuid.UUID(doc_id),
            user_id=user_id,
            project_id=uuid.UUID(project_id),
            title=f"[Gmail] {parsed['subject']}",
            text_content=text.encode("utf-8"),
            type="text/plain",
            source="gmail",
            status="Indexed",
            chunks=chunks,
            size_kb=max(1, len(text) // 1024),
            meta_data={
                "gmail_message_id": gmail_message_id,
                "thread_id": parsed["thread_id"],
                "sender": parsed["sender"],
                "subject": parsed["subject"],
                "date": parsed["date"],
            },
        )
        db.add(doc)
        db.commit()
        try:
            from .reindex_service import invalidate_item_embedding_coverage_cache

            invalidate_item_embedding_coverage_cache(str(project_id))
        except Exception:
            pass
        return doc_id

    except Exception as exc:
        logger.error(f"Failed to ingest email {gmail_message_id}: {exc}")
        db.rollback()
        return None
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def revoke_token(access_token: str) -> None:
    """Revoke Google OAuth token."""
    import requests

    try:
        requests.post(
            "https://oauth2.googleapis.com/revoke",
            params={"token": access_token},
            timeout=10,
        )
    except Exception as exc:
        logger.warning(f"Token revocation failed: {exc}")


def delete_integration_documents(integration_id: str, project_id: str, db: Session) -> int:
    """Remove all Gmail documents for an integration from DB + ChromaDB."""
    from ..models import UploadedDocument
    from .rag.singleton import get_pipeline

    docs = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == uuid.UUID(project_id),
            UploadedDocument.source == "gmail",
        )
        .all()
    )

    deleted = 0
    try:
        pipeline = get_pipeline()
        for doc in docs:
            if pipeline:
                try:
                    from .rag.singleton import locked_delete_document_embeddings

                    locked_delete_document_embeddings(str(doc.id))
                except Exception as exc:
                    logger.warning(f"ChromaDB delete failed for {doc.id}: {exc}")
            db.delete(doc)
            deleted += 1
        db.commit()
    except Exception as exc:
        logger.error(f"Error deleting Gmail documents: {exc}")
        db.rollback()

    return deleted
