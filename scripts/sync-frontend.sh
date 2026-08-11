#!/usr/bin/env bash
# Fast path: rebuild Expo web on the host and copy into the running frontend container.
# Avoids a full Docker image rebuild (yarn + expo export inside Docker ~5+ minutes).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

if [[ ! -d node_modules ]]; then
  echo "==> Installing frontend deps (one-time)…"
  yarn install --frozen-lockfile
fi

echo "==> Exporting Expo web → frontend/dist (API http://localhost:9090)…"
printf '{\n  "API_URL": "http://localhost:9090",\n  "IS_DEBUG": false\n}\n' > env.json
npx expo export --platform web --output-dir dist

echo "==> Syncing dist into running frontend container…"
cd "$ROOT"
docker compose cp frontend/dist/. frontend:/usr/share/nginx/html/

echo "==> Done. Hard-refresh http://localhost:9191"
