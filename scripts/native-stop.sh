#!/usr/bin/env bash
# Stop native (host) mode processes recorded under .ragsuite/native/*.pid.
# Idempotent. Does not touch Docker Compose or volumes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

ROOT="$(ragsuite_root)"
cd "$ROOT"

# EE is path-attached only (no separate EE processes). Clear debug marker.
if [[ -f "$ROOT/.ragsuite/ee-root" ]]; then
  log_info "EE attach marker left at .ragsuite/ee-root (path attach; nothing to kill)"
fi

PID_DIR="$ROOT/.ragsuite/native"
if [[ -d "$PID_DIR" ]]; then
  log_info "Stopping native processes…"
  # Frontend first (may spawn children), then API/worker/chroma
  for name in frontend api worker chroma; do
    if [[ -f "$PID_DIR/${name}.pid" ]]; then
      pid="$(tr -d '[:space:]' < "$PID_DIR/${name}.pid" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        log_info "Stopping ${name} (pid ${pid})…"
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      fi
      stop_pid_file "$name"
    fi
  done
else
  log_info "No .ragsuite/native PID dir — checking for orphan listeners…"
fi

# Best-effort: free Metro + API if orphaned listeners remain (PID file lost / wrong install)
api_port="$(default_api_port)"
metro_port="$(default_metro_port)"
if command -v lsof >/dev/null 2>&1; then
  for port in "$metro_port"; do
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    for p in $pids; do
      cmd="$(ps -p "$p" -o comm= 2>/dev/null || true)"
      case "$cmd" in
        node|expo|*yarn*|*metro*) kill "$p" 2>/dev/null || true ;;
      esac
    done
  done
  # Free API :9090 if a leftover Python/uvicorn still listens (does not touch Docker/DB)
  pids="$(lsof -tiTCP:"$api_port" -sTCP:LISTEN 2>/dev/null || true)"
  for p in $pids; do
    cmd="$(ps -p "$p" -o comm= 2>/dev/null || true)"
    args="$(ps -p "$p" -o args= 2>/dev/null || true)"
    case "$cmd" in
      Python|python*|uvicorn)
        log_info "Stopping orphan API listener on :${api_port} (pid ${p})…"
        kill "$p" 2>/dev/null || true
        ;;
      *)
        if echo "$args" | grep -Eqi 'uvicorn|app\.main:app'; then
          log_info "Stopping orphan API listener on :${api_port} (pid ${p})…"
          kill "$p" 2>/dev/null || true
        fi
        ;;
    esac
  done
  sleep 1
fi

# Free :9090/:9191 if a previous Docker app stack left containers running.
# Does NOT stop postgres/redis and never uses down -v (data preserved).
stop_leftover_compose_app_containers

if [[ -d "$PID_DIR" ]] && native_pids_alive; then
  log_warn "Some native PIDs still alive — check $PID_DIR"
  exit 1
fi

log_info "Native app stopped. Postgres/Redis data volumes were not touched."
exit 0
