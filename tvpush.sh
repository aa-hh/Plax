#!/usr/bin/env bash
#
# tvpush.sh — build, package, and install XPlay onto the LG TV in one step.
#
#   ./tvpush.sh                # build + package + install + relaunch
#   ./tvpush.sh -S             # build + launch in the webOS TV Simulator (no TV/IPK)
#   ./tvpush.sh -d emulator    # target a different ares device (overrides config)
#   ./tvpush.sh -n             # skip relaunch (install only)
#   ./tvpush.sh -s             # skip build/package, install existing IPK
#   ./tvpush.sh -c             # (re)configure the target TV (name + IP), then exit
#
# This is the ONLY command you need to deploy to a TV — it does all the ares
# setup for you. On a fresh clone it will:
#   1. run `npm install` if dependencies are missing,
#   2. ask for the TV's ares device name + IP (shown in the TV's
#      Developer Mode app) and save them to .tvtarget (gitignored),
#   3. register the device with ares-setup-device,
#   4. pair over SSH (ares-novacom --getkey, prompts for the Dev Mode passphrase),
#   5. build, package, install, and relaunch the app.
# Nothing is hardcoded. If a later install can't reach the TV (IP changed or
# Developer Mode lapsed), it re-prompts for the IP, re-pairs, and retries.
#
# NOTE: `npm run build` alone never reaches the TV — it only writes dist/.
# This script runs the full package + ares-install path. See
# docs / memory "Deploy XPlay to B8".

set -euo pipefail

# Always operate from the repo root (the dir this script lives in).
cd "$(dirname "$0")"

CONFIG_FILE=".tvtarget"
RELAUNCH=1
SKIP_BUILD=0
RECONFIGURE=0
SIMULATOR=0
DEVICE_OVERRIDE=""
APP_ID="com.plax"

# webOS dev-mode SSH defaults (same for every LG TV).
TV_PORT="9922"
TV_USER="prisoner"

while getopts "d:nscSh" opt; do
  case "$opt" in
    d) DEVICE_OVERRIDE="$OPTARG" ;;
    n) RELAUNCH=0 ;;
    s) SKIP_BUILD=1 ;;
    c) RECONFIGURE=1 ;;
    S) SIMULATOR=1 ;;
    h)
      # Print only the leading comment block (stop at the first non-# line
      # after the shebang).
      awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
      exit 0
      ;;
    *) echo "Unknown option. Run with -h for help. (-r is now the default; use -n to skip relaunch)" >&2; exit 2 ;;
  esac
done

# Bootstrap dependencies. The ares CLI ships in node_modules, so a fresh
# clone needs `npm install` before anything else can run.
if [ ! -d node_modules ] || ! ls node_modules/.bin/ares-install >/dev/null 2>&1; then
  if find node_modules -name 'ares-install' -type f >/dev/null 2>&1; then
    : # ares present under a nested path — fine
  else
    echo "▶ Installing dependencies (first run)…"
    npm install
  fi
fi

# Resolve the ares CLI tools shipped with the project (not on PATH by default).
resolve_ares() {
  # $1 = tool name -> echoes resolved path or exits.
  local name="$1" path="node_modules/.bin/$1"
  if [ ! -x "$path" ]; then
    path="$(find node_modules -name "$name" -type f 2>/dev/null | head -1 || true)"
  fi
  if [ -z "${path:-}" ] || [ ! -e "$path" ]; then
    echo "✗ $name not found. Run: npm install" >&2
    exit 1
  fi
  echo "$path"
}

ARES_INSTALL="$(resolve_ares ares-install)"
ARES_LAUNCH="$(resolve_ares ares-launch)"
ARES_SETUP="$(resolve_ares ares-setup-device)"
ARES_NOVACOM="$(resolve_ares ares-novacom)"

# ── Simulator path (-S) ─────────────────────────────────────────────────────
# Build, then open the built dist/ in the webOS TV Simulator. No TV, IPK, ares
# device, or pairing involved. NOTE: ares-launch -s only loads the app INTO the
# simulator and shows its home screen — you still click the Plax tile to start
# it (the simulator has no true headless auto-launch).
if [ "$SIMULATOR" -eq 1 ]; then
  if [ "$SKIP_BUILD" -eq 0 ]; then
    echo "▶ Building…"
    npm run build
  fi
  # webOS TV version = the leading number of the installed simulator app name.
  SIM_APP="$(ls -d /Applications/webOS_TV_*_Simulator_*.app 2>/dev/null | sort -V | tail -1 || true)"
  if [ -z "$SIM_APP" ]; then
    echo "✗ No webOS TV Simulator found in /Applications. Install it from the LG webOS SDK." >&2
    exit 1
  fi
  SIM_VER="$(basename "$SIM_APP" | sed -E 's/webOS_TV_([0-9]+)_Simulator.*/\1/')"
  echo "▶ Opening dist/ in webOS TV $SIM_VER Simulator"
  "$ARES_LAUNCH" -s "$SIM_VER" dist --simulator-path /Applications
  echo "✓ Simulator open. Click the Plax tile on its home screen to start the app."
  exit 0
