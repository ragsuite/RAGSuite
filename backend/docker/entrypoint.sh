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
#     then stamp the migration head so future upgrades apply incrementally.
#   - Existing DB: run incremental migrations up to head (previous behavior).

_ensure_schema_safety_net() {
  python - <<'PY'
"""Idempotent safety net for columns that migrations may have missed."""
from sqlalchemy import text
from app.db import engine

stmts = [
    """
    ALTER TABLE chatbot_settings
    ADD COLUMN IF NOT EXISTS store_history_enabled BOOLEAN NOT NULL DEFAULT true
    """,
    """
    ALTER TABLE search_settings
    ADD COLUMN IF NOT EXISTS store_history_enabled BOOLEAN NOT NULL DEFAULT true
    """,
    """
    ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER NULL
    """,
]
with engine.begin() as conn:
    for stmt in stmts:
        try:
            conn.execute(text(stmt))
        except Exception as exc:
            # Table may not exist yet on brand-new partial boots; non-fatal.
            print(f"WARNING: schema column ensure skipped: {exc}", flush=True)
print("schema column ensure complete", flush=True)
PY
}

_normalize_alembic_version_to_head() {
  # Dual-stamped DBs (branched heads both applied) make `upgrade head` fail with
  # "overlaps with other requested revisions". Purge + stamp is safe: schema is
  # already ensured by the idempotent column safety net / migrations.
  echo "WARNING: normalizing alembic_version to a single head stamp..."
  alembic stamp --purge head
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
    echo "Existing database detected (alembic revision: ${current_revision}). Running migrations..."
    if ! alembic upgrade head; then
      echo "WARNING: alembic upgrade failed — applying schema safety net, then retrying once..."
      _ensure_schema_safety_net || true
      if ! alembic upgrade head; then
        echo "WARNING: alembic upgrade still failing — attempting version-table normalize..."
        _ensure_schema_safety_net || true
        _normalize_alembic_version_to_head
        alembic upgrade head
      fi
    fi
  else
    echo "Fresh database detected. Creating schema from models, then stamping migration head..."
    python -c "from app.db import create_tables; create_tables()"
    alembic stamp head
  fi
  # Always ensure columns exist (covers stamp-only / partial upgrade paths).
  _ensure_schema_safety_net || true
fi

exec "$@"
