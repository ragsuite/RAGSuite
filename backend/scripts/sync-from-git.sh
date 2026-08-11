#!/usr/bin/env bash
# Sync production checkout to the commit being built/deployed.
#
# - Push to `server`: resets to origin/server
# - Merge request: checks out CI_COMMIT_SHA (fetched from GitLab)
#
# In CI, CI_JOB_TOKEN is used when set. Manual runs use existing git credentials.

set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/home/web/ragsuite_backend}"
BRANCH="${RAGSUITE_DEPLOY_BRANCH:-server}"

cd "$PROD_ROOT"
test -d .git || { echo "ERROR: $PROD_ROOT is not a git repo"; exit 1; }

ORIGIN_URL="$(git remote get-url origin)"
restore_origin() {
  git remote set-url origin "$ORIGIN_URL"
}
trap restore_origin EXIT

if [ -n "${CI_JOB_TOKEN:-}" ] && [ -n "${CI_SERVER_HOST:-}" ] && [ -n "${CI_PROJECT_PATH:-}" ]; then
  git remote set-url origin "https://gitlab-ci-token:${CI_JOB_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
fi

if [ "${CI_PIPELINE_SOURCE:-}" = "merge_request_event" ] && [ -n "${CI_COMMIT_SHA:-}" ]; then
  echo "==> git fetch MR commit $CI_COMMIT_SHA"
  git fetch origin "$CI_COMMIT_SHA"
  git checkout -f "$CI_COMMIT_SHA"
else
  echo "==> git fetch origin $BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

echo "==> synced to $(git rev-parse --short HEAD)"
