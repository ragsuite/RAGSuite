#!/usr/bin/env bash
# Manual deploy script — mirrors GitLab CI/CD deploy steps.
# Run on the production server from the repo root.
#
# Usage:
#   bash scripts/deploy.sh
#   bash scripts/deploy.sh --sync              # git pull origin/server first
#   bash scripts/deploy.sh --skip-migrate
#   bash scripts/deploy.sh --skip-backup

set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/home/web/ragsuite_backend}"
VENV_BIN="$PROD_ROOT/.venv/bin"
SKIP_MIGRATE=false
SKIP_BACKUP=false
DO_SYNC=false
BACKUP_BEFORE_MIGRATE="${BACKUP_BEFORE_MIGRATE:-true}"

for arg in "$@"; do
  case $arg in
    --skip-migrate)  SKIP_MIGRATE=true ;;
    --skip-backup)   SKIP_BACKUP=true ;;
    --sync)          DO_SYNC=true ;;
  esac
done

echo "==> RAGSuite backend deploy"
echo "    PROD_ROOT: $PROD_ROOT"

if [ ! -d "$PROD_ROOT/.git" ]; then
  echo "ERROR: $PROD_ROOT is not a git repo"
  exit 1
fi
if [ ! -x "$VENV_BIN/python" ]; then
  echo "ERROR: Python venv not found at $VENV_BIN"
  echo "       Run: python3.14 -m venv $PROD_ROOT/.venv && $VENV_BIN/pip install -r $PROD_ROOT/requirements.txt"
  exit 1
fi

if [ "$DO_SYNC" = true ]; then
  echo "==> Syncing from Git"
  bash "$PROD_ROOT/scripts/sync-from-git.sh"
fi

echo "==> Installing backend dependencies"
"$VENV_BIN/pip" install -q -r "$PROD_ROOT/requirements.txt"

if [ "$SKIP_MIGRATE" = false ]; then
  if [ "$SKIP_BACKUP" = false ] && [ "$BACKUP_BEFORE_MIGRATE" = "true" ]; then
    if [ -z "${DATABASE_URL:-}" ]; then
      echo "ERROR: BACKUP_BEFORE_MIGRATE requires DATABASE_URL"
      exit 1
    fi
    echo "==> Database backup"
    BACKUP_DIR=/var/backups/ragsuite bash "$PROD_ROOT/scripts/backup_db.sh"
  fi
  echo "==> Running database migrations"
  (cd "$PROD_ROOT" && "$VENV_BIN/alembic" upgrade head)
fi

echo "==> Restarting application (Chroma, worker, API)"
bash "$PROD_ROOT/scripts/restart-app.sh"
bash "$PROD_ROOT/scripts/health-check.sh"

echo ""
echo "==> Deploy complete"
