#!/bin/sh
set -e

# Database bootstrap.
#
# The core tables (chat_messages, crawl_sources, crawl_jobs, llm_configs, projects,
# uploaded_documents, ...) are defined only in the SQLAlchemy models and are created
# via create_all(); the Alembic migrations are written to *adjust* a schema that
# already exists, not to build it from an empty database. Replaying the migration
# chain against a brand-new DB fails (e.g. the initial migration ALTERs crawl_jobs
# before any migration creates it).
#
# So we branch on whether Alembic has ever run against this database:
#   - Fresh DB (no alembic_version row): build the full schema from the models,
#     then stamp the migration head(s) so future upgrades apply incrementally.
#   - Existing DB: run incremental migrations up to all heads.
#
# IMPORTANT: This repo historically has multiple Alembic branch tips. Always use
# `upgrade heads` / `stamp heads` (plural). Singular `head` fails when branches
# exist — that is why manual `alembic upgrade head` often fails on servers.
# Server deploy path: `docker compose up -d --build` (entrypoint runs this script).

_ensure_schema_safety_net() {
  python - <<'PY'
"""Idempotent safety net: columns that migrations may have missed on multi-head DBs."""
from sqlalchemy import text
from app.db import engine

stmts = [
    """
    ALTER TABLE chatbot_settings
    ADD COLUMN IF NOT EXISTS store_history_enabled BOOLEAN NOT NULL DEFAULT true
    """,
    """
    ALTER TABLE chatbot_settings
    ADD COLUMN IF NOT EXISTS widget_voice_pilot_enabled BOOLEAN DEFAULT false
    """,
    """
    ALTER TABLE chatbot_settings
    ADD COLUMN IF NOT EXISTS widget_voice_pilot_provider VARCHAR(32) DEFAULT 'elevenlabs'
    """,
    """
    ALTER TABLE chatbot_settings
    ADD COLUMN IF NOT EXISTS widget_voice_pilot_orb_name VARCHAR(120) NULL
    """,
    """
    ALTER TABLE search_settings
    ADD COLUMN IF NOT EXISTS store_history_enabled BOOLEAN NOT NULL DEFAULT true
    """,
    """
    ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS show_system_footer BOOLEAN NOT NULL DEFAULT true
    """,
    """
    ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS logo_data_url TEXT NULL
    """,
    """
    ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) NULL
    """,
    """
    ALTER TABLE voice_pilot_settings
    ADD COLUMN IF NOT EXISTS voice_provider VARCHAR(32) NOT NULL DEFAULT 'elevenlabs'
    """,
    """
    ALTER TABLE voice_pilot_settings
    ADD COLUMN IF NOT EXISTS provider_voice_state JSON NULL
    """,
    """
    ALTER TABLE voice_pilot_settings
    ADD COLUMN IF NOT EXISTS voice_configurations JSON NULL
    """,
]
with engine.begin() as conn:
    for stmt in stmts:
        try:
            conn.execute(text(stmt))
        except Exception as exc:
            # Table may not exist yet on brand-new partial boots; non-fatal.
            print(f"WARNING: schema column ensure skipped: {exc}", flush=True)

    # Idempotent backfill: copy logo/color from member settings onto orgs that
    # still have NULL branding. Never overwrites a non-null org value.
    try:
        org_ids = [
            row[0]
            for row in conn.execute(
                text(
                    """
                    SELECT id FROM organizations
                    WHERE logo_data_url IS NULL OR primary_color IS NULL
                    """
                )
            ).fetchall()
        ]
        for org_id in org_ids:
            rows = conn.execute(
                text(
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
                ),
                {"org_id": org_id},
            ).fetchall()
            logo = None
            color = None
            for logo_data_url, primary_color, _role in rows:
                if logo is None and logo_data_url and str(logo_data_url).strip():
                    logo = str(logo_data_url).strip()
                if color is None and primary_color and str(primary_color).strip():
                    color = str(primary_color).strip()
                if logo is not None and color is not None:
                    break
            if logo is None and color is None:
                continue
            conn.execute(
                text(
                    """
                    UPDATE organizations
                    SET
                      logo_data_url = COALESCE(logo_data_url, :logo),
                      primary_color = COALESCE(primary_color, :color)
                    WHERE id = :org_id
                    """
                ),
                {"logo": logo, "color": color, "org_id": org_id},
            )
    except Exception as exc:
        print(f"WARNING: org branding backfill skipped: {exc}", flush=True)

print("schema column ensure complete", flush=True)
PY
}

_normalize_alembic_version_to_heads() {
  # Dual-stamped / branched DBs can leave alembic_version inconsistent.
  # Purge + stamp all heads is safe after the idempotent column safety net.
  echo "WARNING: normalizing alembic_version to all heads..."
  alembic stamp --purge heads
}

_check_duplicate_alembic_revisions() {
  python - <<'PY'
from collections import defaultdict
from pathlib import Path
import re
import sys

by = defaultdict(list)
root = Path("alembic/versions")
if not root.is_dir():
    sys.exit(0)
for p in root.glob("*.py"):
    text = p.read_text(encoding="utf-8", errors="ignore")
    m = re.search(r"^revision\s*[:=]\s*['\"]([^'\"]+)['\"]", text, re.M)
    if m:
        by[m.group(1)].append(p.name)
dups = {k: v for k, v in by.items() if len(v) > 1}
if dups:
    print("FATAL: duplicate Alembic revision IDs detected:", flush=True)
    for rev, files in sorted(dups.items()):
        print(f"  {rev}: {', '.join(files)}", flush=True)
    print(
        "Remove the conflicting migration file(s) so each revision ID is unique, then rebuild.",
        flush=True,
    )
    sys.exit(1)
PY
}

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  _check_duplicate_alembic_revisions
  current_revision="$(alembic current 2>/dev/null | grep -E '[0-9a-zA-Z]' || true)"
  if [ -n "$current_revision" ]; then
    echo "Existing database detected (alembic revision: ${current_revision}). Running migrations (all heads)..."
    if ! alembic upgrade heads; then
      echo "WARNING: alembic upgrade heads failed — applying schema safety net, then retrying once..."
      _ensure_schema_safety_net || true
      if ! alembic upgrade heads; then
        echo "WARNING: alembic upgrade still failing — normalizing version table to heads..."
        _ensure_schema_safety_net || true
        _normalize_alembic_version_to_heads
        alembic upgrade heads || true
      fi
    fi
  else
    echo "Fresh database detected. Creating schema from models, then stamping all migration heads..."
    python -c "from app.db import create_tables; create_tables()"
    alembic stamp heads
  fi
  # Always ensure columns exist (covers stamp-only / partial upgrade / multi-head paths).
  _ensure_schema_safety_net || true
fi

exec "$@"
