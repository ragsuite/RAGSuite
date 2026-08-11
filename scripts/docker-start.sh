#!/usr/bin/env bash
# Start the RAGSuite Docker Compose stack (API :9090, web :9191, data stores).
# Exit codes: 0 success, 1 prerequisite fail, 2 env invalid, 3 compose fail, 4 health timeout
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/ee-attach.sh
source "$SCRIPT_DIR/lib/ee-attach.sh"

ROOT="$(ragsuite_root)"
cd "$ROOT"

DETACH=0
for arg in "$@"; do
  case "$arg" in
    -d|--detach) DETACH=1 ;;
    -h|--help)
      echo "Usage: $0 [--detach|-d]"
      echo "  Start Docker stack (build + up). Use --detach for background (npm run up)."
      echo "  Without --detach: starts detached, waits for health, then follows logs."
      exit 0
      ;;
    *)
      log_err "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# --- Prerequisites (exit 1) ---
if ! require_cmd docker; then
  exit 1
fi
if ! docker_daemon_running; then
  log_err "Docker daemon is not running. Start Docker Desktop (or dockerd) and retry."
  exit 1
fi
if ! compose_cmd; then
  exit 1
fi
if ! require_cmd curl; then
  exit 1
fi

load_env_if_present "$ROOT/.env"
if ! assert_docker_start_allowed; then
  exit 1
fi

# --- Env (exit 2) ---
if ! ensure_dotenv_from_example; then
  exit 2
fi
load_env_if_present "$ROOT/.env"
if secrets_are_placeholders; then
  log_err "JWT_SECRET_KEY and CUSTOM_LLM_INTERNAL_API_KEY must be set to non-placeholder values in .env"
  log_err "Edit .env (copied from .env.example if missing) and replace change-me* secrets."
  exit 2
fi

# Phase 6/7: sibling EE, else ACTIVE installed bundle, else CE stubs.
ragsuite_resolve_ee_root
ragsuite_prepare_ee_compose_args

# Bind-mount sources must exist (Docker creates a root-owned *file* if the path is missing).
mkdir -p "$ROOT/.ragsuite/license" "$ROOT/extensions/installed/ee"
# Native + Docker must share one Chroma/staging tree (embeddings survive mode switches).
ensure_shared_vector_and_staging_dirs

# --- Compose (exit 3) ---
log_info "Starting Docker stack (project ragsuite-server)…"
set +e
ragsuite_docker_compose up -d --build
compose_rc=$?
set -e
if [[ "$compose_rc" -ne 0 ]]; then
  log_err "docker compose failed (exit $compose_rc)."
  exit 3
fi

# --- Health (exit 4) ---
if ! wait_for_api_health 60; then
  exit 4
fi

print_stack_urls
if [[ -n "${RAGSUITE_EE_ROOT:-}" ]]; then
  echo "  EE            ${RAGSUITE_EE_ROOT}"
else
  echo "  EE            (CE-only)"
fi
log_info "Docker stack is up (API :9090 · Web :9191)."

if [[ "$DETACH" -eq 1 ]]; then
  exit 0
fi

log_info "Following logs (Ctrl+C stops logs only; stack keeps running — use npm run down to stop)…"
ragsuite_docker_compose logs -f
