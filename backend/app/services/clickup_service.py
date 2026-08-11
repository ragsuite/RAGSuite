"""
ClickUp OAuth integration service — fetch tasks, docs, chat channels and ingest into RAG.
"""
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests
from sqlalchemy.orm import Session

from ..models import UploadedDocument
from ..security_utils import create_oauth_state, verify_oauth_state
from ..settings import settings

logger = logging.getLogger(__name__)

CLICKUP_API_V2 = "https://api.clickup.com/api/v2"
CLICKUP_API_V3 = "https://api.clickup.com/api/v3"


def _headers(token: str) -> Dict:
    return {"Authorization": token, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------

def get_auth_url(project_id: str, user_id: int) -> str:
    state = create_oauth_state(provider="clickup", user_id=user_id, project_id=str(project_id))
    return (
        f"https://app.clickup.com/api"
        f"?client_id={settings.clickup_client_id}"
        f"&redirect_uri={settings.clickup_redirect_uri}"
        f"&state={state}"
    )


def parse_oauth_state(state: str, expected_provider: str = "clickup") -> Dict:
    """Verify and decode OAuth callback state."""
    return verify_oauth_state(state, expected_provider=expected_provider)


def exchange_code_for_token(code: str) -> str:
    resp = requests.post(
        f"{CLICKUP_API_V2}/oauth/token",
        json={
            "client_id": settings.clickup_client_id,
            "client_secret": settings.clickup_client_secret,
            "code": code,
        },
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_workspace(token: str) -> Dict:
    """Return first workspace (team) for the authenticated user."""
    resp = requests.get(f"{CLICKUP_API_V2}/team", headers=_headers(token), timeout=15)
    resp.raise_for_status()
    teams = resp.json().get("teams", [])
    if not teams:
        raise ValueError("No ClickUp workspaces found for this account")
    return {"id": teams[0]["id"], "name": teams[0]["name"]}


# ---------------------------------------------------------------------------
# Fetch helpers
# ---------------------------------------------------------------------------

def fetch_tasks(
    token: str,
    workspace_id: str,
    last_updated_at: Optional[datetime] = None,
) -> List[Dict]:
    """Fetch all tasks from workspace, optionally incremental via date_updated_gt."""
    tasks = []
    page = 0
    params: Dict = {
        "include_closed": "true",
        "subtasks": "true",
        "include_markdown_description": "true",
        "page": page,
    }
    if last_updated_at:
        params["date_updated_gt"] = int(last_updated_at.timestamp() * 1000)

    while True:
        params["page"] = page
        resp = requests.get(
            f"{CLICKUP_API_V2}/team/{workspace_id}/task",
            headers=_headers(token),
            params=params,
            timeout=30,
        )
        resp.raise_for_status()
        batch = resp.json().get("tasks", [])
        if not batch:
            break
        tasks.extend(batch)
        page += 1

    return tasks


def fetch_task_comments(token: str, task_id: str) -> List[Dict]:
    resp = requests.get(
        f"{CLICKUP_API_V2}/task/{task_id}/comment",
        headers=_headers(token),
        timeout=15,
    )
    if resp.status_code == 404:
        return []
    resp.raise_for_status()
    return resp.json().get("comments", [])


def fetch_spaces(token: str, workspace_id: str) -> List[Dict]:
    resp = requests.get(
        f"{CLICKUP_API_V2}/team/{workspace_id}/space",
        headers=_headers(token),
        params={"archived": "false"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("spaces", [])


def fetch_chat_views(token: str, space_id: str) -> List[Dict]:
    """Return all conversation-type views in a space."""
    resp = requests.get(
        f"{CLICKUP_API_V2}/space/{space_id}/view",
        headers=_headers(token),
        timeout=15,
    )
    resp.raise_for_status()
    views = resp.json().get("views", [])
    return [v for v in views if v.get("type") == "conversation"]


def fetch_chat_messages(token: str, view_id: str) -> List[Dict]:
    resp = requests.get(
        f"{CLICKUP_API_V2}/view/{view_id}/comment",
        headers=_headers(token),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json().get("comments", [])


def fetch_docs(token: str, workspace_id: str) -> List[Dict]:
    """Fetch docs with their page content using v3 API."""
    docs = []
    cursor = None
    while True:
        params: Dict = {"deleted": "false", "archived": "false", "limit": 50}
        if cursor:
            params["next_cursor"] = cursor
        resp = requests.get(
            f"{CLICKUP_API_V3}/workspaces/{workspace_id}/docs",
            headers=_headers(token),
            params=params,
            timeout=30,
        )
        if resp.status_code == 404:
            break
        resp.raise_for_status()
        data = resp.json()
        batch = data.get("docs", [])
        if not batch:
            break
        for doc in batch:
            doc_id = doc.get("id")
            pages_resp = requests.get(
                f"{CLICKUP_API_V3}/workspaces/{workspace_id}/docs/{doc_id}/pages",
                headers=_headers(token),
                timeout=15,
            )
            if pages_resp.status_code == 200:
                doc["pages"] = pages_resp.json().get("pages", [])
            else:
                doc["pages"] = []
            docs.append(doc)
        cursor = data.get("next_cursor")
        if not cursor:
            break
    return docs


# ---------------------------------------------------------------------------
# Text formatting helpers
# ---------------------------------------------------------------------------

def _format_task_text(task: Dict, comments: List[Dict], workspace_name: str) -> str:
    assignees = ", ".join(
        a.get("username", a.get("email", "")) for a in task.get("assignees", [])
    ) or "None"
    due = task.get("due_date")
    due_str = (
        datetime.fromtimestamp(int(due) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        if due
        else "None"
    )
    priority = (task.get("priority") or {}).get("priority", "None")
    status = (task.get("status") or {}).get("status", "unknown")
    space_name = (task.get("space") or {}).get("name", "")
    list_name = (task.get("list") or {}).get("name", "")
    description = (task.get("description") or "").strip()

    lines = [
        f"Task: {task.get('name', '')}",
        f"Status: {status}  Priority: {priority}",
        f"Assignees: {assignees}",
        f"Due: {due_str}",
        f"Space: {space_name} / List: {list_name}",
        f"Workspace: {workspace_name}",
    ]
    if description:
        lines += ["", "Description:", description]

    if comments:
        lines.append("")
        lines.append("Comments:")
        for c in comments:
            ts = c.get("date")
            ts_str = (
                datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
                if ts
                else ""
            )
            user = (c.get("user") or {}).get("username", "unknown")
            text = (c.get("comment_text") or "").strip()
            lines.append(f"[{ts_str}] {user}: {text}")

    return "\n".join(lines)


def _format_chat_text(view_name: str, workspace_name: str, messages: List[Dict]) -> str:
    lines = [
        f"ClickUp Chat: #{view_name}",
        f"Workspace: {workspace_name}",
        "",
    ]
    for m in messages:
        ts = m.get("date")
        ts_str = (
            datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
            if ts
            else ""
        )
        user = (m.get("user") or {}).get("username", "unknown")
        text = (m.get("comment_text") or "").strip()
        lines.append(f"[{ts_str}] {user}: {text}")
    return "\n".join(lines)


def _format_doc_text(doc: Dict, workspace_name: str) -> str:
    title = doc.get("name") or doc.get("title") or "Untitled"
    lines = [
        f"ClickUp Doc: {title}",
        f"Workspace: {workspace_name}",
        "",
    ]
    for page in doc.get("pages", []):
        page_title = page.get("name") or ""
        content = page.get("content") or ""
        if page_title:
            lines.append(f"## {page_title}")
        if content:
            lines.append(content)
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Ingestion helpers
# ---------------------------------------------------------------------------

def _already_indexed(source: str, clickup_id: str, project_id: str, db: Session) -> bool:
    from sqlalchemy import cast, String as SAString, or_
    existing = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == uuid.UUID(project_id),
            UploadedDocument.source == source,
            or_(
                cast(UploadedDocument.meta_data["clickup_id"], SAString) == clickup_id,
                cast(UploadedDocument.meta_data["clickup_id"], SAString) == f'"{clickup_id}"',
            ),
        )
        .first()
    )
    return existing is not None


def _write_and_ingest(
    text: str,
    doc_id: str,
    title: str,
    source: str,
    meta_data: Dict,
    user_id: int,
    project_id: str,
    db: Session,
) -> Optional[str]:
    from ..services.rag.singleton import locked_ingest
    from ..services.rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project

    tmp_dir = Path("data/tmp")
    tmp_dir.mkdir(parents=True, exist_ok=True)
    safe_title = re.sub(r"[^\w\-]", "_", title)[:50]
    tmp_path = tmp_dir / f"{doc_id}_clickup_{safe_title}.txt"

    try:
        tmp_path.write_text(text, encoding="utf-8")
        try:
            emb_provider, emb_model, emb_api_key = _resolve_emb_for_project(
                db, project_id
            )
        except Exception:
            emb_provider, emb_model, emb_api_key = None, None, None
        result = locked_ingest(
            str(tmp_path),
            document_id=doc_id,
            user_id=user_id,
            project_id=project_id,
            embedding_provider=emb_provider,
            embedding_model=emb_model,
            embedding_api_key=emb_api_key,
        )
        chunks = result.get("chunks", 0)

        doc = UploadedDocument(
            id=uuid.UUID(doc_id),
            user_id=user_id,
            project_id=uuid.UUID(project_id),
            title=title,
            text_content=text.encode("utf-8"),
            type="txt",
            source=source,
            status="Indexed",
            chunks=chunks,
            size_kb=max(1, len(text) // 1024),
            meta_data=meta_data,
        )
        db.add(doc)
        db.commit()
        return doc_id
    except Exception as exc:
        logger.error(f"ClickUp ingest failed ({source} {meta_data.get('clickup_id')}): {exc}")
        db.rollback()
        return None
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def ingest_task(
    task: Dict,
    workspace_name: str,
    token: str,
    user_id: int,
    project_id: str,
    db: Session,
) -> Optional[str]:
    task_id = task.get("id", "")
    if not task_id:
        return None
    if _already_indexed("clickup_task", task_id, project_id, db):
        return None

    comments = fetch_task_comments(token, task_id)
    text = _format_task_text(task, comments, workspace_name)
    doc_id = str(uuid.uuid4())
    title = f"[ClickUp Task] {task.get('name', task_id)}"

    return _write_and_ingest(
        text=text,
        doc_id=doc_id,
        title=title,
        source="clickup_task",
        meta_data={
            "clickup_id": task_id,
            "task_name": task.get("name", ""),
            "status": (task.get("status") or {}).get("status", ""),
            "space": (task.get("space") or {}).get("name", ""),
            "list": (task.get("list") or {}).get("name", ""),
            "workspace_id": (task.get("team_id") or ""),
        },
        user_id=user_id,
        project_id=project_id,
        db=db,
    )


def ingest_chat_channel(
    view: Dict,
    messages: List[Dict],
    workspace_name: str,
    user_id: int,
    project_id: str,
    db: Session,
) -> Optional[str]:
    view_id = view.get("id", "")
    if not view_id or not messages:
        return None
    if _already_indexed("clickup_chat", view_id, project_id, db):
        return None

    view_name = view.get("name", view_id)
    text = _format_chat_text(view_name, workspace_name, messages)
    doc_id = str(uuid.uuid4())
    title = f"[ClickUp Chat] #{view_name}"

    return _write_and_ingest(
        text=text,
        doc_id=doc_id,
        title=title,
        source="clickup_chat",
        meta_data={
            "clickup_id": view_id,
            "channel_name": view_name,
            "message_count": len(messages),
        },
        user_id=user_id,
        project_id=project_id,
        db=db,
    )


def ingest_doc(
    doc: Dict,
    workspace_name: str,
    user_id: int,
    project_id: str,
    db: Session,
) -> Optional[str]:
    doc_id_cu = doc.get("id", "")
    if not doc_id_cu:
        return None
    if _already_indexed("clickup_doc", doc_id_cu, project_id, db):
        return None

    title_raw = doc.get("name") or doc.get("title") or "Untitled"
    text = _format_doc_text(doc, workspace_name)
    if len(text.strip()) < 10:
        return None
    doc_id = str(uuid.uuid4())
    title = f"[ClickUp Doc] {title_raw}"

    return _write_and_ingest(
        text=text,
        doc_id=doc_id,
        title=title,
        source="clickup_doc",
        meta_data={
            "clickup_id": doc_id_cu,
            "doc_title": title_raw,
        },
        user_id=user_id,
        project_id=project_id,
        db=db,
    )


def delete_integration_documents(project_id: str, db: Session) -> int:
    """Remove all ClickUp documents for a project from DB + ChromaDB."""
    from ..services.rag.singleton import get_pipeline

    docs = (
        db.query(UploadedDocument)
        .filter(
            UploadedDocument.project_id == uuid.UUID(project_id),
            UploadedDocument.source.in_(["clickup_task", "clickup_doc", "clickup_chat"]),
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
        logger.error(f"Error deleting ClickUp documents: {exc}")
        db.rollback()

    return deleted
