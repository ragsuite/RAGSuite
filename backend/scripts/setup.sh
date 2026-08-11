#!/usr/bin/env bash
# Bootstrap local development environment for RAGSuite backend.
# Run from the repo root: bash scripts/setup.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> RAGSuite backend dev setup"
echo "    Repo root: $REPO_ROOT"

# --- Python version check ---
PYTHON_BIN="${PYTHON_BIN:-python3.14}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    echo "ERROR: $PYTHON_BIN not found. Install Python 3.14 and re-run."
    exit 1
fi

PY_VERSION=$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [ "$PY_VERSION" != "3.14" ]; then
    echo "ERROR: Python 3.14 required, found $PY_VERSION. Set PYTHON_BIN=python3.14 or install Python 3.14."
    exit 1
fi

echo "==> Python $PY_VERSION found"

# --- venv (rebuild if missing or left over from a previous folder location) ---
VENV_DIR="$REPO_ROOT/.venv"
venv_needs_rebuild=false
if [ ! -x "$VENV_DIR/bin/python" ]; then
    venv_needs_rebuild=true
elif [ -f "$VENV_DIR/bin/pip" ]; then
    venv_shebang="$(head -1 "$VENV_DIR/bin/pip" 2>/dev/null || true)"
    if [ -n "$venv_shebang" ] && [[ "$venv_shebang" != *"$REPO_ROOT"* ]]; then
        echo "==> .venv still points at a previous location — rebuilding for $REPO_ROOT"
        venv_needs_rebuild=true
    fi
fi
if [ "$venv_needs_rebuild" = true ]; then
    echo "==> Creating venv at $VENV_DIR"
    rm -rf "$VENV_DIR"
    "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

echo "==> Installing dependencies"
if [ ! -x "$VENV_DIR/bin/pip" ]; then
    echo "==> Bootstrapping pip in venv"
    "$VENV_DIR/bin/python" -m ensurepip --upgrade
fi

"$VENV_DIR/bin/python" -m pip install -q --upgrade pip
"$VENV_DIR/bin/python" -m pip install -q -r "$REPO_ROOT/requirements.txt"

# Install dev requirements if present
if [ -f "$REPO_ROOT/requirements-dev.txt" ]; then
    "$VENV_DIR/bin/python" -m pip install -q -r "$REPO_ROOT/requirements-dev.txt"
fi

# Install Playwright browsers
echo "==> Installing Playwright browsers (required for JS-rendered crawling)"
"$VENV_DIR/bin/playwright" install chromium --with-deps 2>/dev/null || \
    echo "    Warning: Playwright browser install failed. Crawls on JS-heavy sites may not work."

# --- .env ---
if [ ! -f "$REPO_ROOT/.env" ]; then
    echo "==> Creating .env from .env.example"
    cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
    echo "    ACTION REQUIRED: Edit .env — set JWT_SECRET_KEY, CUSTOM_LLM_INTERNAL_API_KEY, and SMTP_*"
fi

# --- Local data dirs (under repo root; move with the project) ---
mkdir -p "$REPO_ROOT/data/chroma_db" "$REPO_ROOT/data/staging" "$REPO_ROOT/data/redis"

# --- Optional: recover local data left at a previous checkout path ---
migrate_dir_if_empty() {
    local name="$1"
    local dest="$REPO_ROOT/data/$name"
    local src_root
    for src_root in \
        "${RAGSUITE_MIGRATE_FROM:-}" \
        "$HOME/Desktop/RAGSuite_Server" \
        "$HOME/Documents/RAGSuite_Server"; do
        if [ -z "$src_root" ]; then
            continue
        fi
        src_root="${src_root%/}/backend"
        if [ "$src_root" = "$REPO_ROOT" ] || [ ! -d "$src_root/data/$name" ]; then
            continue
        fi
        if [ -z "$(ls -A "$dest" 2>/dev/null)" ] && [ -n "$(ls -A "$src_root/data/$name" 2>/dev/null)" ]; then
            echo "==> Migrating data/$name from previous location: $src_root"
            cp -a "$src_root/data/$name/." "$dest/"
            break
        fi
    done
}
migrate_dir_if_empty chroma_db
migrate_dir_if_empty staging
migrate_dir_if_empty redis

# --- Database ---
if [ -f "$REPO_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi
DB_NAME="${DATABASE_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
if [ -n "${DATABASE_URL:-}" ] && command -v psql >/dev/null 2>&1; then
    if ! psql "$DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
        echo "==> Creating PostgreSQL database: ${DB_NAME}"
        ADMIN_URL="$(echo "$DATABASE_URL" | sed -E 's#/[^/?]+([?].*)?$#/postgres\1#')"
        if ! psql "$ADMIN_URL" -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
            psql "$ADMIN_URL" -c "CREATE DATABASE \"${DB_NAME}\";" || \
                echo "    Warning: could not create ${DB_NAME}. Create it manually if migrations fail."
        fi
    fi
fi

# --- Alembic migrations ---
echo "==> Running database migrations"
current_revision="$(cd "$REPO_ROOT" && "$VENV_DIR/bin/alembic" current 2>/dev/null | rg '[0-9a-zA-Z]' || true)"
if [ -n "$current_revision" ]; then
    (cd "$REPO_ROOT" && "$VENV_DIR/bin/alembic" upgrade head) || \
        echo "    Warning: Migration failed. Ensure DATABASE_URL in .env is correct and PostgreSQL is running."
else
    echo "==> Fresh database detected. Creating schema and stamping Alembic head"
    if (cd "$REPO_ROOT" && "$VENV_DIR/bin/python" -c "from app.db import create_tables; create_tables()" \
        && "$VENV_DIR/bin/alembic" stamp head); then
        echo "    Fresh DB bootstrap complete."
    else
        echo "    Warning: Fresh DB bootstrap failed. Ensure DATABASE_URL in .env is correct and PostgreSQL is running."
    fi
fi

echo ""
echo "==> Setup complete!"
echo ""
echo "    Repo root:       $REPO_ROOT"
echo "    Start API:       source .venv/bin/activate && python run.py"
echo "    Start all-in-one: ./start.sh"
echo ""
echo "    Prefer full stack: cd .. && npm start  (API :9090, web :9191)"
echo "    Host uvicorn:      python run.py      (API :8000)"
echo "    Chroma (host):     http://127.0.0.1:8004"
echo "    Redis (compose):   localhost:6382"
echo "    Frontend URL:      http://localhost:9191 (FRONTEND_BASE_URL)"
