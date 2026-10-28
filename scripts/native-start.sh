#!/usr/bin/env bash
# Native (host) mode: API :9090 + Expo web :9191 against compose Postgres + Redis + ES + MinIO.
# Exit codes: 0 success, 1 prerequisite/port fail, 2 env invalid, 3 start fail, 4 health timeout
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
PID_DIR="$(native_pid_dir)"
LOG_DIR="$PID_DIR"

# --- Env ---
if ! ensure_dotenv_from_example; then
  exit 2
fi
# Prefer root .env; also load backend/.env if present (symlink or host copy)
load_env_if_present "$ROOT/.env"
if [[ -f "$BACKEND/.env" ]]; then
  load_env_if_present "$BACKEND/.env"
fi

# Phase 6: auto-attach sibling RAGSUITE_EE (or RAGSUITE_EE_ROOT override)
ragsuite_resolve_ee_root

if secrets_are_placeholders; then
  log_err "JWT_SECRET_KEY and CUSTOM_LLM_INTERNAL_API_KEY must be non-placeholder values in .env"
  exit 2
fi

# Native defaults (export only if unset — do not rewrite .env)
export DATABASE_URL="${DATABASE_URL:-postgresql://ragsuite:ragsuite@localhost:5436/ragsuite_v3}"
export REDIS_HOST="${REDIS_HOST:-localhost}"
export REDIS_PORT="${REDIS_PORT:-6382}"
export ELASTICSEARCH_URL="${ELASTICSEARCH_URL:-http://localhost:9210}"
export ELASTICSEARCH_USER="${ELASTICSEARCH_USER:-elastic}"
if ! require_data_store_secrets; then
  exit 2
fi
export MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9010}"
export MINIO_BUCKET="${MINIO_BUCKET:-ragsuite}"
export MINIO_SECURE="${MINIO_SECURE:-false}"
export WORKER_ROLES="${WORKER_ROLES:-all}"
export PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-http://localhost:9090/api/v1}"
export FRONTEND_BASE_URL="${FRONTEND_BASE_URL:-http://localhost:9191}"
# Native Expo always serves on :9191 — keep OAuth/SSO redirects aligned even if .env still says :9091.
if [[ "$FRONTEND_BASE_URL" == *":9091"* ]]; then
  export FRONTEND_BASE_URL="http://localhost:9191"
fi
export WEB_CONCURRENCY="${WEB_CONCURRENCY:-1}"
export RUN_INLINE_WORKER="${RUN_INLINE_WORKER:-false}"
export API_PORT="${API_PORT:-9090}"
export EXPO_DEV_SERVER_PORT="${EXPO_DEV_SERVER_PORT:-9191}"
export RCT_METRO_PORT="${RCT_METRO_PORT:-$EXPO_DEV_SERVER_PORT}"
# Local native: enable FastAPI /docs (same as compose DEBUG=True). Set DEBUG=false to hide.
# DEBUG alone never loads Enterprise modules — EE requires a valid offline.key.
export DEBUG="${DEBUG:-true}"

# Ensure CORS allows Expo web (and keep Docker UI origin if already listed)
_cors="${CORS_ORIGINS:-}"
if [[ -z "$_cors" || "$_cors" == "*" ]]; then
  export CORS_ORIGINS="http://localhost:9191,http://127.0.0.1:9191,http://localhost:9091,http://127.0.0.1:9091"
elif [[ "$_cors" != *":9191"* ]]; then
  export CORS_ORIGINS="${_cors},http://localhost:9191,http://127.0.0.1:9191"
fi

# Symlink backend/.env → root .env when missing (settings load backend/.env)
if [[ ! -e "$BACKEND/.env" && -f "$ROOT/.env" ]]; then
  ln -sf ../.env "$BACKEND/.env" || true
fi

# --- Prerequisites ---
if ! require_cmd node; then exit 1; fi
if ! require_cmd yarn; then exit 1; fi
if ! require_cmd python3; then exit 1; fi
if ! require_cmd curl; then exit 1; fi

node_ver="$(node -v 2>/dev/null | sed 's/^v//')"
node_major="${node_ver%%.*}"
if [[ "${node_major:-0}" -lt 18 ]]; then
  log_err "Node.js >=18 required (found v${node_ver})"
  exit 1
fi

# Port conflicts (API + Expo only — Postgres/Redis must be listening, not free)
if ! assert_port_free "$API_PORT" "API"; then
  exit 1
