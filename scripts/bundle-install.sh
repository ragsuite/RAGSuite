#!/usr/bin/env bash
# Install an Enterprise bundle into CE extensions/installed/ee/
# Requires: valid offline.key + vendor-signed tar (lab: --allow-unsigned only).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
ROOT="$(ragsuite_root)"
BACKEND="$ROOT/backend"
VENV="$BACKEND/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  log_err "Missing backend/.venv — run: npm run setup"
  exit 1
fi
cd "$BACKEND"
export PYTHONPATH="$BACKEND${PYTHONPATH:+:$PYTHONPATH}"
exec "$VENV/bin/python" -m app.platform.bundle_install "$@"
