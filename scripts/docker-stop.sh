#!/usr/bin/env bash
# Stop the RAGSuite Docker Compose stack without removing volumes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/ee-attach.sh
source "$SCRIPT_DIR/lib/ee-attach.sh"

ROOT="$(ragsuite_root)"
cd "$ROOT"

if ! require_cmd docker; then
  exit 1
fi
if ! docker_daemon_running; then
  log_err "Docker daemon is not running."
  exit 1
fi
if ! compose_cmd; then
  exit 1
fi

load_env_if_present "$ROOT/.env"

# Match start-time compose files (CE-only vs EE overlay) so project tear-down is consistent.
ragsuite_resolve_ee_root
ragsuite_prepare_ee_compose_args

log_info "Stopping Docker stack (volumes preserved)…"
ragsuite_docker_compose down

# Confirm project containers are stopped
running="$(ragsuite_docker_compose ps -q 2>/dev/null || true)"
if [[ -n "${running//[$'\t\r\n']/}" ]]; then
  log_warn "Some compose services may still be listed as running."
  ragsuite_docker_compose ps
  exit 1
fi

log_info "Containers stopped. Postgres named volume kept; Chroma/staging live under backend/data/."
echo "  Shared embeddings: backend/data/chroma_db (same path native mode uses)"
echo "  To wipe Postgres later (destructive): docker compose down -v"
echo "  List volumes: docker volume ls | grep ragsuite"
exit 0
