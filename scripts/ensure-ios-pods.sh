#!/usr/bin/env bash
# Ensure frontend/ios exists and CocoaPods are installed (required before Expo iOS).
set -euo pipefail

FRONTEND_ROOT="$(cd "$(dirname "$0")/../frontend" && pwd)"
cd "$FRONTEND_ROOT"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "==> Skipping iOS pods (not macOS)."
  exit 0
fi

# Prefer full Xcode over Command Line Tools (required for pod install / simulators).
if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
fi

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "ERROR: Xcode is required for iOS builds."
  echo "Install Xcode from the App Store, then run:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo "  sudo xcodebuild -license accept"
  exit 1
fi

ensure_pod_cli() {
  if command -v pod >/dev/null 2>&1; then
    return 0
  fi
  if [[ -x /opt/homebrew/bin/pod ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
    return 0
  fi
  if [[ -x /usr/local/bin/pod ]]; then
    export PATH="/usr/local/bin:$PATH"
    return 0
  fi

  echo "==> CocoaPods not found — installing via Homebrew…"
  if ! command -v brew >/dev/null 2>&1; then
    echo "ERROR: Homebrew is required to install CocoaPods (brew install cocoapods)."
    exit 1
  fi
  brew install cocoapods
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
  command -v pod >/dev/null 2>&1 || {
    echo "ERROR: pod still not on PATH after brew install cocoapods."
    exit 1
  }
}

ensure_pod_cli

if [[ ! -f ios/Podfile ]]; then
  echo "==> Generating native ios/ project (expo prebuild)…"
  yarn env:local
  npx expo prebuild --platform ios --no-install
fi

if [[ ! -f ios/Podfile ]]; then
  echo "ERROR: ios/Podfile missing after prebuild."
  exit 1
fi

# Pods are gitignored; (re)install whenever missing or lockfile is newer.
NEED_PODS=0
if [[ ! -d ios/Pods ]] || [[ ! -f ios/Pods/Manifest.lock ]]; then
  NEED_PODS=1
elif [[ ios/Podfile.lock -nt ios/Pods/Manifest.lock ]]; then
  NEED_PODS=1
fi

if [[ "$NEED_PODS" -eq 1 ]]; then
  echo "==> Installing iOS CocoaPods (this can take several minutes)…"
  cd ios
  # Expo/RN node resolution must work from ios/
  export LANG="${LANG:-en_US.UTF-8}"
  export LC_ALL="${LC_ALL:-en_US.UTF-8}"
  pod install --repo-update
  cd "$FRONTEND_ROOT"
  echo "==> iOS Pods ready."
else
  echo "==> iOS Pods already installed."
fi

# Soft tip: keep system xcode-select on Xcode when possible (non-fatal).
ACTIVE="$(xcode-select -p 2>/dev/null || true)"
if [[ "$ACTIVE" == "/Library/Developer/CommandLineTools" ]]; then
  echo ""
  echo "NOTE: xcode-select currently points at Command Line Tools."
  echo "For simulator builds, run once:"
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
  echo ""
fi
