#!/bin/bash
# One-command dev startup.
# Local mode (backend package only): Redis :6382 → Chroma :8004 → worker → API :8000
# Prefer full stack from repo root: cd .. && npm start  (API :9090, web :9191)
# Usage: ./start.sh
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_ROOT"

if [ "$(uname -s)" = "Darwin" ]; then
  export OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES
  export WEB_CONCURRENCY="${WEB_CONCURRENCY:-1}"
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export RUN_INLINE_WORKER=false

API_PORT="${API_PORT:-8000}"
CHROMA_PORT="${CHROMA_PORT:-8004}"
CHROMA_HOST="${CHROMA_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6382}"
REDIS_HOST="${REDIS_HOST:-localhost}"
export CHROMA_MODE="${CHROMA_MODE:-http}"
export REDIS_PORT REDIS_HOST

host_port_open() {
  local host="$1"
  local port="$2"
  .venv/bin/python - "$host" "$port" <<'PY'
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
}

# Free a local TCP port (lsof/fuser often missing in Coder containers).
kill_port() {
  local port="$1"
  local attempt pid pids
  for attempt in 1 2 3; do
    pids=""
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -ti :"$port" 2>/dev/null || true)
    elif command -v fuser >/dev/null 2>&1; then
      pids=$(fuser -n tcp "$port" 2>/dev/null || true)
    else
      pids=$(ss -tlnp 2>/dev/null | awk -v port=":${port}" '
        index($0, port) {
          rest = $0
          while (match(rest, /pid=[0-9]+/)) {
            print substr(rest, RSTART + 4, RLENGTH - 4)
            rest = substr(rest, RSTART + RLENGTH)
          }
        }
      ' | sort -u)
    fi
    if [ -z "$pids" ]; then
      return 0
    fi
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 1
  done
}

