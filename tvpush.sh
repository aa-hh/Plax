#!/usr/bin/env bash
#
# tvpush.sh — build, package, and install XPlay onto the LG TV in one step.
#
#   ./tvpush.sh                # build + package + install + relaunch on Alec-TV
#   ./tvpush.sh --ip 44        # update ares config IP (last octet) then push
#   ./tvpush.sh -d emulator    # target a different ares device
#   ./tvpush.sh -n             # skip relaunch (install only)
#   ./tvpush.sh -s             # skip build/package, install existing IPK
#
# NOTE: `npm run build` alone never reaches the TV — it only writes dist/.
# This script runs the full package + ares-install path. See
# docs / memory "Deploy XPlay to B8".

set -euo pipefail

# Always operate from the repo root (the dir this script lives in).
cd "$(dirname "$0")"

DEVICE="Alec-TV"
RELAUNCH=1
SKIP_BUILD=0
APP_ID="com.plax"
WEBOS_CONFIG="$HOME/.webos/tv/novacom-devices.json"

# Helper: Update TV IP in the ares device config.
#   update_tv_ip <old_ip> <new_ip>
update_tv_ip() {
  sed -i '' "s/\"host\": \"$1\"/\"host\": \"$2\"/" "$WEBOS_CONFIG" 2>/dev/null
}

# If the caller passes --ip <last-two-octets>, update the config before installing.
# Usage: ./tvpush.sh --ip 44
#   ares-install is authoritative on whether SSH actually connects.
handle_ip_flag() {
  local last_two="$1"
  if ! [[ "$last_two" =~ ^[0-9]{1,3}$ ]] || [ "$last_two" -gt 255 ]; then
    echo "✗ Invalid IP octet: $last_two" >&2
    exit 1
  fi
  if [ ! -f "$WEBOS_CONFIG" ]; then
    echo "✗ webOS config not found at $WEBOS_CONFIG" >&2
    exit 1
  fi
  local old_ip
  old_ip=$(grep -A 10 '"name": "Alec-TV"' "$WEBOS_CONFIG" | grep '"host"' | sed 's/.*"\([0-9.]*\)".*/\1/' | head -1)
  local new_ip="192.168.4.$last_two"
  if [ "$old_ip" = "$new_ip" ]; then
    echo "ℹ IP already $new_ip"
    return
  fi
  echo "▶ Updating config: $old_ip → $new_ip"
  update_tv_ip "$old_ip" "$new_ip"
  echo "✓ Config updated"
}

while getopts "d:nsh" opt; do
  case "$opt" in
    d) DEVICE="$OPTARG" ;;
    n) RELAUNCH=0 ;;
    s) SKIP_BUILD=1 ;;
    h)
      # Print only the leading comment block (stop at the first non-# line
      # after the shebang).
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    *) echo "Unknown option. Run with -h for help. (-r is now the default; use -n to skip relaunch)" >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

# Support: ./tvpush.sh --ip 44  (update ares config before installing)
if [ "${1:-}" = "--ip" ]; then
  handle_ip_flag "${2:?--ip requires a value, e.g. --ip 44}"
  shift 2
fi

# In a git worktree, node_modules lives in the main checkout, not the worktree.
# Symlink it so that npm run scripts and ares-* tools work transparently.
if [ ! -d "node_modules" ]; then
  main_wt=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree/{print $2; exit}')
  if [ -n "$main_wt" ] && [ -d "$main_wt/node_modules" ]; then
    ln -sf "$main_wt/node_modules" "$(pwd)/node_modules"
    echo "ℹ Linked node_modules from main worktree ($main_wt)"
  else
    echo "✗ node_modules not found. Run: npm install from the main checkout." >&2
    exit 1
  fi
fi

# Resolve the ares CLI tools shipped with the project (not on PATH by default).
ARES_INSTALL="node_modules/.bin/ares-install"
ARES_LAUNCH="node_modules/.bin/ares-launch"
if [ ! -x "$ARES_INSTALL" ]; then
  ARES_INSTALL="$(find node_modules -name 'ares-install' -type f 2>/dev/null | head -1 || true)"
fi
if [ ! -x "$ARES_LAUNCH" ]; then
  ARES_LAUNCH="$(find node_modules -name 'ares-launch' -type f 2>/dev/null | head -1 || true)"
fi
if [ -z "${ARES_INSTALL:-}" ] || [ ! -e "$ARES_INSTALL" ]; then
  echo "✗ ares-install not found. Run: npm install" >&2
  exit 1
fi
if [ -z "${ARES_LAUNCH:-}" ] || [ ! -e "$ARES_LAUNCH" ]; then
  echo "✗ ares-launch not found. Run: npm install" >&2
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
  echo "▶ Launching $APP_ID on $DEVICE"
  # Try to close first; silently ignore the error if app wasn't running.
  if "$ARES_LAUNCH" --device "$DEVICE" --close "$APP_ID" >/dev/null 2>&1; then
    echo "  (closed running instance)"
    sleep 1
  fi
  "$ARES_LAUNCH" --device "$DEVICE" "$APP_ID"
fi

echo "✓ Done. ($IPK → $DEVICE)"
