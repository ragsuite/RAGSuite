#!/usr/bin/env bash
# Start full RAGSuite stack (Docker API/web/data) + Expo Metro for web/Android/iOS.
# Also prepares the native iOS project (CocoaPods) so pressing `i` can build.
# API is always http://localhost:9090 — never open document /api paths against Metro/nginx.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Prefer full Xcode for any native iOS tooling spawned by Expo.
if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
fi

echo "==> Starting Docker stack (API :9090, web :9191, Postgres, Redis, Chroma)…"
bash "$ROOT/scripts/docker-start.sh" --detach

cd "$ROOT/frontend"

if [[ ! -d node_modules ]]; then
  echo "==> yarn install (first time)…"
  yarn install
fi

yarn env:local

# Generate / refresh iOS Pods before Metro (Pods are not committed).
# Soft-fail: Android / Metro web still work without full Xcode.
if ! bash "$ROOT/scripts/ensure-ios-pods.sh"; then
  echo "WARN: iOS CocoaPods setup failed — continuing with Metro (Android / web only)."
  echo "      Install Xcode to enable iOS simulator builds."
fi

# Expo Metro on :9191 (same host port as Docker nginx web — do not run both UIs together).
export EXPO_DEV_SERVER_PORT="${EXPO_DEV_SERVER_PORT:-9191}"
export RCT_METRO_PORT="${RCT_METRO_PORT:-9191}"

echo ""
echo "Stack ready:"
echo "  API          http://localhost:9090"
echo "  Web (Docker) http://localhost:9191"
echo "  Expo Metro   http://localhost:${EXPO_DEV_SERVER_PORT}"
echo ""
echo "  Press a = Android   i = iOS simulator   w = Metro web"
echo "  First iOS launch builds the native app (uses ios/Pods)."
echo ""
echo "==> Starting Expo…"
exec yarn start -- --port "${EXPO_DEV_SERVER_PORT}"
