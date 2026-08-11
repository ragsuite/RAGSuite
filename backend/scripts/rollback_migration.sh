#!/bin/bash
# Alembic migration rollback helper.
# Usage: ./rollback_migration.sh        → rolls back 1 migration
#        ./rollback_migration.sh -2     → rolls back 2 migrations
#        ./rollback_migration.sh abc123 → rolls back to specific revision
#
# WARNING: Some migrations are not reversible (e.g. data deletions).
# If downgrade() raises NotImplementedError, restore from pg_dump instead.

set -e

STEP="${1:--1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
VENV_BIN="$BACKEND_DIR/.venv/bin"

if [ ! -x "$VENV_BIN/alembic" ]; then
  echo "ERROR: alembic not found at $VENV_BIN/alembic"
  echo "Run from backend directory with venv activated, or adjust VENV_BIN path."
  exit 1
fi

echo "Rolling back to: $STEP"
echo "Current head:"
cd "$BACKEND_DIR" && "$VENV_BIN/alembic" current

read -r -p "Proceed with downgrade to '$STEP'? [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

"$VENV_BIN/alembic" downgrade "$STEP"
echo "Rollback complete. Current state:"
"$VENV_BIN/alembic" current