fi
if ! assert_port_free "$EXPO_DEV_SERVER_PORT" "Expo web / Metro"; then
  exit 1
fi

# Postgres + Redis (auto-start data-only compose if missing — keeps volumes)
parse_database_url_host_port
if ! tcp_reachable "$PG_CHECK_HOST" "$PG_CHECK_PORT" || ! tcp_reachable "${REDIS_HOST}" "${REDIS_PORT}" \
  || ! tcp_reachable "${ELASTICSEARCH_HOST:-localhost}" "${ELASTICSEARCH_HOST_PORT:-9210}" \
  || ! tcp_reachable "${MINIO_HOST:-localhost}" "${MINIO_API_HOST_PORT:-9010}"; then
  if ! ensure_native_data_services; then
    log_err "Data services not reachable (Postgres ${PG_CHECK_HOST}:${PG_CHECK_PORT}, Redis ${REDIS_HOST}:${REDIS_PORT}, ES :9210, MinIO :9010)."
    log_err "Start them (brew), or ensure Docker can run: docker compose up -d postgres redis elasticsearch minio"
    log_err "Example: DATABASE_URL=postgresql://ragsuite:ragsuite@localhost:5436/ragsuite_v3"
    exit 1
  fi
fi
log_info "Postgres reachable at ${PG_CHECK_HOST}:${PG_CHECK_PORT}"
log_info "Redis reachable at ${REDIS_HOST}:${REDIS_PORT}"
log_info "Elasticsearch reachable at ${ELASTICSEARCH_URL}"
log_info "MinIO reachable at ${MINIO_ENDPOINT}"

# --- Backend venv ---
VENV="$BACKEND/.venv"
if [[ ! -x "$VENV/bin/python" ]]; then
  log_info "Creating backend venv via scripts/setup.sh…"
  if [[ -x "$BACKEND/scripts/setup.sh" ]]; then
    bash "$BACKEND/scripts/setup.sh" || {
      log_err "backend/scripts/setup.sh failed — create venv manually: cd backend && python3 -m venv .venv && pip install -r requirements.txt"
      exit 1
    }
  else
    log_err "Missing backend/.venv and backend/scripts/setup.sh"
    exit 1
  fi
fi
if [[ ! -x "$VENV/bin/uvicorn" ]]; then
  log_err "backend/.venv incomplete (no uvicorn). Run: cd backend && bash scripts/setup.sh"
  exit 1
fi

mkdir -p "$BACKEND/data/staging" 2>/dev/null || true
export DOCUMENT_STAGING_DIR="${DOCUMENT_STAGING_DIR:-data/staging}"

# Free API/web ports held by Docker app containers; stop any pre-pgvector Chroma sidecar.
stop_leftover_compose_app_containers
stop_pid_file chroma

