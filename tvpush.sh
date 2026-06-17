#!/usr/bin/env bash
#
# tvpush.sh — build, package, and install XPlay onto the LG TV in one step.
#
#   ./tvpush.sh                # build + package + install to Alec-TV
#   ./tvpush.sh -d emulator    # target a different ares device
#   ./tvpush.sh -r             # also relaunch the app after install
#   ./tvpush.sh -s             # skip build/package, install existing IPK
#
# NOTE: `npm run build` alone never reaches the TV — it only writes dist/.
# This script runs the full package + ares-install path. See
# docs / memory "Deploy XPlay to B8".

set -euo pipefail

# Always operate from the repo root (the dir this script lives in).
cd "$(dirname "$0")"

DEVICE="Alec-TV"
RELAUNCH=0
SKIP_BUILD=0
APP_ID="com.xplay.lite"

while getopts "d:rsh" opt; do
  case "$opt" in
    d) DEVICE="$OPTARG" ;;
    r) RELAUNCH=1 ;;
    s) SKIP_BUILD=1 ;;
    h)
      # Print only the leading comment block (stop at the first non-# line
      # after the shebang).
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    *) echo "Unknown option. Run with -h for help." >&2; exit 2 ;;
  esac
done

# Resolve the ares CLI tools shipped with the project (not on PATH by default).
ARES_INSTALL="node_modules/.bin/ares-install"
ARES_LAUNCH="node_modules/.bin/ares-launch"
if [ ! -x "$ARES_INSTALL" ]; then
  ARES_INSTALL="$(find node_modules -name 'ares-install*' -type f 2>/dev/null | head -1 || true)"
fi
if [ -z "${ARES_INSTALL:-}" ] || [ ! -e "$ARES_INSTALL" ]; then
  echo "✗ ares-install not found. Run: npm install" >&2
  exit 1
fi

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "▶ Building + packaging…"
  npm run package
else
  echo "▶ Skipping build (-s); installing existing IPK."
fi

# Find the freshest IPK in build/ (survives version bumps).
IPK="$(ls -t build/*.ipk 2>/dev/null | head -1 || true)"
if [ -z "$IPK" ]; then
  echo "✗ No .ipk found in build/. Did packaging succeed?" >&2
  exit 1
fi

echo "▶ Installing $IPK → $DEVICE"
"$ARES_INSTALL" --device "$DEVICE" "$IPK"

if [ "$RELAUNCH" -eq 1 ]; then
  echo "▶ Relaunching $APP_ID on $DEVICE"
  # Close first (ignore "not running"), then launch.
  "$ARES_LAUNCH" --device "$DEVICE" --close "$APP_ID" >/dev/null 2>&1 || true
  sleep 1
  "$ARES_LAUNCH" --device "$DEVICE" "$APP_ID"
fi

echo "✓ Done. ($IPK → $DEVICE)"
