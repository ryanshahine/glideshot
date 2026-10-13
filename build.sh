#!/bin/bash
# Builds Glideshot.app into ./build and signs it ad hoc.
# macOS ties the Screen Recording permission to the signature, and an ad-hoc signature changes with every
# build. To keep the permission across rebuilds, sign with your own development certificate:
#   SIGN_IDENTITY="Apple Development: you@example.com (ABCDE12345)" ./build.sh
# (`security find-identity -p codesigning -v` lists yours.) Don't share builds signed that way: the
# certificate puts your name and team ID in the app. scripts/package.sh always signs ad hoc.
set -euo pipefail
cd "$(dirname "$0")"
# Newer SwiftPM defaults to the Swift Build backend; the native one is more reliable for this package.
swift build -c release --build-system native 2>/dev/null || swift build -c release
APP=build/Glideshot.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/Glideshot "$APP/Contents/MacOS/Glideshot"
cp Resources/Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
IDENTITY=${SIGN_IDENTITY:--}
codesign --force --sign "$IDENTITY" "$APP"
echo "Built $APP (signed $([ "$IDENTITY" = - ] && echo "ad hoc" || echo "with $IDENTITY"))"
