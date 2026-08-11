# Shared helpers for RAGSuite root scripts.
# Sourced by other scripts — do NOT apply set -euo pipefail here.
# Callers must: set -euo pipefail; source this file.

_RAGSUITE_COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_RAGSUITE_ROOT="$(cd "$_RAGSUITE_COMMON_DIR/../.." && pwd)"

ragsuite_root() {
  printf '%s\n' "$_RAGSUITE_ROOT"
}

_use_color() {
  [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]
}

log_info() {
  if _use_color; then
    printf '\033[1;34m==>\033[0m %s\n' "$*"
  else
    printf '==> %s\n' "$*"
  fi
}

log_warn() {
  if _use_color; then
    printf '\033[1;33mWARN:\033[0m %s\n' "$*" >&2
  else
    printf 'WARN: %s\n' "$*" >&2
  fi
}

log_err() {
  if _use_color; then
    printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2
  else
    printf 'ERROR: %s\n' "$*" >&2
  fi
}

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    log_err "Required command not found: $name"
    return 1
  fi
}

# Export KEY=VALUE lines from .env without evaluating shell. Skips comments/blank.
# Supports optional surrounding single/double quotes on values.
load_env_if_present() {
  local env_file="${1:-$(ragsuite_root)/.env}"
  [[ -f "$env_file" ]] || return 0

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Trim CR and leading/trailing whitespace
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    # Trim key whitespace
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    # Strip matching quotes
    if [[ "$value" =~ ^\".*\"$ ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < "$env_file"
}

# If .env is missing, copy from .env.example and warn. Returns 0 if .env exists after.
ensure_dotenv_from_example() {
  local root
  root="$(ragsuite_root)"
  local env_file="$root/.env"
  local example="$root/.env.example"

  if [[ -f "$env_file" ]]; then
    return 0
  fi
  if [[ ! -f "$example" ]]; then
    log_err "Missing .env and .env.example — cannot bootstrap environment."
    return 1
  fi
  cp "$example" "$env_file"
  log_warn "Created .env from .env.example — edit secrets before production use."
  return 0
}

# True (exit 0) if JWT_SECRET_KEY or CUSTOM_LLM_INTERNAL_API_KEY are empty or change-me* placeholders.
secrets_are_placeholders() {
  local jwt="${JWT_SECRET_KEY:-}"
  local llm="${CUSTOM_LLM_INTERNAL_API_KEY:-}"

  if [[ -z "$jwt" || "$jwt" == change-me* ]]; then
    return 0
  fi
  if [[ -z "$llm" || "$llm" == change-me* ]]; then
    return 0
  fi
  return 1
}

# Print whether a TCP port is free or in use (messaging only; does not kill).
# Exit 0 if free, 1 if in use. Sets CHECK_PORT_IN_USE=0|1 for callers that avoid subshells.
check_port_status() {
  local port="$1"
  local label="${2:-port $port}"
  CHECK_PORT_IN_USE=0

  if command -v lsof >/dev/null 2>&1; then
    local owners
    owners="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1" (pid "$2")"}' | sort -u | tr '\n' ', ' | sed 's/, $//')"
    if [[ -n "$owners" ]]; then
      CHECK_PORT_IN_USE=1
      printf '%s: in use by %s\n' "$label" "$owners"
      return 1
    fi
  elif command -v nc >/dev/null 2>&1; then
    if nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
      CHECK_PORT_IN_USE=1
      printf '%s: in use (listener detected)\n' "$label"
      return 1
    fi
  fi

  printf '%s: available\n' "$label"
  return 0
}

# Prefer Docker Compose v2 plugin. Echoes the command prefix as two words via COMPOSE_BIN array.
# Usage: compose_cmd && "${COMPOSE_BIN[@]}" up ...
compose_cmd() {
  COMPOSE_BIN=()
  if ! command -v docker >/dev/null 2>&1; then
    log_err "Docker CLI not found. Install Docker Desktop or Docker Engine."
    return 1
  fi
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_BIN=(docker compose)
    return 0
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_BIN=(docker-compose)
    return 0
  fi
  log_err "Docker Compose not found. Install the Docker Compose plugin (docker compose)."
  return 1
}

docker_daemon_running() {
  docker info >/dev/null 2>&1
}

# Start only postgres+redis via compose when host ports are down.
# Reuses existing named volumes — never down -v. Does not start backend/frontend.
ensure_native_data_services() {
  local root pg_host pg_port rh rp attempts i
  root="$(ragsuite_root)"
  parse_database_url_host_port
  pg_host="${PG_CHECK_HOST:-localhost}"
  pg_port="${PG_CHECK_PORT:-$(default_postgres_host_port)}"
  rh="${REDIS_HOST:-localhost}"
  rp="${REDIS_PORT:-$(default_redis_host_port)}"

  if tcp_reachable "$pg_host" "$pg_port" && tcp_reachable "$rh" "$rp"; then
    return 0
  fi

  if [[ ! -f "$root/docker-compose.yml" ]]; then
    return 1
  fi
  if ! command -v docker >/dev/null 2>&1 || ! docker_daemon_running; then
    return 1
  fi
  if ! compose_cmd; then
    return 1
  fi

  log_info "Starting data services (postgres + redis) via compose — volumes kept, app containers not started…"
  (
    cd "$root"
    "${COMPOSE_BIN[@]}" up -d postgres redis
  ) || return 1

  attempts=60
  for i in $(seq 1 "$attempts"); do
    if tcp_reachable "$pg_host" "$pg_port" && tcp_reachable "$rh" "$rp"; then
      log_info "Postgres :${pg_port} and Redis :${rp} are reachable."
      return 0
    fi
    sleep 1
  done
  log_err "Timed out waiting for postgres/redis after compose up."
  return 1
}

# Stop leftover compose app containers that bind API/web ports.
# Also stop chromadb: native + Docker share backend/data/chroma_db (SQLite cannot be dual-opened).
# Leaves postgres/redis (and volumes) running for native mode.
stop_leftover_compose_app_containers() {
  local root
  root="$(ragsuite_root)"
  [[ -f "${root}/docker-compose.yml" ]] || return 0
  if ! command -v docker >/dev/null 2>&1 || ! docker_daemon_running; then
    return 0
  fi
  if ! compose_cmd; then
    return 0
  fi
  log_info "Stopping leftover Docker app containers (backend/frontend/worker/chromadb) if any — volumes + DB kept…"
  (
    cd "$root"
    "${COMPOSE_BIN[@]}" stop backend frontend worker chromadb 2>/dev/null || true
  )
  return 0
}

# Host paths shared by native Chroma sidecar and Docker chromadb bind-mount.
# Relative CHROMA_PERSIST_PATH values match native-start (resolved under backend/).
shared_chroma_host_path() {
  local root persist
  root="$(ragsuite_root)"
  if [[ -n "${CHROMA_HOST_PERSIST_PATH:-}" ]]; then
    printf '%s\n' "$CHROMA_HOST_PERSIST_PATH"
    return 0
  fi
  persist="${CHROMA_PERSIST_PATH:-data/chroma_db}"
  if [[ "$persist" = /* ]]; then
    printf '%s\n' "$persist"
  else
    # Use ${root}/… form (not $root/…) so zsh does not treat / as ${var/pattern/repl}.
    printf '%s\n' "${root}/backend/${persist}"
  fi
}

shared_staging_host_path() {
  local root
  root="$(ragsuite_root)"
  if [[ -n "${DOCUMENT_STAGING_HOST_PATH:-}" ]]; then
    printf '%s\n' "$DOCUMENT_STAGING_HOST_PATH"
    return 0
  fi
  printf '%s\n' "${root}/backend/data/staging"
}

# Copy legacy named-volume data into the shared host dir once (host empty only).
_seed_host_dir_from_volume_if_empty() {
  local dest="$1"
  local vol="$2"
  local marker="$3"
  # marker="" → treat empty directory as empty; otherwise require missing marker file.
  if [[ -n "$marker" && -e "${dest}/${marker}" ]]; then
    return 0
  fi
  if [[ -z "$marker" ]] && [[ -n "$(ls -A "$dest" 2>/dev/null || true)" ]]; then
    return 0
  fi
  if ! docker volume inspect "$vol" >/dev/null 2>&1; then
    return 0
  fi
  log_info "Seeding $(basename "$dest") from legacy Docker volume ${vol}…"
  docker run --rm \
    -v "${vol}:/from:ro" \
    -v "${dest}:/to" \
    alpine:3.20 \
    sh -c 'if [ -z "$(ls -A /from 2>/dev/null)" ]; then exit 0; fi; cp -a /from/. /to/' \
    || log_warn "Could not seed ${dest} from ${vol} (continuing with host path)."
}

# Ensure native + Docker share one Chroma/staging tree under backend/data/.
ensure_shared_vector_and_staging_dirs() {
  local root chroma_dir staging_dir project
  root="$(ragsuite_root)"
  chroma_dir="$(shared_chroma_host_path)"
  staging_dir="$(shared_staging_host_path)"
  project="${COMPOSE_PROJECT_NAME:-ragsuite-server}"

  mkdir -p "$chroma_dir" "$staging_dir"

  # Export absolute paths so compose bind-mounts never depend on relative cwd quirks.
  export CHROMA_HOST_PERSIST_PATH="$chroma_dir"
  export DOCUMENT_STAGING_HOST_PATH="$staging_dir"

  _seed_host_dir_from_volume_if_empty "$chroma_dir" "${project}_chroma_data" "chroma.sqlite3"
  _seed_host_dir_from_volume_if_empty "$staging_dir" "${project}_staging_data" ""

  if [[ -f "${chroma_dir}/chroma.sqlite3" ]]; then
    log_info "Shared Chroma path: ${chroma_dir}"
  else
    log_info "Shared Chroma path (empty, will initialize): ${chroma_dir}"
  fi
}

# Default host ports for this project (do not change without updating docs).
default_api_port() { printf '%s\n' "${API_PORT:-9090}"; }
default_web_port() { printf '%s\n' "${WEB_PORT:-9191}"; }
default_postgres_host_port() { printf '%s\n' "${POSTGRES_HOST_PORT:-5436}"; }
default_redis_host_port() { printf '%s\n' "${REDIS_HOST_PORT:-6382}"; }

wait_for_api_health() {
  local port api_base attempts i
  port="$(default_api_port)"
  api_base="http://localhost:${port}"
  attempts="${1:-60}"

  log_info "Waiting for API health on ${api_base}…"
  for i in $(seq 1 "$attempts"); do
    if curl -sf "${api_base}/api/v1/crawl/auth/public-config" >/dev/null 2>&1 \
      || curl -sf "${api_base}/health" >/dev/null 2>&1 \
      || curl -sf "${api_base}/docs" >/dev/null 2>&1; then
      log_info "API is healthy."
      return 0
    fi
    sleep 2
  done
  log_err "API health check timed out after $((attempts * 2))s (${api_base})."
  return 1
}

print_stack_urls() {
  local api web pg redis
  api="$(default_api_port)"
  web="$(default_web_port)"
  pg="$(default_postgres_host_port)"
  redis="$(default_redis_host_port)"
  echo ""
  echo "Stack URLs:"
  echo "  API      http://localhost:${api}"
  echo "  Web UI   http://localhost:${web}"
  echo "  Postgres localhost:${pg}  (db: ragsuite_v3)"
  echo "  Redis    localhost:${redis}"
  echo ""
}

default_metro_port() { printf '%s\n' "${EXPO_DEV_SERVER_PORT:-9191}"; }
default_chroma_port() { printf '%s\n' "${CHROMA_PORT:-8004}"; }

# TCP reachability (1s timeout). Exit 0 if open.
tcp_reachable() {
  local host="$1"
  local port="$2"
  if command -v nc >/dev/null 2>&1; then
    nc -z -w 1 "$host" "$port" >/dev/null 2>&1
    return $?
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$host" "$port" <<'PY'
import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
s = socket.socket()
s.settimeout(1)
try:
    s.connect((host, port))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
    return $?
  fi
  return 1
}

# True if TCP port has a listener on localhost.
port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  tcp_reachable 127.0.0.1 "$port"
}

# Fail with message if port is already bound.
assert_port_free() {
  local port="$1"
  local label="${2:-port $port}"
  if port_in_use "$port"; then
    log_err "${label} (:${port}) is already in use."
    log_err "Stop the other mode first: ragsuite stop  OR  npm run down / npm run stop"
    return 1
  fi
  return 0
}

native_pid_dir() {
  local dir
  dir="$(ragsuite_root)/.ragsuite/native"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

# True if any live native PID files exist (process still running).
native_pids_alive() {
  local dir pid_file pid
  dir="$(ragsuite_root)/.ragsuite/native"
  [[ -d "$dir" ]] || return 1
  for pid_file in "$dir"/*.pid; do
    [[ -f "$pid_file" ]] || continue
    pid="$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)"
    [[ -n "$pid" ]] || continue
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

write_pid() {
  local name="$1"
  local pid="$2"
  local dir
  dir="$(native_pid_dir)"
  printf '%s\n' "$pid" > "$dir/${name}.pid"
}

# Stop process from PID file; remove file. Idempotent. Exit 0 always.
stop_pid_file() {
  local name="$1"
  local dir pid_file pid
  dir="$(ragsuite_root)/.ragsuite/native"
  pid_file="$dir/${name}.pid"
  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi
  pid="$(tr -d '[:space:]' < "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    local i
    for i in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.3
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"
  return 0
}

chroma_heartbeat() {
  local host="${1:-${CHROMA_HOST:-127.0.0.1}}"
  local port="${2:-$(default_chroma_port)}"
  curl -sf -m 2 "http://${host}:${port}/api/v2/heartbeat" >/dev/null 2>&1
}

# Parse host/port from DATABASE_URL; sets PG_CHECK_HOST / PG_CHECK_PORT.
parse_database_url_host_port() {
  local url="${DATABASE_URL:-}"
  PG_CHECK_HOST="localhost"
  PG_CHECK_PORT="$(default_postgres_host_port)"
  [[ -n "$url" ]] || return 0
  if [[ "$url" =~ @([^/:]+)(:([0-9]+))?/ ]]; then
    PG_CHECK_HOST="${BASH_REMATCH[1]}"
    if [[ -n "${BASH_REMATCH[3]:-}" ]]; then
      PG_CHECK_PORT="${BASH_REMATCH[3]}"
    fi
  fi
}

# Refuse Docker start if native mode holds the API port or live PIDs.
assert_docker_start_allowed() {
  local api_port
  api_port="$(default_api_port)"
  if native_pids_alive; then
    log_err "Native mode appears to be running (.ragsuite/native/*.pid)."
    log_err "Stop it first: ragsuite stop"
    return 1
  fi
  if port_in_use "$api_port"; then
    log_err "API port :${api_port} is already in use — cannot start Docker mode."
    log_err "Stop the conflicting process or run: ragsuite stop / npm run down"
    return 1
  fi
  return 0
}

