#!/usr/bin/env bash
# Repo-local verification: backend unit tests.
#
# Backend:  pytest (needs .venv with requirements.txt + requirements-dev.txt)
#
# Usage:
#   ./scripts/local-check.sh
# Optional: PYTHON=/path/to/python3.14 if you do not use .venv

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${PYTHON:-}" ]]; then
  PY="$PYTHON"
elif [[ -x "$ROOT/.venv/bin/python" ]]; then
  PY="$ROOT/.venv/bin/python"
else
  PY="python3"
fi

echo "== Backend: pytest (Python: $PY) =="
cd "$ROOT"
if ! "$PY" -c "import pytest" 2>/dev/null; then
  echo "error: pytest is not installed for this interpreter." >&2
  echo "  python3.14 -m venv .venv && source .venv/bin/activate" >&2
  echo "  pip install -r requirements.txt -r requirements-dev.txt" >&2
  exit 1
fi
"$PY" -m pytest tests/
