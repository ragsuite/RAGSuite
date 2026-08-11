#!/usr/bin/env bash
# Backend test runner for GitHub Actions and local CI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND="$ROOT/backend"
VENV="${CI_VENV:-$BACKEND/.ci-venv}"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  echo "==> Creating CI venv at $VENV"
  "$PYTHON_BIN" -m venv "$VENV"
fi

"$VENV/bin/pip" install -q --upgrade pip
# CPU torch first — avoids multi-GB CUDA wheels filling CI disks.
"$VENV/bin/pip" install -q --prefer-binary \
  --index-url https://download.pytorch.org/whl/cpu \
  torch
"$VENV/bin/pip" install -q --prefer-binary -r "$BACKEND/requirements.txt" -r "$BACKEND/requirements-dev.txt"

export DATABASE_URL="${DATABASE_URL:-sqlite:///:memory:}"
export JWT_SECRET_KEY="${JWT_SECRET_KEY:-ci-test-jwt-secret-key-not-the-default-placeholder}"
export CUSTOM_LLM_INTERNAL_API_KEY="${CUSTOM_LLM_INTERNAL_API_KEY:-ci-test-llm-internal-api-key-for-tests}"
export SMTP_HOST="${SMTP_HOST:-smtp.example.com}"
export SMTP_PORT="${SMTP_PORT:-587}"
export SMTP_USER="${SMTP_USER:-ci-smtp-user}"
export SMTP_PASSWORD="${SMTP_PASSWORD:-ci-smtp-password}"
export SMTP_USE_TLS="${SMTP_USE_TLS:-true}"
export EMAIL_FROM="${EMAIL_FROM:-ci@example.com}"
export HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}"
export DEBUG="${DEBUG:-true}"
export RAGSUITE_EE_ROOT="${RAGSUITE_EE_ROOT:-}"
PYTEST_MARK_EXPR="${PYTEST_MARK_EXPR:-not ee}"

cd "$BACKEND"
echo "==> pytest ($( "$VENV/bin/python" --version ))"
"$VENV/bin/python" -m pytest tests/ -q --tb=short -m "$PYTEST_MARK_EXPR" "$@"
