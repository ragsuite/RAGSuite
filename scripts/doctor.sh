#!/usr/bin/env bash
# Environment / prerequisite checklist for Docker and Native modes.
# Does not start services. Exit non-zero if RAGSUITE_MODE (default: native) critical checks fail.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

ROOT="$(ragsuite_root)"
cd "$ROOT"

load_env_if_present "$ROOT/.env"

MODE="${RAGSUITE_MODE:-native}"
MODE="$(printf '%s' "$MODE" | tr '[:upper:]' '[:lower:]')"

# Smoke/CI: skip host Postgres/Redis TCP checks (ports "available" ≠ services up).
# Real local doctor still requires them. Force checks in CI with RAGSUITE_DOCTOR_STRICT=1.
SKIP_RUNTIME=0
if [[ "${RAGSUITE_DOCTOR_SKIP_RUNTIME:-}" == "1" ]]; then
  SKIP_RUNTIME=1
elif [[ "${CI:-}" == "true" && "${RAGSUITE_DOCTOR_STRICT:-}" != "1" ]]; then
  SKIP_RUNTIME=1
fi

DOCKER_FAIL=0
NATIVE_FAIL=0

ok() { printf '✓ %s\n' "$*"; }
bad_docker() { printf '✗ %s\n' "$*"; DOCKER_FAIL=1; }
bad_native() { printf '✗ %s\n' "$*"; NATIVE_FAIL=1; }
note() { printf '· %s\n' "$*"; }

echo "RAGSuite doctor"
echo "Repo: $ROOT"
echo "Selected mode (RAGSUITE_MODE): ${MODE}"
if [[ "$SKIP_RUNTIME" -eq 1 ]]; then
  echo "Runtime TCP checks: skipped (CI smoke / RAGSUITE_DOCTOR_SKIP_RUNTIME=1)"
fi
echo ""

# ---------- Shared ----------
echo "=== Shared ==="
if command -v node >/dev/null 2>&1; then
  node_ver="$(node -v 2>/dev/null | sed 's/^v//')"
  node_major="${node_ver%%.*}"
  if [[ "${node_major:-0}" -ge 18 ]]; then
    ok "Node.js v${node_ver} (>=18)"
  else
    bad_docker "Node.js v${node_ver} — need >=18"
    bad_native "Node.js v${node_ver} — need >=18"
  fi
else
  bad_docker "Node.js not found (need >=18)"
  bad_native "Node.js not found (need >=18)"
fi

if command -v python3 >/dev/null 2>&1; then
  ok "Python3 ($(python3 --version 2>/dev/null))"
else
  bad_native "Python3 not found"
  note "Python3 missing (required for native; Docker image has its own)"
fi

if [[ -f "$ROOT/.env" ]]; then
  ok ".env exists"
else
  bad_docker ".env missing (copy from .env.example)"
  bad_native ".env missing (copy from .env.example)"
fi

if [[ -f "$ROOT/.env" ]]; then
  if secrets_are_placeholders; then
    bad_docker "JWT_SECRET_KEY / CUSTOM_LLM_INTERNAL_API_KEY still placeholders"
    bad_native "JWT_SECRET_KEY / CUSTOM_LLM_INTERNAL_API_KEY still placeholders"
  else
    ok "Required secrets set (not change-me* placeholders)"
  fi
fi

api_p="$(default_api_port)"
web_p="$(default_web_port)"
pg_p="$(default_postgres_host_port)"
redis_p="$(default_redis_host_port)"
metro_p="$(default_metro_port)"
chroma_p="$(default_chroma_port)"

echo ""
echo "Ports:"
for pair in "API:${api_p}" "DockerWeb:${web_p}" "ExpoWeb:${metro_p}" "Postgres:${pg_p}" "Redis:${redis_p}" "Chroma:${chroma_p}"; do
  name="${pair%%:*}"
  port="${pair##*:}"
  if msg="$(check_port_status "$port" "$name :$port")"; then
    ok "$msg"
  else
    note "$msg"
  fi
done

# ---------- Docker mode (optional / maintainer) ----------
echo ""
echo "=== Docker mode (optional) ==="
if command -v docker >/dev/null 2>&1; then
  ok "Docker CLI ($(docker --version 2>/dev/null | head -1))"
else
  if [[ "$MODE" == "native" ]]; then
    note "Docker CLI not found (OK — native deploy does not need Docker)"
  else
    bad_docker "Docker CLI not found"
  fi
