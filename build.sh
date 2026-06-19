#!/usr/bin/env bash
# Builds dist/courtlistener.xpi from the contents of plugin/.
# manifest.json must end up at the root of the archive.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$root/dist"
xpi="$root/dist/courtlistener.xpi"
rm -f "$xpi"
( cd "$root/plugin" && zip -r -X "$xpi" . -x '.*' )
echo "Built $xpi"
