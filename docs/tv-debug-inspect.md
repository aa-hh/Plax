# Debugging XPlay Lite on a real LG TV (webOS 4.x, e.g. OLED B8)

## Quick answer for PIN / bootstrap hangs

**Do not rely on Mac Chrome DevTools alone on webOS 4.4.** Use the **on-TV debug overlay** first:

```bash
source ~/.nvm/nvm.sh && nvm use 20
ares-launch -p '{"debug":1}' --device Alec-TV com.xplay.lite
```

You should see a **black log strip at the bottom** (`Debug overlay active`, then `[profile-picker] pin complete`, `switch ok`, `bootstrap start`, etc.). The **status line** above profiles shows the same steps in plain language (`Verifying PIN…`, `Finding Plex servers…`, errors).

---

## `VM##: Uncaught SyntaxError: Unexpected token '~'` in DevTools

### Cause

This is **almost always a Chrome ↔ TV Inspector mismatch**, not XPlay code.

- **Alec-TV (webOS 4.4 / 2018 B8)** runs an **old Chromium** (roughly low‑50s; see [compatibility matrix](../compatibility-matrix.md)).
- **`ares-inspect`** opens a URL like  
  `http://localhost:<port>/devtools/inspector.html?ws=localhost:<port>/devtools/page/<uuid>`
- That page is the **DevTools front-end on your Mac**. If you open it in **current Chrome** (120–148+), the front-end speaks a **newer debugging protocol** than the TV WebKit engine exposes.
- The front-end then throws internal **`VMxxx` SyntaxError** lines (often involving `~` from minified DevTools scripts). That noise is **DevTools failing to attach cleanly**, not your app parsing `~`.

### Is it blocking?

| Symptom | Meaning |
|--------|---------|
| Only `VM## SyntaxError` and **no** `[XPlay Lite]` / `[profile-picker]` lines | **Inspector is not usable** with that Chrome version — use overlay or older Chrome. |
| `VM##` errors **plus** app `console.error` lines | **Harmless DevTools noise** — ignore VM lines, read app logs. |
| Empty console, no app logs | Wrong target, app not foreground, or broken tunnel — not fixed by app code. |

XPlay does **not** use `eval()` for logging. Tilde (`~`) in the bundle is normal string content (e.g. “~5 Mbps”); it does **not** produce `VM##` errors by itself.

### Recommended Chrome for webOS **4.x** TVs

