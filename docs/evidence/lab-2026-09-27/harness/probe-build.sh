#!/bin/sh
# Builds a TEST-ONLY copy of the site with the probe hooks from probe.py, for sweep.cjs and labshot.cjs.
# Each run copies the sources into a new directory from mktemp (under $TMPDIR, default /tmp) and builds
# there: it never deletes anything and never writes to the repository. Never deploy this build.
# The build log goes to stderr; stdout is only the path of the built site, so:
#   DIST=$(sh docs/evidence/lab-2026-09-27/harness/probe-build.sh)
#   python3 -m http.server 4331 --bind 127.0.0.1 --directory "$DIST"
# Remove the copy when done: rm -r "$(dirname "$DIST")" (a lab-probe.* directory).
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE" && git rev-parse --show-toplevel)
[ -f "$REPO/astro.config.mjs" ] && [ -d "$REPO/node_modules" ] || { echo "probe-build: $REPO is not a built checkout (npm ci first)" >&2; exit 1; }
WORK=$(mktemp -d "${TMPDIR:-/tmp}/lab-probe.XXXXXX")
cp -R "$REPO/src" "$REPO/public" "$WORK/"
cp "$REPO/astro.config.mjs" "$REPO/package.json" "$REPO/tsconfig.json" "$WORK/"
ln -s "$REPO/node_modules" "$WORK/node_modules"
python3 "$HERE/probe.py" "$WORK/src/scripts/robot-scene.ts" >&2
(cd "$WORK" && npx astro build --outDir "$WORK/dist" >&2) || { echo "probe-build: build failed; the copy is kept in $WORK" >&2; exit 1; }
echo "$WORK/dist"
