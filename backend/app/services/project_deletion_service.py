"""
Delete a project and all relational rows that reference it.

Most project FKs use NO ACTION, so a bare ORM delete on Project fails once the
project has crawl sources, settings, chat history, etc.
"""
from __future__ import annotations

import logging
import uuid
from typing import Union

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ProjectId = Union[uuid.UUID, str]


def _project_id_param(project_id: ProjectId) -> dict[str, str]:
    return {"pid": str(project_id)}


def delete_project_related_rows(db: Session, project_id: ProjectId) -> None:
    """
    Remove all rows that block deleting ``projects.id = project_id``.

    Caller is responsible for commit/rollback and vector purge after success.
    """
    params = _project_id_param(project_id)
    pid_expr = "CAST(:pid AS uuid)"

    statements = [
        # Crawl tree
        f"""DELETE FROM documents WHERE source_id IN (
            SELECT id FROM crawl_sources WHERE project_id = {pid_expr})""",
        f"""DELETE FROM crawl_jobs WHERE source_id IN (
            SELECT id FROM crawl_sources WHERE project_id = {pid_expr})""",
        f"DELETE FROM crawl_sources WHERE project_id = {pid_expr}",
        # Gmail tree
        f"""DELETE FROM gmail_staged_messages WHERE integration_id IN (
            SELECT id FROM gmail_integrations WHERE project_id = {pid_expr})""",
        f"""DELETE FROM gmail_sync_jobs WHERE integration_id IN (
            SELECT id FROM gmail_integrations WHERE project_id = {pid_expr})""",
        f"DELETE FROM gmail_project_credentials WHERE project_id = {pid_expr}",
        f"DELETE FROM gmail_integrations WHERE project_id = {pid_expr}",
        # ClickUp tree
        f"""DELETE FROM clickup_sync_jobs WHERE integration_id IN (
            SELECT id FROM clickup_integrations WHERE project_id = {pid_expr})""",
        f"DELETE FROM clickup_integrations WHERE project_id = {pid_expr}",
        # Chat / analytics
        f"""DELETE FROM query_logs WHERE project_id = {pid_expr}
            OR chat_message_id IN (
                SELECT id FROM chat_messages WHERE project_id = {pid_expr})""",
        f"DELETE FROM chat_messages WHERE project_id = {pid_expr}",
        f"DELETE FROM uploaded_documents WHERE project_id = {pid_expr}",
        f"DELETE FROM analytics_days WHERE project_id = {pid_expr}",
        # Integrations / config (n8n references api_keys — delete first)
        f"DELETE FROM n8n_integrations WHERE project_id = {pid_expr}",
        f"DELETE FROM api_keys WHERE project_id = {pid_expr}",
        f"DELETE FROM chatbot_settings WHERE project_id = {pid_expr}",
        f"DELETE FROM search_settings WHERE project_id = {pid_expr}",
        f"DELETE FROM webhooks WHERE project_id = {pid_expr}",
        f"DELETE FROM model_config_profiles WHERE project_id = {pid_expr}",
        f"DELETE FROM reindex_jobs WHERE project_id = {pid_expr}",
        f"DELETE FROM background_jobs WHERE project_id = {pid_expr}",
        f"DELETE FROM audit_events WHERE project_id = {pid_expr}",
        f"DELETE FROM job_archive WHERE project_id = {pid_expr}",
        f"DELETE FROM projects WHERE id = {pid_expr}",
    ]

    for stmt in statements:
        db.execute(text(stmt), params)

    logger.info("Deleted relational data for project %s", project_id)
