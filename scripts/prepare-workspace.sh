#!/usr/bin/env bash
# One-shot workspace prepare: CE deps + optional EE discovery (does not require EE).
# Exit 0 even when RAGSUITE_EE is absent (community contributors).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/ee-attach.sh
source "$SCRIPT_DIR/lib/ee-attach.sh"

ROOT="$(ragsuite_root)"
cd "$ROOT"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"

log_info "Preparing RAGSuite workspace (CE)…"

if ! ensure_dotenv_from_example; then
  log_err "Could not create .env from .env.example"
  exit 1
fi

if ! require_cmd node; then exit 1; fi
if ! require_cmd yarn; then exit 1; fi
if ! require_cmd python3; then exit 1; fi

# Backend venv
VENV="$BACKEND/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  log_info "Creating backend venv…"
  if [[ -x "$BACKEND/scripts/setup.sh" ]]; then
    bash "$BACKEND/scripts/setup.sh"
  else
    log_err "Missing backend/scripts/setup.sh"
    exit 1
  fi
else
  log_info "Backend venv already present"
fi

# Frontend deps
if [[ ! -d "$FRONTEND/node_modules" ]]; then
  log_info "yarn install (frontend)…"
  (cd "$FRONTEND" && yarn install)
else
  log_info "frontend/node_modules already present"
fi

# Symlink backend/.env → root .env when missing
if [[ ! -e "$BACKEND/.env" && -f "$ROOT/.env" ]]; then
  ln -sf ../.env "$BACKEND/.env" || true
fi

echo ""
log_info "EE discovery:"
ragsuite_print_ee_status
echo ""
log_info "Workspace ready. Start with: npm start"
log_info "Stop with:  npm run stop"
exit 0
