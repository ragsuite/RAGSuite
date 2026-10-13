"""Idempotent safety net for columns that migrations may have missed (multi-head DBs).

Run from container entrypoints: ``python -m app.schema_safety_net``.
"""
from __future__ import annotations

from typing import List, Set, Tuple

from sqlalchemy import text

from app.db import engine

# (table, column, column DDL)
COLUMNS: List[Tuple[str, str, str]] = [
    ("chatbot_settings", "store_history_enabled", "BOOLEAN NOT NULL DEFAULT true"),
    ("chatbot_settings", "widget_voice_pilot_enabled", "BOOLEAN DEFAULT false"),
    ("chatbot_settings", "widget_voice_pilot_provider", "VARCHAR(32) DEFAULT 'elevenlabs'"),
    ("chatbot_settings", "widget_voice_pilot_orb_name", "VARCHAR(120) NULL"),
    ("search_settings", "store_history_enabled", "BOOLEAN NOT NULL DEFAULT true"),
    ("organizations", "session_timeout_minutes", "INTEGER NULL"),
    ("organizations", "show_system_footer", "BOOLEAN NOT NULL DEFAULT true"),
    ("organizations", "logo_data_url", "TEXT NULL"),
    ("organizations", "primary_color", "VARCHAR(7) NULL"),
    ("voice_pilot_settings", "voice_provider", "VARCHAR(32) NOT NULL DEFAULT 'elevenlabs'"),
    ("voice_pilot_settings", "provider_voice_state", "JSON NULL"),
    ("voice_pilot_settings", "voice_configurations", "JSON NULL"),
    ("chat_messages", "feedback_at", "TIMESTAMP WITH TIME ZONE NULL"),
    ("crawl_sources", "use_in_answers", "BOOLEAN NOT NULL DEFAULT true"),
    ("uploaded_documents", "use_in_answers", "BOOLEAN NOT NULL DEFAULT true"),
]
# ADD COLUMN IF NOT EXISTS still takes an ACCESS EXCLUSIVE lock even when the column exists;
# queued behind a long worker transaction it blocks every read of the table.
LOCK_TIMEOUT = "10s"


def _existing_columns() -> Set[Tuple[str, str]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema()"
            )
        ).all()
    return {(row[0], row[1]) for row in rows}


def missing_columns(existing: Set[Tuple[str, str]]) -> List[Tuple[str, str, str]]:
    return [col for col in COLUMNS if (col[0], col[1]) not in existing]


_ORGS_MISSING_BRANDING = text(
    """
    SELECT id FROM organizations
    WHERE logo_data_url IS NULL OR primary_color IS NULL
    """
)
_MEMBER_BRANDING = text(
    """
    SELECT s.logo_data_url, s.primary_color, m.role
    FROM settings s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN organization_members m
      ON m.user_id = u.id AND m.org_id = u.org_id
    WHERE u.org_id = :org_id
    ORDER BY
      CASE WHEN m.role = 'org_admin' THEN 0 ELSE 1 END,
      CASE
        WHEN s.logo_data_url IS NOT NULL AND btrim(s.logo_data_url) <> '' THEN 0
        ELSE 1
      END,
      s.updated_at DESC NULLS LAST
    """
)
_SET_ORG_BRANDING = text(
    """
    UPDATE organizations
    SET
      logo_data_url = COALESCE(logo_data_url, :logo),
      primary_color = COALESCE(primary_color, :color)
    WHERE id = :org_id
    """
)


def backfill_org_branding() -> None:
    """Copy logo/color from member settings onto orgs that still have NULL branding.

    Idempotent; never overwrites a non-null org value.
    """
    try:
        with engine.begin() as conn:
            org_ids = [row[0] for row in conn.execute(_ORGS_MISSING_BRANDING).fetchall()]
            for org_id in org_ids:
                logo = None
                color = None
                for logo_data_url, primary_color, _role in conn.execute(_MEMBER_BRANDING, {"org_id": org_id}).fetchall():
                    if logo is None and logo_data_url and str(logo_data_url).strip():
                        logo = str(logo_data_url).strip()
                    if color is None and primary_color and str(primary_color).strip():
                        color = str(primary_color).strip()
                    if logo is not None and color is not None:
                        break
                if logo is None and color is None:
                    continue
                conn.execute(_SET_ORG_BRANDING, {"logo": logo, "color": color, "org_id": org_id})
    except Exception as exc:
        print(f"WARNING: org branding backfill skipped: {exc}", flush=True)


def main() -> None:
    for table, column, ddl in missing_columns(_existing_columns()):
        try:
            with engine.begin() as conn:
                conn.execute(text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl}"))
        except Exception as exc:
            # Table may not exist yet on brand-new partial boots, or the lock wait timed out.
            print(f"WARNING: schema column ensure skipped: {exc}", flush=True)
    backfill_org_branding()
    print("schema column ensure complete", flush=True)


if __name__ == "__main__":
    main()
