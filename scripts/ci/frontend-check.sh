#!/usr/bin/env bash
# Frontend lint + unit checks for GitHub Actions and local CI.
# Uses Yarn because frontend/yarn.lock is the canonical lockfile.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND="$ROOT/frontend"

cd "$FRONTEND"

if [[ ! -f env.json ]]; then
  cp envs/local.json env.json
fi

if ! command -v yarn >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
  else
    npm install -g yarn
  fi
fi

echo "==> yarn install --frozen-lockfile"
yarn install --frozen-lockfile

echo "==> eslint"
yarn lint

echo "==> typecheck"
yarn typecheck

echo "==> jest"
yarn test --ci --passWithNoTests

echo "==> i18n key parity"
yarn check-i18n

echo "==> action icon registry"
yarn check-action-icons
