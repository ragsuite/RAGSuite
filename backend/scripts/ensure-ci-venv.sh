#!/usr/bin/env bash
# Create or update the CI-only Python venv (never touches backend/.venv).
#
# Usage:
#   eval "$(bash scripts/ensure-ci-venv.sh)"
#   # or: CI_PY="$(bash scripts/ensure-ci-venv.sh)" && "$CI_PY" -m pytest ...

set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/home/web/ragsuite_backend}"
CI_VENV="${CI_VENV:-$PROD_ROOT/.ci-venv}"
PYTHON_BIN="${PYTHON_BIN:-python3.14}"
APP_ROOT="$PROD_ROOT"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    echo "ERROR: python3.14/python3 not found" >&2
    exit 1
  fi
fi

PY_VERSION=$("$PYTHON_BIN" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
if [ "$PY_VERSION" != "3.14" ]; then
  echo "ERROR: Python 3.14 required for CI venv, found $PY_VERSION" >&2
  exit 1
fi

if [ ! -x "$CI_VENV/bin/python" ]; then
  echo "==> Creating CI venv at $CI_VENV" >&2
  "$PYTHON_BIN" -m venv "$CI_VENV"
fi

"$CI_VENV/bin/pip" install -q --upgrade pip
"$CI_VENV/bin/pip" install -q -r "$APP_ROOT/requirements.txt" -r "$APP_ROOT/requirements-dev.txt"

echo "$CI_VENV/bin/python"