# --- Migrations (all heads; the repo has multiple Alembic branch tips) ---
log_info "Running DB migrations…"
(
  cd "$BACKEND"
  set +e
  mig_out="$("$VENV/bin/alembic" upgrade heads 2>&1)"
  mig_rc=$?
  set -e
  if [[ "$mig_rc" -ne 0 ]]; then
    echo "$mig_out"
    # Stamp only when objects already exist. Never stamp on UndefinedTable —
    # that marks heads without applying later column adds (local 500s).
    if echo "$mig_out" | grep -qE "DuplicateTable|DuplicateColumn|already exists"; then
      log_warn "Schema/history mismatch — stamping alembic heads…"
      "$VENV/bin/alembic" stamp heads
      "$VENV/bin/alembic" upgrade heads
    else
      log_err "Migration failed."
      exit 3
    fi
  fi
  # Idempotent column + vector-schema guard (same step as the Docker entrypoint).
  "$VENV/bin/python" -m app.schema_safety_net || log_warn "Schema safety net reported errors (see above)."
  # Guard: stamp-head can leave alembic at head while columns are still missing.
  if command -v psql >/dev/null 2>&1 && [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
      "ALTER TABLE search_settings ADD COLUMN IF NOT EXISTS search_recent_search_limit INTEGER DEFAULT 5;" \
      >/dev/null
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
      "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS show_system_footer BOOLEAN NOT NULL DEFAULT true;" \
      >/dev/null
  fi
) || exit 3

# --- One-shot: Chroma→pgvector (legacy) + pgvector→ES + blobs→MinIO (no-op afterwards) ---
log_info "Checking search/blob stack (Elasticsearch + MinIO)…"
if ! (cd "$BACKEND" && "$VENV/bin/python" -m app.services.stack_migrate --auto); then
  log_err "Stack migrate failed — API not started. Existing Postgres/ES/MinIO data is untouched; fix the error above and rerun."
  exit 3
fi

# --- Worker ---
log_info "Starting background worker…"
(
  cd "$BACKEND"
  # shellcheck disable=SC1091
  set -a
  # Ensure settings see root env (already exported)
  set +a
  nohup "$VENV/bin/python" -m app.worker >"$LOG_DIR/worker.log" 2>&1 &
  echo $! >"$PID_DIR/worker.pid"
)
sleep 1

# --- API ---
log_info "Starting API on :${API_PORT} (DEBUG=${DEBUG})…"
(
  cd "$BACKEND"
  if [[ "$(uname -s)" = "Darwin" ]]; then
    export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  fi
  nohup "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port "$API_PORT" \
    >"$LOG_DIR/api.log" 2>&1 &
  echo $! >"$PID_DIR/api.pid"
)

if ! wait_for_api_health 45; then
  log_err "API failed to become healthy — see $LOG_DIR/api.log"
  exit 4
fi

# --- Frontend (Expo web) ---
log_info "Starting Expo web on :${EXPO_DEV_SERVER_PORT}…"
log_info "First Metro/web bundle can take 1–3 minutes — keep waiting after the port is open."
cd "$FRONTEND"
if [[ ! -d node_modules ]]; then
  log_info "yarn install (first time)…"
  yarn install
fi
yarn env:local
nohup yarn web >"$LOG_DIR/frontend.log" 2>&1 &
echo $! >"$PID_DIR/frontend.pid"

# Wait for Metro listen, then give the first web bundle time to finish.
metro_ok=0
for _ in $(seq 1 60); do
  if port_in_use "$EXPO_DEV_SERVER_PORT"; then
    metro_ok=1
    break
  fi
  sleep 1
done
if [[ "$metro_ok" -ne 1 ]]; then
  log_warn "Expo web not listening yet on :${EXPO_DEV_SERVER_PORT} — check $LOG_DIR/frontend.log"
else
  log_info "Expo web listening on :${EXPO_DEV_SERVER_PORT}"
  # Optional: wait until the page responds (first compile). Non-fatal if slow.
  page_ok=0
  for _ in $(seq 1 90); do
    if curl -sf "http://127.0.0.1:${EXPO_DEV_SERVER_PORT}" >/dev/null 2>&1 \
      || curl -sf "http://localhost:${EXPO_DEV_SERVER_PORT}" >/dev/null 2>&1; then
      page_ok=1
      break
    fi
    sleep 2
  done
  if [[ "$page_ok" -eq 1 ]]; then
    log_info "Expo web is serving pages."
  else
    log_warn "Expo is up but first page compile is still running — open http://localhost:${EXPO_DEV_SERVER_PORT} and wait for Metro to finish (see $LOG_DIR/frontend.log)."
  fi
fi

echo ""
echo "mode=native"
echo "Stack URLs:"
echo "  API           http://localhost:${API_PORT}"
echo "  API docs      http://localhost:${API_PORT}/docs"
echo "  Expo web      http://localhost:${EXPO_DEV_SERVER_PORT}"
echo "  (same ports as Docker mode: API :9090 · Web :9191)"
echo "  Postgres      ${PG_CHECK_HOST}:${PG_CHECK_PORT}  (metadata + jobs)"
echo "  Redis         ${REDIS_HOST}:${REDIS_PORT}"
echo "  Elasticsearch ${ELASTICSEARCH_URL}"
echo "  MinIO         ${MINIO_ENDPOINT}"
if [[ -n "${RAGSUITE_EE_ROOT:-}" ]]; then
  echo "  EE            ${RAGSUITE_EE_ROOT}"
else
  echo "  EE            (not attached — CE-only)"
fi
echo "  PIDs          ${PID_DIR}/*.pid"
echo "  Logs          ${LOG_DIR}/*.log"
echo ""
log_info "Native stack is up."
log_info "If the browser still shows a blank Metro screen, wait for the first bundle (often 1–3 min)."
log_info "Stop with:  ragsuite stop"
log_info "  (or from install dir: npm run stop)"
exit 0
