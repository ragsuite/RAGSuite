#!/usr/bin/env bash
# Backend tests for GitLab CI (.ci-venv). Expands coverage beyond the old 6-file subset.
#
# By default this runs the full backend test suite.
# Set CI_PYTEST_SKIP_HEAVY=true to temporarily skip known heavy suites.
#
# Usage: CI_PY="$(bash scripts/ensure-ci-venv.sh)" && bash scripts/ci-pytest.sh "$CI_PY"

set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/home/web/ragsuite_backend}"
PY="${1:?Usage: ci-pytest.sh /path/to/python}"

cd "$PROD_ROOT"

export SMTP_HOST="${SMTP_HOST:-smtp.example.com}"
export SMTP_PORT="${SMTP_PORT:-587}"
export SMTP_USER="${SMTP_USER:-ci-smtp-user}"
export SMTP_PASSWORD="${SMTP_PASSWORD:-ci-smtp-password}"
export SMTP_USE_TLS="${SMTP_USE_TLS:-true}"
export EMAIL_FROM="${EMAIL_FROM:-ci@example.com}"

if [ "${CI_PYTEST_SKIP_HEAVY:-}" = "true" ]; then
  exec "$PY" -m pytest tests/ -q --tb=short \
    --ignore=tests/test_chat_sources_policy.py \
    --ignore=tests/test_tiered_retrieval.py \
    --ignore=tests/test_concurrency_limits.py \
    --ignore=tests/test_document_ingest_orchestration.py \
    --ignore=tests/test_job_queue_claim.py
fi

exec "$PY" -m pytest tests/ -q --tb=short
