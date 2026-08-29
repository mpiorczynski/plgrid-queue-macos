#!/usr/bin/env bash
#
# build-app.sh — assemble a runnable macOS .app bundle from the SwiftPM build.
#
# Since the app is a pure menu-bar accessory (LSUIElement), a proper .app
# bundle is required for the SwiftUI `Settings` (Preferences) scene and for
# launch-at-login registration to behave correctly. This script builds the
# executable with SwiftPM, then copies it into a minimal bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

APP_NAME="PLGridQueue"
APP_DIR="$ROOT/build/$APP_NAME.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

CONFIGURATION="${CONFIGURATION:-release}"

echo "==> Building SwiftPM product ($CONFIGURATION)"
swift build -c "$CONFIGURATION" --product "$APP_NAME"

BIN="$(swift build -c "$CONFIGURATION" --show-bin-path)/$APP_NAME"

echo "==> Assembling $APP_DIR"
rm -rf "$APP_DIR"
mkdir -p "$MACOS" "$RESOURCES"
cp "$BIN" "$MACOS/$APP_NAME"
cp "$ROOT/Resources/Info.plist" "$CONTENTS/Info.plist"

echo "==> Signing (ad-hoc)"
codesign --force --deep --sign - "$APP_DIR" >/dev/null 2>&1 || true

echo "==> Done: $APP_DIR"
echo "Run with: open $APP_DIR"
