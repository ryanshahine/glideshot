#!/bin/bash
# Makes the download: dist/Glideshot.zip with the app (signed ad hoc, so no personal certificate details
# end up in it) and install notes. Attach it to a GitHub release as "Glideshot.zip"; the website's
# Download button always points at the latest release.
set -euo pipefail
cd "$(dirname "$0")/.."
./build.sh
STAGE=dist/Glideshot
rm -rf "$STAGE" dist/Glideshot.zip
mkdir -p "$STAGE"
ditto build/Glideshot.app "$STAGE/Glideshot.app"
codesign --force --sign - "$STAGE/Glideshot.app"
codesign --verify --strict "$STAGE/Glideshot.app"
cp "scripts/READ ME.txt" "$STAGE/READ ME.txt"
# ditto (not zip) keeps the bundle and its signature intact.
(cd dist && ditto -c -k --keepParent Glideshot Glideshot.zip)
rm -rf "$STAGE"
echo "Made dist/Glideshot.zip ($(du -h dist/Glideshot.zip | cut -f1))"