fi

if command -v docker >/dev/null 2>&1 && docker_daemon_running; then
  ok "Docker daemon running"
else
  if [[ "$MODE" == "native" ]]; then
    note "Docker daemon not running (OK — native deploy does not need Docker)"
  else
    bad_docker "Docker daemon not running"
  fi
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker Compose ($(docker compose version --short 2>/dev/null || echo plugin))"
elif command -v docker-compose >/dev/null 2>&1; then
  ok "docker-compose ($(docker-compose version --short 2>/dev/null || echo found))"
else
  if [[ "$MODE" == "native" ]]; then
    note "Docker Compose not available (OK — native deploy does not need it)"
  else
    bad_docker "Docker Compose not available"
  fi
fi

if native_pids_alive; then
  note "Native PIDs alive — stop with npm run stop before Docker start"
elif port_in_use "$api_p"; then
  note "API :${api_p} in use — Docker start will refuse until free"
else
  ok "API :${api_p} free for Docker bind"
fi

# ---------- Native mode ----------
echo ""
echo "=== Native mode ==="
if command -v yarn >/dev/null 2>&1; then
  ok "yarn ($(yarn --version 2>/dev/null))"
else
  bad_native "yarn not found"
fi

if [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
  ok "backend/.venv present"
else
  note "backend/.venv missing (native-start will run setup.sh)"
fi

parse_database_url_host_port
if tcp_reachable "${PG_CHECK_HOST:-localhost}" "${PG_CHECK_PORT:-$pg_p}"; then
  ok "Postgres reachable at ${PG_CHECK_HOST}:${PG_CHECK_PORT}"
elif [[ "$SKIP_RUNTIME" -eq 1 ]]; then
  note "Postgres not reachable at ${PG_CHECK_HOST:-localhost}:${PG_CHECK_PORT:-$pg_p} (skipped for CI smoke)"
else
  bad_native "Postgres not reachable at ${PG_CHECK_HOST:-localhost}:${PG_CHECK_PORT:-$pg_p}"
fi

rh="${REDIS_HOST:-localhost}"
rp="${REDIS_PORT:-$redis_p}"
if tcp_reachable "$rh" "$rp"; then
  ok "Redis reachable at ${rh}:${rp}"
elif [[ "$SKIP_RUNTIME" -eq 1 ]]; then
  note "Redis not reachable at ${rh}:${rp} (skipped for CI smoke)"
else
  bad_native "Redis not reachable at ${rh}:${rp}"
fi

ch="${CHROMA_HOST:-127.0.0.1}"
if chroma_heartbeat "$ch" "$chroma_p"; then
  ok "Chroma heartbeat OK at ${ch}:${chroma_p}"
elif port_in_use "$chroma_p"; then
  note "Chroma port :${chroma_p} in use but heartbeat failed"
else
  note "Chroma not running (native-start can launch chroma on :${chroma_p})"
fi

if port_in_use "$api_p"; then
  note "API :${api_p} in use — native-start will refuse until free"
else
  ok "API :${api_p} free for native bind"
fi

# ---------- Summary ----------
echo ""
if [[ "$MODE" == "native" ]]; then
  if [[ "$DOCKER_FAIL" -eq 0 ]]; then
    note "Docker mode: optional (not required for native deploy)"
  else
    note "Docker mode: not ready (ignored — native deploy)"
  fi
else
  if [[ "$DOCKER_FAIL" -eq 0 ]]; then
    ok "Docker mode: ready"
  else
    printf '✗ Docker mode: not ready\n'
  fi
fi
if [[ "$NATIVE_FAIL" -eq 0 ]]; then
  ok "Native mode: ready"
else
  printf '✗ Native mode: not ready\n'
fi

echo ""
case "$MODE" in
  native)
    if [[ "$NATIVE_FAIL" -ne 0 ]]; then
      log_err "Doctor: native mode prerequisites failed (RAGSUITE_MODE=native)."
      exit 1
    fi
    log_info "Native mode prerequisites look OK."
    ;;
  *)
    if [[ "$DOCKER_FAIL" -ne 0 ]]; then
      log_err "Doctor: Docker mode prerequisites failed (RAGSUITE_MODE=${MODE})."
      exit 1
    fi
    log_info "Docker mode prerequisites look OK."
    ;;
esac
exit 0
