#!/usr/bin/env bash
# Builds dist/slides-free-draw-v<version>.zip, ready for "Load unpacked" or the Chrome Web Store.
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
OUT="dist/slides-free-draw-v${VERSION}.zip"
FILES=(manifest.json content.js popup.html popup.js)

mkdir -p dist
rm -f "$OUT"
zip -X -q "$OUT" "${FILES[@]}"
echo "Built $OUT"
