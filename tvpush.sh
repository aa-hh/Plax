#!/usr/bin/env bash
#
# tvpush.sh — build, package, and install XPlay onto the LG TV in one step.
#
#   ./tvpush.sh                # build + package + install + relaunch on Alec-TV
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

# Helper: Extract current TV IP from config
get_tv_ip() {
  grep -A 10 '"name": "Alec-TV"' "$WEBOS_CONFIG" | grep '"host"' | sed 's/.*"\([0-9.]*\)".*/\1/' | head -1
}

# Helper: Check if TV is reachable (simple DNS/ping check)
tv_reachable() {
  local ip="$1"
  # Just do a simple ping; if network blocks it, ares-install will catch real connection issues
  timeout 1 ping -c 1 "$ip" &>/dev/null || return 1
}

# Helper: Update TV IP in config
update_tv_ip() {
  local old_ip="$1"
  local new_ip="$2"
  if sed -i '' "s/\"host\": \"$old_ip\"/\"host\": \"$new_ip\"/" "$WEBOS_CONFIG" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

# Check if TV IP needs updating, prompt if needed
check_tv_ip() {
  if [ ! -f "$WEBOS_CONFIG" ]; then
    echo "✗ webOS config not found at $WEBOS_CONFIG" >&2
    return 1
  fi

  local current_ip
  current_ip=$(get_tv_ip)
  if [ -z "$current_ip" ]; then
    echo "✗ Could not find Alec-TV in config" >&2
    return 1
  fi

  # Check if we can reach the TV; if not, offer to update IP
  if ! tv_reachable "$current_ip"; then
    echo "⚠ TV not responding at $current_ip (might be off or IP changed due to DHCP)"
    read -p "Update IP? Enter last two octets (e.g., 44), or press Enter to skip: " last_two_octets

    # If user pressed Enter without typing, skip the update
    if [ -z "$last_two_octets" ]; then
      echo "ℹ Skipping IP update. Proceeding with current config."
      return 0
    fi

    # Validate input
    if ! [[ "$last_two_octets" =~ ^[0-9]{1,3}$ ]] || [ "$last_two_octets" -gt 255 ]; then
      echo "✗ Invalid IP octets" >&2
      return 1
    fi

    local new_ip="192.168.4.$last_two_octets"
    if [ "$current_ip" = "$new_ip" ]; then
      echo "ℹ IP unchanged. Proceeding with current config."
      return 0
    fi

    echo "▶ Updating config: $current_ip → $new_ip"
    if ! update_tv_ip "$current_ip" "$new_ip"; then
      echo "✗ Failed to update config" >&2
      return 1
    fi
    echo "✓ Config updated"
  fi

  return 0
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

echo "▶ Checking TV IP…"
if ! check_tv_ip; then
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