fi

# ── Target TV configuration (.tvtarget) ────────────────────────────────────
# Persists the ares device name + IP so nothing is hardcoded. First run (or
# `-c`) prompts for both and registers the device with ares-setup-device.

prompt_nonempty() {
  # $1 = prompt text, $2 = default (optional) -> echoes answer on stdout.
  local ans def="${2:-}"
  while :; do
    if [ -n "$def" ]; then
      read -r -p "$1 [$def]: " ans </dev/tty || true
      ans="${ans:-$def}"
    else
      read -r -p "$1: " ans </dev/tty || true
    fi
    [ -n "$ans" ] && { echo "$ans"; return; }
    echo "  (required)" >&2
  done
}

register_device() {
  # Registers/updates DEVICE -> TV_IP in the ares device registry.
  # Uses --modify if it already exists, --add otherwise.
  local mode="--add"
  if "$ARES_SETUP" --list 2>/dev/null | awk 'NR>2{print $1}' | grep -qx "$DEVICE"; then
    mode="--modify"
  fi
  echo "▶ Registering $DEVICE → $TV_USER@$TV_IP:$TV_PORT"
  "$ARES_SETUP" "$mode" "$DEVICE" \
    --info "host=$TV_IP" \
    --info "port=$TV_PORT" \
    --info "username=$TV_USER"
}

pair_device() {
  # Fetch the SSH key from the TV's Developer Mode app. Prompts for the
  # 6-char passphrase shown in that app. Required once per TV (and again if
  # Developer Mode is re-armed). Emulator needs no key, so skip it.
  if [ "$DEVICE" = "emulator" ]; then return 0; fi
  echo "▶ Pairing with $DEVICE (enter the passphrase from the TV's Developer Mode app)…"
  if "$ARES_NOVACOM" --getkey -d "$DEVICE"; then
    echo "✓ Paired."
  else
    echo "⚠ Pairing failed. Make sure the Developer Mode app is OPEN on the TV and" >&2
    echo "  'Dev Mode Status' is ON, then re-run: ./tvpush.sh -c" >&2
  fi
}

configure_target() {
  echo "── Configure target TV ──"
  echo "  On the TV: open the 'Developer Mode' app — it shows the IP and a passphrase."
  DEVICE="$(prompt_nonempty 'ares device name (any label, e.g. LG-TV)' "${DEVICE:-LG-TV}")"
  TV_IP="$(prompt_nonempty 'TV IP address' "${TV_IP:-}")"
  register_device
  { echo "DEVICE=$DEVICE"; echo "TV_IP=$TV_IP"; } > "$CONFIG_FILE"
  echo "✓ Saved to $CONFIG_FILE"
  pair_device
}

# Load saved config if present.
DEVICE=""
TV_IP=""
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

# An explicit -d wins and skips the config flow entirely (e.g. emulator).
if [ -n "$DEVICE_OVERRIDE" ]; then
  DEVICE="$DEVICE_OVERRIDE"
fi

if [ "$RECONFIGURE" -eq 1 ]; then
  configure_target
  exit 0
fi

# No device known and no override -> first-run setup.
if [ -z "$DEVICE_OVERRIDE" ] && { [ -z "$DEVICE" ] || [ -z "$TV_IP" ]; }; then
  echo "No target TV configured yet."
  configure_target
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
if ! "$ARES_INSTALL" --device "$DEVICE" "$IPK"; then
  # Most common cause: the TV's IP changed (DHCP). Offer to update it and retry.
  # Skip the recovery flow for an ad-hoc -d override (no saved config to fix).
  if [ -n "$DEVICE_OVERRIDE" ]; then
    echo "✗ Install to $DEVICE failed." >&2
    exit 1
  fi
  echo "" >&2
  echo "✗ Couldn't reach $DEVICE at ${TV_IP:-?}." >&2
  echo "  This usually means the TV's IP changed (DHCP) or Developer Mode lapsed." >&2
  echo "  Open the TV's Developer Mode app — confirm the IP and that Dev Mode is ON." >&2
  TV_IP="$(prompt_nonempty 'TV IP address (Enter to keep current)' "$TV_IP")"
  register_device
  { echo "DEVICE=$DEVICE"; echo "TV_IP=$TV_IP"; } > "$CONFIG_FILE"
  echo "▶ Retrying install $IPK → $DEVICE"
  if ! "$ARES_INSTALL" --device "$DEVICE" "$IPK"; then
    # Still failing — likely a stale SSH key after Dev Mode was re-armed. Re-pair and retry once more.
    echo "▶ Re-pairing (Developer Mode may have been re-armed)…" >&2
    pair_device
    "$ARES_INSTALL" --device "$DEVICE" "$IPK"
  fi
fi

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