LG publishes tool/browser compatibility by release year:  
[Compatible SDK / tools by release year](https://webostv.developer.lge.com/develop/tools/sdk-introduction#compatible-sdkversiontools-by-release-year)

Practical guidance for **webOS 4.0–4.9 (2018–2019 TVs)**:

1. **Do not use the latest Chrome** for `ares-inspect`.
2. Use a **legacy Chrome 59–79** install (many teams use **Chrome 68** or **79** for webOS 4/5 inspect).
3. Options:
   - **Intel Mac:** old full Chrome installers or Chromium snapshots (see **Apple Silicon Mac** below if CfT has no 68/79).
   - [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) — **only 113+**; **does not ship 68/79/87**. Do not use current stable Chrome for the inspect URL.
   - Old webOS TV SDK bundle browser (if you still have SDK 4.x/5.x installed).

**webOS 5+** TVs align with **Chromium 68**; **webOS 6+** with **79+** — B8 is **older**, so err toward **59–68** if 79 still shows VM errors.

---

## On-TV debug overlay (works without inspect)

| Method | How |
|--------|-----|
| **Launch param (best)** | `ares-launch -p '{"debug":1}' -d Alec-TV com.xplay.lite` |
| Settings | Settings → **Debug log overlay** → On → relaunch |
| Storage | `localStorage` key `xplay_debug_enabled` = `"1"` |
| API | `window.__xplayDebug.enable()` (only if Console already works) |

Overlay shows the last ~14 lines; PIN flow also updates **`#profile-status`**.

**Perf HUD** (`xplay_perf_enabled` / `?perf=1`) is separate — it does **not** enable console or this overlay.

---

## HTTP log sink (Mac file + terminal)

Stream the same `tvLog` lines to your Mac so you can paste into Cursor without fighting `ares-inspect`.

### 1. Find your Mac’s LAN IP

```bash
# Wi‑Fi (common)
ipconfig getifaddr en0
# Ethernet
ipconfig getifaddr en1
```

Example: `192.168.4.23`

### 2. Start the receiver on the Mac

```bash
cd "/Users/alechamilton/XPlay 2"
npm run log:receive
```

Listens on **`0.0.0.0:8765`** (override with `PORT=9000 npm run log:receive`). Each POST is appended to **`logs/tv.log`** (gitignored) and echoed to the terminal.

### 3. Enable debug + sink on the TV

| Method | How |
|--------|-----|
| **Settings** | Debug log overlay → **On**. **Log sink URL** → `http://192.168.4.23:8765/log` (your Mac IP). |
| **Launch param** | `ares-launch -p '{"debug":1,"logSink":"http://192.168.4.23:8765/log"}' --device Alec-TV com.xplay.lite` |
| **Storage** | `localStorage` `xplay_log_sink_url` = full `/log` URL |
| **Build inject** | `window.__XPLAY_LOG_SINK_URL__ = 'http://…/log'` in dev HTML (optional) |

Remote POST requires **debug overlay on** and a non-empty sink URL. Posts are fire-and-forget (XHR fallback if `fetch` is missing).

### 4. Verify

1. Reproduce on TV (PIN, playback, etc.).
2. On Mac: `tail -f logs/tv.log` — lines like `2026-05-29T… [log] [profile-picker] pin complete`.
3. Receiver terminal should print the same lines with a local timestamp prefix.

**Firewall:** allow incoming TCP **8765** on the Mac if logs never arrive.

---

## ares-inspect workflow (Node 20, Alec-TV)

```bash
cd "/Users/alechamilton/XPlay 2"
source ~/.nvm/nvm.sh && nvm use 20

# Foreground app on TV first
ares-launch --device Alec-TV com.xplay.lite

# Leave this terminal open (SSH tunnel)
ares-inspect --device Alec-TV --app com.xplay.lite
```

Copy the printed line:

`Application Debugging - http://localhost:NNNNN/devtools/inspector.html?ws=localhost:NNNNN/devtools/page/...`

1. Open that URL in **legacy Chrome 59–79** (not default Chrome 120+).
2. **Console** → **All levels**; clear filter text.
3. Reproduce PIN on TV; look for `[XPlay Lite] startup-build`, `[profile-picker] pin complete (4 digits)`.

**Tips**

- Developer Mode app must stay running on the TV.
- If the inspector page is blank or only VM errors: try **Chrome 68**, relaunch app, run `ares-inspect` again.
- CLI **`tv` profile**: `ares-log` / `ares-shell` are **not** available; **`ares-inspect`** + overlay are the supported paths.
- **`ares-novacom -r "echo test"`** runs shell on the TV but does **not** stream app `console.log` — use inspect or overlay.

Optional combined debug:

```bash
ares-launch -p '{"debug":1}' --device Alec-TV com.xplay.lite
ares-inspect --device Alec-TV --app com.xplay.lite
```

---

## HLS rejection on B8 (MediaError code 4)

When native HLS fails, look for these log lines (overlay or `npm run log:receive`):

| Line | Meaning |
|------|---------|
| `[playback] play attempt` … `"mseHls":false` | Real TV path — **native** `<video>` HLS, not hls.js |
| `[playback] transcode params` … `"protocol":"hls"` | Plex universal `start.m3u8` |
| `[playback] video error` … `"code":4` | `MEDIA_ERR_SRC_NOT_SUPPORTED` — TV rejected manifest/codec |
| `[playback] HLS manifest probe` | **New:** XHR fetch of the same m3u8 — HTTP status + `EXT-X-STREAM-INF` / `CODECS` snippet |

### Ranked likely causes (OLED B8 / webOS 4.4, WAN plex.direct)

1. **Bad or empty m3u8 from server** — probe shows `httpStatus` 400/502 or body that is not `#EXTM3U` (PMS/proxy error, not a codec issue).
2. **LG-native HLS rejects master playlist CODECS** — probe shows `CODECS=` with multiple values, missing CODECS on audio-only variants, or MPEG-TS (`container=mpegts`) remux on webOS 4. Confirm URL contains `container=mp4` in `X-Plex-Client-Profile-Extra` for B8.
3. **PMS `/decision` HTTP 400 over WAN** — session may skip decision and build `start.m3u8` directly; check `[session] decision failed` or `decision skipped (webOS4)`.
4. **Segment/init fetch blocked** — manifest loads (`httpStatus` 200, valid snippet) but TV still code 4: HTTPS/cert on `plex.direct`, or fMP4 init segment codec mismatch.
5. **Bitrate/resolution over TV cap** — less common when PMS transcodes to H.264/AAC; probe CODECS should show `avc1` + `mp4a`.

### What to paste after redeploy

After a failed play, capture from `logs/tv.log` or overlay:

- Full `[playback] HLS manifest probe` JSON (`httpStatus`, `snippet`, `streamInfs`)
- Preceding `[playback] play attempt` (`mseHls`, mode)
- `[session] url …` line — check `container=mp4` vs `container=mpegts` in profile extra
- `[session] decision failed` / `decision skipped` if present

---

## Build / IPK notes

- `console.*` is **not** stripped (`drop_console: false` in Rollup terser).
- **`npm run package`** removes **`*.map`** from the staged IPK and strips `//# sourceMappingURL` from `app.js` so DevTools on old TVs is less likely to choke on huge source maps.

---

## Sanity checks

| Check | Expected |
|-------|----------|
| Overlay launch | Bottom strip: `Debug overlay active` |
| After boot (if inspect works) | `[XPlay Lite] startup-build …`, `[XPlay Lite] boot ms: …` |
| 4 PIN digits | Overlay: `pin complete`, `switch start`, `bootstrap start`; status: `Verifying PIN…` |
| Neither overlay nor `[XPlay Lite]` in Console | Old IPK not installed, or inspect not connected — redeploy IPK and use overlay |

---

## Apple Silicon Mac (M1/M2/M3/M4)

**Summary:** There is **no native arm64 build** of legacy Chrome/Chromium **68, 79, or 87** for macOS. [Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/) only publishes **113+** (and those builds are **too new** for webOS 4.4 `ares-inspect`). On Apple Silicon, use **Rosetta 2** and an **Intel (x86_64) Chromium snapshot** from Google’s bucket (`Mac/`, not `Mac_Arm/`).

### What exists (checked against Google’s feeds)

| Target | Chrome for Testing (`storage.googleapis.com/.../chrome-for-testing-public/`) | Chromium snapshots (`commondatastorage.../chromium-browser-snapshots/`) |
|--------|-----------------------------------------------------------------------------|---------------------------------------------------------------------------|
| **68** | **Not published** (404 for mac-x64 / mac-arm64) | **`Mac/<pos>/chrome-mac.zip` only** — **x86_64**; **`Mac_Arm/` → 404** |
| **79** | **Not published** | Same — **Intel Mac zip only** |
| **87** | **Not published** | Same — **Intel Mac zip only** |
| **113+** | **mac-arm64** and **mac-x64** (CfT JSON starts at 113.0.5672.0) | N/A for inspect — **still too new** for B8 / webOS 4.4 |

CfT **mac-arm64** appears from **113** onward; that does **not** help webOS 4 inspect (you need roughly **59–79**, often **68** on a B8).

### Recommended workflow on Apple Silicon

1. **Confirm arm64:** `uname -m` → `arm64`
2. **Install Rosetta** (once):  
   `softwareupdate --install-rosetta --agree-to-license`
3. **Install legacy Chromium under Rosetta** (pick one row; **79** is a common default, **68** if VM errors persist on B8):

```bash
# Choose ONE snapshot (Intel macOS zip — runs via Rosetta)
# Chromium ~68 (good first try for webOS 4.x / B8)
POS=561733
# Chromium ~79 (webOS 5-era tooling; often OK on 4.x)
# POS=706915
# Chromium ~88 (nearest snapshot tested near the 87 era; not exact 87.0.4280.88)
# POS=827102

DEST="$HOME/devtools-browsers/chromium-${POS}"
mkdir -p "$DEST"
curl -fSL "https://commondatastorage.googleapis.com/chromium-browser-snapshots/Mac/${POS}/chrome-mac.zip" -o "/tmp/chromium-${POS}.zip"
unzip -qo "/tmp/chromium-${POS}.zip" -d "$DEST"
CHROMIUM_APP="$DEST/chrome-mac/Chromium.app"
file "$CHROMIUM_APP/Contents/MacOS/Chromium"   # expect: x86_64
arch -x86_64 "$CHROMIUM_APP/Contents/MacOS/Chromium" --version
```

4. **`ares-inspect`** on the TV (Node 20), copy the printed `http://localhost:…/devtools/inspector.html?ws=…` URL.
5. **Open that URL only in the Rosetta Chromium** (not in default arm64 Chrome):

```bash
INSPECT_URL='http://localhost:NNNNN/devtools/inspector.html?ws=localhost:NNNNN/devtools/page/...'

# Option A: open the .app under Rosetta
arch -x86_64 open -a "$CHROMIUM_APP" --args "$INSPECT_URL"

# Option B: run the binary directly
arch -x86_64 "$CHROMIUM_APP/Contents/MacOS/Chromium" "$INSPECT_URL"
```

6. If the inspector still shows only `VM## SyntaxError` lines, switch snapshot to **`POS=561733` (~68)** and repeat.

**Verified on arm64 macOS:** Rosetta + snapshot **706915** reports `Chromium 79.0.3945.0` and runs as **x86_64** via `arch -x86_64`.

### Do not use on Apple Silicon for B8 inspect

- **Default Chrome** (arm64, current stable) — protocol mismatch / `VM##` errors.
- **Chrome for Testing 113+ arm64** — installs natively but is **too new** for the TV debugger.
- **`Mac_Arm` Chromium snapshots** for old positions — **404**; Apple Silicon did not exist when those builds were produced.

### Fallback (no Rosetta / no legacy browser)

Use the **on-TV debug overlay** (`ares-launch -p '{"debug":1}' …`) — works on any Mac.

