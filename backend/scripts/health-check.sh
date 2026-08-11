#!/usr/bin/env bash
# Wait for API readiness after deploy restart.

set -euo pipefail

HEALTH_URL="${RAGSUITE_HEALTH_URL:-http://localhost:9090/api/v1/health/ready}"
RETRIES="${RAGSUITE_HEALTH_RETRIES:-5}"
DELAY="${RAGSUITE_HEALTH_RETRY_DELAY:-3}"

if ! curl --fail --silent --retry "$RETRIES" --retry-delay "$DELAY" "$HEALTH_URL"; then
  echo "DEPLOY FAILED: API not healthy at $HEALTH_URL" >&2
  sudo supervisorctl status 2>/dev/null || true
  exit 1
fi

echo "==> health OK: $HEALTH_URL"
