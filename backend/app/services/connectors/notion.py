"""
Notion connector: OAuth, search, sync, block-to-text, attachments, comments.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import requests
from sqlalchemy.orm import Session

from ...models import (
    ConnectorDocument,
    ConnectorIntegration,
    ConnectorIntegrationStatus,
    ConnectorSyncJob,
    ConnectorSyncJobStatus,
    UploadedDocument,
)
from ...security_utils import (
    create_oauth_state,
    decrypt_secret,
    encrypt_secret,
    safe_decrypt_secret,
    verify_oauth_state,
)
from ...settings import settings
from ..document_ingest_orchestration import staging_path_for_document
from .framework import (
    CONNECTOR_TYPE_NOTION,
    SOURCE_NOTION,
    count_indexed_connector_documents,
    enqueue_connector_document_ingest,
    ingest_pool_is_busy,
    mark_sync_job_finished,
    validate_notion_settings,
)

logger = logging.getLogger(__name__)

NOTION_API_VERSION = "2022-06-28"
NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize"
NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token"
NOTION_API_BASE = "https://api.notion.com/v1"

TEXT_BLOCK_TYPES = {
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "to_do",
    "toggle",
    "quote",
    "callout",
    "code",
}


def _content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _rich_text_to_plain(rich_text: Optional[List[Dict[str, Any]]]) -> str:
    if not rich_text:
        return ""
    return "".join(part.get("plain_text", "") for part in rich_text)


def get_auth_url(
    project_id: str,
    user_id: int,
    client_id: str,
    redirect_uri: str,
) -> str:
    state = create_oauth_state(
        provider="notion", user_id=user_id, project_id=str(project_id)
    )
    from urllib.parse import urlencode

    params = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "owner": "user",
            "redirect_uri": redirect_uri,
            "state": state,
        }
    )
    return f"{NOTION_AUTH_URL}?{params}"


def parse_oauth_state(state: str) -> Dict[str, Any]:
    return verify_oauth_state(state, expected_provider="notion")


def _basic_auth_header(client_id: str, client_secret: str) -> str:
    token = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    return f"Basic {token}"


def exchange_code_for_tokens(
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str,
) -> Dict[str, Any]:
    resp = requests.post(
        NOTION_TOKEN_URL,
        headers={
            "Authorization": _basic_auth_header(client_id, client_secret),
            "Content-Type": "application/json",
        },
        json={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "token_expiry": None,
        "workspace_name": (data.get("workspace_name") or ""),
        "bot_id": data.get("bot_id"),
    }


def refresh_access_token(
    db: Session,
    integration: ConnectorIntegration,
    client_id: str,
    client_secret: str,
) -> str:
    refresh_token = safe_decrypt_secret(integration.refresh_token)
    if not refresh_token:
        raise ValueError("Notion refresh token missing — reconnect required")

    resp = requests.post(
        NOTION_TOKEN_URL,
        headers={
            "Authorization": _basic_auth_header(client_id, client_secret),
            "Content-Type": "application/json",
        },
        json={"grant_type": "refresh_token", "refresh_token": refresh_token},
        timeout=30,
    )
    if resp.status_code == 400:
        integration.status = ConnectorIntegrationStatus.ERROR
        db.commit()
        raise ValueError("Notion token refresh failed — reconnect required")

    resp.raise_for_status()
    data = resp.json()
    integration.access_token = encrypt_secret(data["access_token"])
    if data.get("refresh_token"):
        integration.refresh_token = encrypt_secret(data["refresh_token"])
    db.commit()
    return data["access_token"]


class NotionClient:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {access_token}",
                "Notion-Version": NOTION_API_VERSION,
                "Content-Type": "application/json",
            }
        )

    def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        url = f"{NOTION_API_BASE}{path}"
        for attempt in range(4):
            resp = self.session.request(method, url, timeout=60, **kwargs)
            if resp.status_code == 429:
                wait = min(2 ** attempt, 30)
                time.sleep(wait + 0.1 * attempt)
                continue
            resp.raise_for_status()
            if resp.status_code == 204:
                return {}
            return resp.json()
        resp.raise_for_status()
        return {}

    def search(self, query: str = "", page_size: int = 50) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {"page_size": min(page_size, 100)}
        if query.strip():
            body["query"] = query.strip()
        data = self._request("POST", "/search", json=body)
        return data.get("results") or []

    def get_page(self, page_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/pages/{page_id}")

    def list_block_children(self, block_id: str) -> List[Dict[str, Any]]:
        blocks: List[Dict[str, Any]] = []
        cursor = None
        while True:
            params: Dict[str, Any] = {"page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            try:
                data = self._request("GET", f"/blocks/{block_id}/children", params=params)
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (403, 404):
                    logger.info(
                        "Notion block children unavailable for %s (HTTP %s); skipping",
                        block_id,
                        status,
                    )
                    return []
                raise
            blocks.extend(data.get("results") or [])
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
        return blocks

    def query_database(self, database_id: str, page_size: int = 100) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        cursor = None
        while True:
            body: Dict[str, Any] = {"page_size": min(page_size, 100)}
            if cursor:
                body["start_cursor"] = cursor
            data = self._request("POST", f"/databases/{database_id}/query", json=body)
            rows.extend(data.get("results") or [])
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
        return rows

    def list_comments(self, block_id: str) -> List[Dict[str, Any]]:
        comments: List[Dict[str, Any]] = []
        cursor = None
        while True:
            params: Dict[str, Any] = {"block_id": block_id, "page_size": 100}
            if cursor:
                params["start_cursor"] = cursor
            try:
                data = self._request("GET", "/comments", params=params)
            except requests.HTTPError as exc:
                status = exc.response.status_code if exc.response is not None else None
                if status in (403, 404):
                    logger.info(
                        "Notion comments unavailable for %s (HTTP %s); skipping comments",
                        block_id,
                        status,
                    )
                    return []
                raise
            comments.extend(data.get("results") or [])
            if not data.get("has_more"):
                break
            cursor = data.get("next_cursor")
        return comments


def _page_title(page: Dict[str, Any]) -> str:
    if page.get("object") == "database":
        title = _rich_text_to_plain(page.get("title"))
        if title:
            return title
    props = page.get("properties") or {}
    for prop in props.values():
        if prop.get("type") == "title":
            return _rich_text_to_plain(prop.get("title")) or "Untitled"
    return "Untitled"


def _property_to_text(prop: Dict[str, Any]) -> str:
    ptype = prop.get("type")
    if ptype == "title":
        return _rich_text_to_plain(prop.get("title"))
    if ptype == "rich_text":
        return _rich_text_to_plain(prop.get("rich_text"))
    if ptype == "number":
        val = prop.get("number")
        return "" if val is None else str(val)
    if ptype == "select":
        sel = prop.get("select")
        return sel.get("name", "") if sel else ""
    if ptype == "multi_select":
        return ", ".join(s.get("name", "") for s in (prop.get("multi_select") or []))
    if ptype == "status":
        st = prop.get("status")
        return st.get("name", "") if st else ""
    if ptype == "date":
        d = prop.get("date")
        if not d:
            return ""
        start = d.get("start") or ""
        end = d.get("end")
        return f"{start} - {end}" if end else start
    if ptype == "checkbox":
        return "yes" if prop.get("checkbox") else "no"
    if ptype == "url":
        return prop.get("url") or ""
    if ptype == "email":
        return prop.get("email") or ""
    if ptype == "phone_number":
        return prop.get("phone_number") or ""
    return ""


def _block_to_lines(
    client: NotionClient,
    block: Dict[str, Any],
    *,
    depth: int,
    block_budget: List[int],
    attachment_refs: List[Dict[str, str]],
) -> List[str]:
    if block_budget[0] <= 0:
        return []
    block_budget[0] -= 1

    btype = block.get("type", "")
    payload = block.get(btype) or {}
    lines: List[str] = []
    indent = "  " * depth

    if btype in TEXT_BLOCK_TYPES:
        text = _rich_text_to_plain(payload.get("rich_text"))
        if btype == "heading_1":
            lines.append(f"{indent}# {text}")
        elif btype == "heading_2":
            lines.append(f"{indent}## {text}")
        elif btype == "heading_3":
            lines.append(f"{indent}### {text}")
        elif btype == "to_do":
            mark = "x" if payload.get("checked") else " "
            lines.append(f"{indent}- [{mark}] {text}")
        elif btype == "code":
            lang = payload.get("language") or ""
            lines.append(f"{indent}```{lang}\n{text}\n```")
        else:
            if text.strip():
                lines.append(f"{indent}{text}")
    elif btype == "child_page":
        lines.append(f"{indent}[Page] {payload.get('title', 'Untitled')}")
    elif btype == "child_database":
        lines.append(f"{indent}[Database] {payload.get('title', 'Untitled')}")
    elif btype in ("file", "pdf"):
        name = payload.get("name") or btype
        file_obj = payload.get("file") or payload.get("external") or {}
        url = file_obj.get("url")
        if url:
            attachment_refs.append(
                {
                    "block_id": block.get("id", ""),
                    "name": name,
                    "url": url,
                    "ext": ".pdf" if btype == "pdf" else "",
                }
            )
            lines.append(f"{indent}[Attachment] {name}")
    elif btype == "bookmark":
        url = (payload.get("url") or "").strip()
        if url:
            lines.append(f"{indent}{url}")
    elif btype == "divider":
        lines.append(f"{indent}---")

    if block.get("has_children") and btype not in ("child_page", "child_database"):
        for child in client.list_block_children(block["id"]):
            lines.extend(
                _block_to_lines(
                    client,
                    child,
                    depth=depth + 1,
                    block_budget=block_budget,
                    attachment_refs=attachment_refs,
                )
            )
            if block_budget[0] <= 0:
                break
    return lines


def _comments_to_text(
    client: NotionClient,
    page_id: str,
    *,
    max_comments: int,
) -> str:
    lines: List[str] = []
    for comment in client.list_comments(page_id)[:max_comments]:
        body = comment.get("rich_text") or []
        text = _rich_text_to_plain(body).strip()
        if not text:
            continue
        created = comment.get("created_time") or ""
        lines.append(f"- ({created}) {text}")
    if not lines:
        return ""
    return "--- Comments ---\n" + "\n".join(lines)


def _download_attachment(url: str, max_bytes: int) -> Tuple[bytes, str]:
    from ...security_utils import block_ssrf

    block_ssrf(url)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    content = resp.content
    if len(content) > max_bytes:
        raise ValueError(f"Attachment exceeds max size ({len(content)} > {max_bytes})")

    ext = ".bin"
    cd = resp.headers.get("content-disposition", "")
    if "filename=" in cd:
        fname = cd.split("filename=")[-1].strip('"')
        if "." in fname:
            ext = "." + fname.rsplit(".", 1)[-1].lower()
    elif url.lower().split("?")[0].endswith(".pdf"):
        ext = ".pdf"
    elif url.lower().split("?")[0].endswith(".docx"):
        ext = ".docx"
    elif url.lower().split("?")[0].endswith(".txt"):
        ext = ".txt"
    return content, ext


def _resolve_notion_credentials(
    db: Session,
    *,
    user_id: int,
    project_id: uuid.UUID,
) -> Tuple[str, str, str]:
    from ...models import ConnectorProjectCredential

    cred = (
        db.query(ConnectorProjectCredential)
        .filter(
            ConnectorProjectCredential.user_id == user_id,
            ConnectorProjectCredential.project_id == project_id,
            ConnectorProjectCredential.connector_type == CONNECTOR_TYPE_NOTION,
        )
        .first()
    )
    if not cred:
        raise ValueError("Notion OAuth credentials are not configured for this project")
    return cred.client_id, decrypt_secret(cred.client_secret_encrypted), cred.redirect_uri


def _build_client(
    db: Session,
    integration: ConnectorIntegration,
) -> NotionClient:
    client_id, client_secret, _ = _resolve_notion_credentials(
        db,
        user_id=integration.user_id,
        project_id=integration.project_id,
    )
    access_token = safe_decrypt_secret(integration.access_token)
    if not access_token:
        access_token = refresh_access_token(db, integration, client_id, client_secret)
    return NotionClient(access_token)


def _parent_meta(
    result: Dict[str, Any],
    *,
    db_titles: Dict[str, str],
    page_titles: Dict[str, str],
) -> Tuple[Optional[str], Optional[str]]:
    """Return (parent_kind, parent_name) for a Notion search result."""
    parent = result.get("parent") or {}
    ptype = parent.get("type") or ""
    if ptype == "database_id":
        db_id = parent.get("database_id") or ""
        return "database", db_titles.get(db_id) or "Database"
    if ptype == "page_id":
        page_id = parent.get("page_id") or ""
        return "page", page_titles.get(page_id) or "Parent page"
    if ptype == "workspace":
        return "workspace", "Workspace"
    return None, None


def search_notion_sources(
    db: Session,
    integration: ConnectorIntegration,
    *,
    query: str = "",
) -> List[Dict[str, Any]]:
    client = _build_client(db, integration)
    results = client.search(query=query, page_size=50)

    db_titles: Dict[str, str] = {}
    page_titles: Dict[str, str] = {}
    for result in results:
        obj_id = result.get("id")
        if not obj_id:
            continue
        if result.get("object") == "database":
            db_titles[obj_id] = _page_title(result)
        elif result.get("object") == "page":
            page_titles[obj_id] = _page_title(result)

    missing_db_ids: Set[str] = set()
    for result in results:
        if result.get("object") != "page":
            continue
        parent = result.get("parent") or {}
        if parent.get("type") == "database_id":
            db_id = parent.get("database_id") or ""
            if db_id and db_id not in db_titles:
                missing_db_ids.add(db_id)

    for db_id in missing_db_ids:
        try:
            db_obj = client._request("GET", f"/databases/{db_id}")
            db_titles[db_id] = _page_title(db_obj)
        except Exception:
            db_titles[db_id] = "Database"

    items: List[Dict[str, Any]] = []
    for result in results:
        obj_id = result.get("id")
        if not obj_id:
            continue
        obj_type = result.get("object")
        if obj_type == "page":
            title = _page_title(result)
            parent_kind, parent_name = _parent_meta(
                result, db_titles=db_titles, page_titles=page_titles
            )
            items.append(
                {
                    "id": obj_id,
                    "name": title,
                    "kind": "page",
                    "parent_kind": parent_kind,
                    "parent_name": parent_name,
                    "last_edited_time": result.get("last_edited_time"),
                }
            )
        elif obj_type == "database":
            title = _page_title(result)
            parent_kind, parent_name = _parent_meta(
                result, db_titles=db_titles, page_titles=page_titles
            )
            items.append(
                {
                    "id": obj_id,
                    "name": title,
                    "kind": "database",
                    "parent_kind": parent_kind,
                    "parent_name": parent_name,
                    "last_edited_time": result.get("last_edited_time"),
                }
            )

    items.sort(
        key=lambda x: (
            0 if x["kind"] == "database" else 1,
            (x.get("parent_name") or "").lower(),
            x["name"].lower(),
        )
    )
    return items


def _find_prior_uploaded_notion(
    db: Session,
    project_id: uuid.UUID,
    external_id: str,
) -> Optional[UploadedDocument]:
    for doc in (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == project_id,
            UploadedDocument.source == SOURCE_NOTION,
        )
        .all()
    ):
        meta = doc.meta_data or {}
        if str(meta.get("notion_external_id") or meta.get("notion_page_id") or "") == external_id:
            return doc
    return None


def _stage_and_enqueue(
    db: Session,
    integration: ConnectorIntegration,
    *,
    external_id: str,
    title: str,
    content: bytes,
    ext: str,
    url: Optional[str],
    meta_extra: Optional[Dict[str, Any]],
    errors: List[Dict[str, str]],
) -> Tuple[int, int, int]:
    """Returns (fetched, indexed, skipped) delta for one item."""
    if not content:
        return 0, 0, 1

    content_hash = _content_hash(content)
    existing = (
        db.query(ConnectorDocument)
        .filter(
            ConnectorDocument.integration_id == integration.id,
            ConnectorDocument.drive_file_id == external_id,
        )
        .first()
    )

    if not existing:
        prior = _find_prior_uploaded_notion(db, integration.project_id, external_id)
        if prior and prior.status == "Indexed" and (prior.checksum or "") == content_hash:
            db.add(
                ConnectorDocument(
                    integration_id=integration.id,
                    project_id=integration.project_id,
                    drive_file_id=external_id,
                    document_id=prior.id,
                    content_hash=content_hash,
                    trashed=False,
                )
            )
            meta = dict(prior.meta_data or {})
            meta["integration_id"] = str(integration.id)
            meta["notion_external_id"] = external_id
            prior.meta_data = meta
            db.commit()
            return 0, 0, 1

    if existing and existing.content_hash == content_hash and not existing.trashed:
        doc_present = (
            existing.document_id is not None
            and db.query(UploadedDocument.id)
            .filter(UploadedDocument.id == existing.document_id)
            .first()
            is not None
        )
        if doc_present:
            return 0, 0, 1

    old_document_id = existing.document_id if existing else None
    doc_uuid = uuid.uuid4()
    staging_path = staging_path_for_document(str(doc_uuid), f"{title}{ext}")
    os.makedirs(os.path.dirname(staging_path), exist_ok=True)
    with open(staging_path, "wb") as fh:
        fh.write(content)

    meta_data = {
        "integration_id": str(integration.id),
        "notion_external_id": external_id,
        "connector_type": CONNECTOR_TYPE_NOTION,
    }
    if meta_extra:
        meta_data.update(meta_extra)

    uploaded = UploadedDocument(
        id=doc_uuid,
        user_id=integration.user_id,
        project_id=integration.project_id,
        title=title[:1024],
        description=None,
        text_content=content,
        type="text/plain",
        source=SOURCE_NOTION,
        language=None,
        status="Queued",
        chunks=0,
        checksum=content_hash,
        size_kb=max(1, len(content) // 1024),
        url=url,
        meta_data=meta_data,
    )
    db.add(uploaded)

    if old_document_id and old_document_id != doc_uuid:
        from ..rag.singleton import locked_delete_document_embeddings

        try:
            locked_delete_document_embeddings(str(old_document_id))
        except Exception as exc:
            logger.warning("Failed to delete old embeddings for Notion doc %s: %s", old_document_id, exc)
        old_uploaded = (
            db.query(UploadedDocument).filter(UploadedDocument.id == old_document_id).first()
        )
        if old_uploaded:
            db.delete(old_uploaded)

    if existing:
        existing.document_id = doc_uuid
        existing.content_hash = content_hash
        existing.staging_path = staging_path
        existing.trashed = False
    else:
        db.add(
            ConnectorDocument(
                integration_id=integration.id,
                project_id=integration.project_id,
                drive_file_id=external_id,
                document_id=doc_uuid,
                content_hash=content_hash,
                staging_path=staging_path,
                trashed=False,
            )
        )
    db.commit()

    indexed = 0
    if enqueue_connector_document_ingest(
        db,
        document_id=str(doc_uuid),
        staging_path=staging_path,
        user_id=integration.user_id,
        project_id=integration.project_id,
    ):
        indexed = 1
    else:
        errors.append({"external_id": external_id, "error": "Failed to enqueue document ingest"})
    return 1, indexed, 0


def _build_page_content(
    client: NotionClient,
    page_id: str,
    *,
    max_blocks: int,
    include_comments: bool,
    max_comments: int,
    include_attachments: bool,
    max_attachments: int,
    max_size_bytes: int,
) -> Tuple[str, bytes, Optional[str], List[Dict[str, str]]]:
    page = client.get_page(page_id)
    title = _page_title(page)
    attachment_refs: List[Dict[str, str]] = []
    block_budget = [max_blocks]
    lines = [f"# {title}", ""]
    for block in client.list_block_children(page_id):
        lines.extend(
            _block_to_lines(
                client,
                block,
                depth=0,
                block_budget=block_budget,
                attachment_refs=attachment_refs,
            )
        )
        if block_budget[0] <= 0:
            break

    if include_comments:
        comments_text = _comments_to_text(client, page_id, max_comments=max_comments)
        if comments_text:
            lines.extend(["", comments_text])

    url = page.get("url")
    body = "\n".join(lines).encode("utf-8")
    attachments = attachment_refs[:max_attachments] if include_attachments else []
    return title, body, url, attachments


def _build_row_content(page: Dict[str, Any]) -> Tuple[str, bytes, Optional[str]]:
    title = _page_title(page)
    page_id = page.get("id", "")
    lines = [f"# {title}", ""]
    for key, prop in (page.get("properties") or {}).items():
        val = _property_to_text(prop).strip()
        if val:
            lines.append(f"{key}: {val}")
    url = page.get("url")
    return title, "\n".join(lines).encode("utf-8"), url


def run_notion_sync(db: Session, integration_id: str, sync_job_id: str) -> None:
    integration = (
        db.query(ConnectorIntegration)
        .filter(ConnectorIntegration.id == uuid.UUID(integration_id))
        .first()
    )
    sync_job = (
        db.query(ConnectorSyncJob)
        .filter(ConnectorSyncJob.id == uuid.UUID(sync_job_id))
        .first()
    )
    if not integration or not sync_job:
        return

    if integration.connector_type != CONNECTOR_TYPE_NOTION:
        raise ValueError(f"Unsupported connector type: {integration.connector_type}")

    sync_job.status = ConnectorSyncJobStatus.RUNNING
    sync_job.started_at = datetime.now(timezone.utc)
    db.commit()

    errors: List[Dict[str, str]] = []
    files_fetched = 0
    files_indexed = 0
    files_skipped = 0

    try:
        if not integration.is_active or integration.status != ConnectorIntegrationStatus.ACTIVE:
            mark_sync_job_finished(
                db, sync_job, status=ConnectorSyncJobStatus.COMPLETED, files_skipped=0
            )
            return

        settings_row = integration.settings
        cfg = validate_notion_settings(settings_row.settings if settings_row else {})
        sources_row = integration.sources
        page_ids: List[str] = []
        database_ids: List[str] = []
        if sources_row and isinstance(sources_row.sources, dict):
            pages = sources_row.sources.get("pages") or []
            databases = sources_row.sources.get("databases") or []
            page_ids = [p.get("id") for p in pages if p.get("id")]
            database_ids = [d.get("id") for d in databases if d.get("id")]

        if not page_ids and not database_ids:
            integration.last_sync_at = datetime.now(timezone.utc)
            db.commit()
            mark_sync_job_finished(
                db,
                sync_job,
                status=ConnectorSyncJobStatus.COMPLETED,
                errors=[{"error": "No pages or databases selected"}],
            )
            return

        client = _build_client(db, integration)
        max_pages = int(cfg["max_pages"])
        max_blocks = int(cfg["max_blocks_per_page"])
        max_db_rows = int(cfg["max_db_rows"])
        max_size_bytes = int(cfg["max_size_mb"]) * 1024 * 1024
        include_attachments = bool(cfg["include_attachments"])
        include_comments = bool(cfg["include_comments"])
        max_attachments = int(cfg["max_attachments_per_page"])
        max_comments = int(cfg["max_comments_per_page"])

        work_items: List[Tuple[str, str]] = []
        for pid in page_ids[:max_pages]:
            work_items.append(("page", pid))
        remaining = max(0, max_pages - len(work_items))
        for did in database_ids:
            if remaining <= 0:
                break
            try:
                rows = client.query_database(did, page_size=min(max_db_rows, remaining))
                for row in rows[:remaining]:
                    rid = row.get("id")
                    if rid:
                        work_items.append(("row", rid))
                        remaining -= 1
            except Exception as exc:
                errors.append({"database_id": did, "error": str(exc)})

        for kind, item_id in work_items:
            if not integration.is_active:
                break
            if ingest_pool_is_busy(db):
                errors.append({"error": "Ingest pool busy; remaining items deferred to next sync"})
                break

            try:
                if kind == "page":
                    title, body, url, attachments = _build_page_content(
                        client,
                        item_id,
                        max_blocks=max_blocks,
                        include_comments=include_comments,
                        max_comments=max_comments,
                        include_attachments=include_attachments,
                        max_attachments=max_attachments,
                        max_size_bytes=max_size_bytes,
                    )
                    external_id = item_id
                    f, i, s = _stage_and_enqueue(
                        db,
                        integration,
                        external_id=external_id,
                        title=title,
                        content=body,
                        ext=".txt",
                        url=url,
                        meta_extra={"notion_page_id": item_id},
                        errors=errors,
                    )
                    files_fetched += f
                    files_indexed += i
                    files_skipped += s

                    if include_attachments:
                        for idx, att in enumerate(attachments):
                            att_id = f"{item_id}:file:{att.get('block_id') or idx}"
                            try:
                                raw, ext = _download_attachment(att["url"], max_size_bytes)
                                att_title = f"{title} — {att.get('name', 'attachment')}"
                                f2, i2, s2 = _stage_and_enqueue(
                                    db,
                                    integration,
                                    external_id=att_id,
                                    title=att_title,
                                    content=raw,
                                    ext=att.get("ext") or ext,
                                    url=att.get("url"),
                                    meta_extra={
                                        "notion_page_id": item_id,
                                        "attachment": True,
                                    },
                                    errors=errors,
                                )
                                files_fetched += f2
                                files_indexed += i2
                                files_skipped += s2
                            except Exception as exc:
                                errors.append({"file_id": att_id, "error": str(exc)})
                else:
                    row_page = client.get_page(item_id)
                    title, body, url = _build_row_content(row_page)
                    external_id = f"{item_id}"
                    f, i, s = _stage_and_enqueue(
                        db,
                        integration,
                        external_id=external_id,
                        title=title,
                        content=body,
                        ext=".txt",
                        url=url,
                        meta_extra={"notion_page_id": item_id, "database_row": True},
                        errors=errors,
                    )
                    files_fetched += f
                    files_indexed += i
                    files_skipped += s
            except Exception as exc:
                errors.append({"item_id": item_id, "error": str(exc)})

        integration.last_sync_at = datetime.now(timezone.utc)
        integration.documents_indexed = count_indexed_connector_documents(db, integration)
        if integration.status == ConnectorIntegrationStatus.ERROR:
            integration.status = ConnectorIntegrationStatus.ACTIVE
        db.commit()

        mark_sync_job_finished(
            db,
            sync_job,
            status=ConnectorSyncJobStatus.COMPLETED,
            files_fetched=files_fetched,
            files_indexed=files_indexed,
            files_skipped=files_skipped,
            errors=errors,
        )
    except Exception as exc:
        logger.exception("Notion sync failed for %s: %s", integration_id, exc)
        integration.status = ConnectorIntegrationStatus.ERROR
        db.commit()
        mark_sync_job_finished(
            db,
            sync_job,
            status=ConnectorSyncJobStatus.FAILED,
            files_fetched=files_fetched,
            files_indexed=files_indexed,
            files_skipped=files_skipped,
            errors=errors + [{"error": str(exc)}],
        )
