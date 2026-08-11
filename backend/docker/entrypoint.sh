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
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  current_revision="$(alembic current 2>/dev/null | grep -E '[0-9a-zA-Z]' || true)"
  if [ -n "$current_revision" ]; then
    echo "Existing database detected (alembic revision: ${current_revision}). Running migrations..."
    alembic upgrade head
  else
    echo "Fresh database detected. Creating schema from models, then stamping migration head..."
    python -c "from app.db import create_tables; create_tables()"
    alembic stamp head
  fi
fi

exec "$@"
