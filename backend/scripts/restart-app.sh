#!/usr/bin/env bash
# Restart RAGSuite supervisor programs after a deploy.
# Order: Chroma → worker → API (API last so health checks hit new code).
#
# Usage (on production server):
#   bash scripts/restart-app.sh
#
# Optional: RAGSUITE_RESTART_PROGRAMS="ragsuite-worker ragsuite-backend"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DEFAULT_PROGRAMS="ragsuite-chromadb ragsuite-worker ragsuite-backend"
PROGRAMS="${RAGSUITE_RESTART_PROGRAMS:-$DEFAULT_PROGRAMS}"
REQUIRED_RUNNING="${RAGSUITE_REQUIRED_RUNNING:-ragsuite-worker ragsuite-backend}"
WAIT_SEC="${RAGSUITE_RESTART_WAIT_SEC:-8}"

restart_if_present() {
  local prog="$1"
  if sudo supervisorctl status "$prog" >/dev/null 2>&1; then
    echo "==> supervisorctl restart $prog"
    sudo supervisorctl restart "$prog"
  else
    echo "==> skip $prog (not configured in supervisor)"
  fi
}

for prog in $PROGRAMS; do
  restart_if_present "$prog"
done

echo "==> waiting ${WAIT_SEC}s for processes to start..."
sleep "$WAIT_SEC"

for prog in $REQUIRED_RUNNING; do
  if sudo supervisorctl status "$prog" >/dev/null 2>&1; then
    if ! sudo supervisorctl status "$prog" | grep -q RUNNING; then
      echo "ERROR: $prog is not RUNNING after restart"
      sudo supervisorctl status || true
      exit 1
    fi
    echo "==> $prog is RUNNING"
  fi
done

echo "==> restart complete"