# Background worker has no listen port — must be stopped by name on restart.
kill_stale_workers() {
  local pid
  for pid in $(pgrep -f "${REPO_ROOT}/.venv/bin/python -m app\.worker" 2>/dev/null || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
}

detect_coder_workspace() {
  host_port_open db 5432 && host_port_open chromadb "$CHROMA_PORT"
}

wait_for_chroma() {
  local host="$1"
  local port="$2"
  local label="$3"
  for _ in $(seq 1 15); do
    if curl -sf -m 1 "http://${host}:${port}/api/v2/heartbeat" >/dev/null 2>&1; then
      echo "  ${label} ready at ${host}:${port}."
      return 0
    fi
    sleep 1
  done
  echo "  ERROR: ${label} not reachable at ${host}:${port}."
  return 1
}

# Local dev: start Homebrew PostgreSQL when DATABASE_URL points at localhost and nothing listens.
ensure_local_postgres() {
  local db_url="${DATABASE_URL:-}"
  local host port lock_pid data_dir brew_prefix log_file

  if [ -z "$db_url" ]; then
    return 0
  fi
  if ! echo "$db_url" | grep -qE '@(localhost|127\.0\.0\.1)(:|/)'; then
    return 0
  fi

  host=$(echo "$db_url" | sed -nE 's#.*@(localhost|127\.0\.0\.1)(:([0-9]+))?/.*#\1#p')
  port=$(echo "$db_url" | sed -nE 's#.*@(localhost|127\.0\.0\.1):([0-9]+)/.*#\2#p')
  host="${host:-localhost}"
  port="${port:-5432}"

  if host_port_open "$host" "$port"; then
    echo "Postgres ready on ${host}:${port}."
    return 0
  fi

  echo "Postgres (${host}:${port}) not running — attempting local start..."

  for data_dir in \
    /opt/homebrew/var/postgresql@18 \
    /opt/homebrew/var/postgresql@15 \
    /usr/local/var/postgresql@18 \
    /usr/local/var/postgresql@15; do
    if [ -f "${data_dir}/postmaster.pid" ]; then
      lock_pid=$(head -1 "${data_dir}/postmaster.pid" 2>/dev/null || true)
      if [ -n "$lock_pid" ] && ! ps -p "$lock_pid" -o comm= 2>/dev/null | grep -qi postgres; then
        echo "  Removing stale postmaster.pid in ${data_dir}..."
        rm -f "${data_dir}/postmaster.pid"
      fi
    fi
  done

  for brew_prefix in \
    /opt/homebrew/opt/postgresql@18 \
    /opt/homebrew/opt/postgresql@15 \
    /usr/local/opt/postgresql@18 \
    /usr/local/opt/postgresql@15; do
    data_dir="$(dirname "$(dirname "$brew_prefix")")/var/$(basename "$brew_prefix")"
    if [ ! -d "$data_dir" ]; then
      continue
    fi
    if [ ! -x "${brew_prefix}/bin/pg_ctl" ]; then
      continue
    fi
    log_file="$(dirname "$data_dir")/log/$(basename "$brew_prefix").log"
    mkdir -p "$(dirname "$log_file")"
    if "${brew_prefix}/bin/pg_ctl" -D "$data_dir" -l "$log_file" start >/dev/null 2>&1; then
      echo "  Started ${brew_prefix} via pg_ctl."
      break
    fi
  done

  for _ in $(seq 1 15); do
    if host_port_open "$host" "$port"; then
      echo "  Postgres ready on ${host}:${port}."
      return 0
    fi
    sleep 1
  done

  echo "  ERROR: Postgres not reachable at ${host}:${port}."
  echo "  Start it manually (e.g. pg_ctl -D /opt/homebrew/var/postgresql@18 start) or fix DATABASE_URL."
  exit 1
}

run_migrations() {
  echo "DB migrations..."
  set +e
  local migration_output
  migration_output=$(.venv/bin/alembic upgrade head 2>&1)
  local migration_exit=$?
  set -e

  if [ $migration_exit -ne 0 ]; then
    echo "$migration_output"
    if echo "$migration_output" | grep -qE "DuplicateTable|already exists|UndefinedTable"; then
      echo "  Detected schema/history mismatch. Stamping alembic state to head..."
      .venv/bin/alembic stamp head
      .venv/bin/alembic upgrade head
    else
      echo "  Migration failed for an unexpected reason."
      exit $migration_exit
    fi
  fi
}

if [ ! -x .venv/bin/python ]; then
  echo "Missing .venv — run: python3 -m venv .venv && pip install -r requirements.txt"
  exit 1
fi

if detect_coder_workspace; then
  CODER_MODE=true
  echo "Coder workspace detected — using db/chromadb sidecars."
  export CHROMA_HOST="${CHROMA_HOST:-chromadb}"
  STOP_PORTS=("$API_PORT")
else
  echo "Local dev mode — dedicated Redis :${REDIS_PORT}, Chroma :${CHROMA_PORT}, API :${API_PORT}."
  export CHROMA_HOST="${CHROMA_HOST:-127.0.0.1}"
  STOP_PORTS=("$API_PORT" "$CHROMA_PORT")
fi

echo "Stopping old processes on ${STOP_PORTS[*]}..."
kill_stale_workers
for port in "${STOP_PORTS[@]}"; do
  kill_port "$port"
done
sleep 1

if [ "$CODER_MODE" = false ]; then
  ensure_local_postgres
fi

run_migrations

echo "Redis (${REDIS_HOST}:${REDIS_PORT})..."
mkdir -p "$REPO_ROOT/data/redis"
if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
  echo "  Redis ready on ${REDIS_HOST}:${REDIS_PORT}."
elif command -v redis-server >/dev/null 2>&1; then
  redis-server --port "$REDIS_PORT" --daemonize yes --dir "$REPO_ROOT/data/redis" --dbfilename dump.rdb 2>/dev/null || true
  sleep 1
  if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
    echo "  Redis started on ${REDIS_HOST}:${REDIS_PORT}."
  else
    echo "  WARNING: Redis not running on ${REDIS_HOST}:${REDIS_PORT} — app will use in-memory fallbacks."
  fi
else
  echo "  WARNING: redis-server not installed — app will use in-memory fallbacks."
fi

echo "Ollama..."
if curl -sf -m 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "  Ollama ready on http://localhost:11434."
elif command -v ollama >/dev/null 2>&1; then
  nohup ollama serve > /home/web/.ollama-serve.log 2>&1 &
  sleep 2
  if curl -sf -m 1 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo "  Ollama started on http://localhost:11434."
  else
    echo "  WARNING: Ollama did not start — check /home/web/.ollama-serve.log"
  fi
else
  echo "  WARNING: Ollama not installed."
fi

CHROMA_PID=""

if [ "$CODER_MODE" = true ]; then
  echo "Postgres sidecar (db:5432)..."
  if ! host_port_open db 5432; then
    echo "  ERROR: Postgres sidecar db:5432 is not reachable."
    exit 1
  fi
  echo "  Postgres sidecar reachable."

  echo "Chroma sidecar (${CHROMA_HOST}:${CHROMA_PORT})..."
  wait_for_chroma "$CHROMA_HOST" "$CHROMA_PORT" "Chroma sidecar"
else
  echo "Chroma (${CHROMA_HOST}:${CHROMA_PORT})..."
  CHROMA_DATA_PATH="${CHROMA_PERSIST_PATH:-data/chroma_db}"
  if [[ "$CHROMA_DATA_PATH" != /* ]]; then
    CHROMA_DATA_PATH="$REPO_ROOT/$CHROMA_DATA_PATH"
  fi
  mkdir -p "$CHROMA_DATA_PATH"
  .venv/bin/chroma run --host "$CHROMA_HOST" --port "$CHROMA_PORT" --path "$CHROMA_DATA_PATH" &
  CHROMA_PID=$!
  wait_for_chroma "$CHROMA_HOST" "$CHROMA_PORT" "Local Chroma"
fi

echo "Background worker..."
.venv/bin/python -m app.worker &
WORKER_PID=$!
sleep 1

echo "API (${API_PORT})..."
if [ "$CODER_MODE" = true ]; then
  echo "  Backend API: http://localhost:${API_PORT}"
  echo "  Chroma:      http://${CHROMA_HOST}:${CHROMA_PORT}"
  echo "  Postgres:    db:5432 (${DATABASE_URL:-configured in .env})"
fi

if [ "$(uname -s)" = "Darwin" ]; then
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$API_PORT"
else
  .venv/bin/gunicorn app.main:app -c gunicorn.conf.py
fi

kill $WORKER_PID $CHROMA_PID 2>/dev/null || true
