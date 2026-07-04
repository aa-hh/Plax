/**
 * Enforce minimum webOS TV 4.0 (2018 LG OLED B8 and newer).
 * Uses webOSTV.js deviceInfo (versionMajor) when available.
 */
import { tvLog } from '../utils/tvDebug.js';
import { fetchSdkVersion, parseWebOSVersionMajor } from './webosSdkVersion.js';

var MIN_WEBOS_TV_MAJOR = 4;
// Bounded wait for the sdkVersion luna round-trip so a slow/hung service
// property call can never wedge boot — falls back to the raw deviceInfo()
// fields (see parseMajor) if it doesn't answer in time.
var SDK_VERSION_TIMEOUT_MS = 1200;

function isTvRuntime() {
  var root = typeof globalThis !== 'undefined' ? globalThis
    : (typeof window !== 'undefined' ? window : null);
  return !!(root && root.PalmSystem && root.PalmSystem.identifier);
}

function parseMajor(device) {
  if (!device) return 0;
  // The webOS TV Simulator populates fields inconsistently — for example,
  // a webOS 26 simulator may still report versionMajor: 2 while sdkVersion
  // and firmwareVersion expose the real version. Take the max so any one
  // accurate field is enough to pass the gate.
  var candidates = [];
  ['versionMajor', 'platformVersionMajor'].forEach(function (k) {
    if (device[k] != null) {
      var n = parseInt(device[k], 10);
      if (!isNaN(n)) candidates.push(n);
    }
  });
  ['sdkVersion', 'version', 'firmwareVersion', 'platformVersion'].forEach(function (k) {
    if (device[k]) {
      var parts = String(device[k]).split('.');
      var n = parseInt(parts[0], 10);
      if (!isNaN(n)) candidates.push(n);
    }
  });
  if (candidates.length === 0) return 0;
  return Math.max.apply(Math, candidates);
}

function showUnsupported(message) {
  var root = document.getElementById('app-root');
  if (!root) return;
  root.innerHTML =
    '<div class="screen">' +
    '<h1 class="screen-title">Unsupported TV</h1>' +
    '<p class="screen-subtitle">Plax requires webOS TV ' + MIN_WEBOS_TV_MAJOR + '.0 or newer.</p>' +
    '<p class="status-msg">' + message + '</p>' +
    '</div>';
}

function checkMinimumWebOS() {
  return new Promise(function (resolve) {
    if (!isTvRuntime()) {
      resolve({ ok: true, reason: 'dev-browser' });
      return;
    }
    if (typeof webOS === 'undefined' || !webOS.deviceInfo) {
      resolve({ ok: true, reason: 'webos-lib-missing' });
      return;
    }
    webOS.deviceInfo(function (device) {
      try { console.info('[versionGate] deviceInfo:', device); } catch (_) {}
      // console.info is near-useless on-device (ares-inspect is flaky on webOS
      // 4 — see docs/design-system/component-registry.md → Motion instrumentation
      // note). Mirror the RAW field values remotely so a version-major mismatch
      // (e.g. a firmware build number being confused for the webOS platform
      // major — the historical caps-motion-gate-bug class of failure) is
      // diagnosable from tv.log without needing devtools on the TV at all.
      try {
        tvLog('boot', 'device-info-raw', {
          versionMajor: device && device.versionMajor,
          platformVersionMajor: device && device.platformVersionMajor,
          sdkVersion: device && device.sdkVersion,
          version: device && device.version,
          firmwareVersion: device && device.firmwareVersion,
          platformVersion: device && device.platformVersion,
          modelName: device && device.modelName
        });
      } catch (_) { /* ignore */ }

      // The raw deviceInfo() callback's OWN `versionMajor` field is NOT
      // trustworthy on real hardware — confirmed on a real 2018 LG B8
      // (modelName OLED55B8LLA) reporting versionMajor:5 / version:"05.50.70"
      // (LG's firmware build number), while sdkVersion correctly reported
      // "4.4.0". Fetch sdkVersion (the same authoritative luna system-property
      // source webos.js already uses for playback capability detection) and
      // PREFER it whenever it resolves; only fall back to the raw-field scan
      // in parseMajor() if the luna call fails or times out (e.g. simulator).
      var settled = false;
      var timeoutId = setTimeout(function () {
        if (settled) return;
        settled = true;
        finish(0);
      }, SDK_VERSION_TIMEOUT_MS);

      fetchSdkVersion(
        function (sdkVersion) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          finish(parseWebOSVersionMajor(sdkVersion));
        },
        function () {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutId);
          finish(0);
        }
      );

      function finish(sdkMajor) {
        // Stamp the resolved sdk major onto the device object so
        // app.js's strictWebosMajor() (the motion-tier gate) can trust it
        // directly instead of re-deriving from the same unreliable fields.
        if (device) device.sdkVersionMajor = sdkMajor;
        tvLog('boot', 'sdk-version-resolved', { sdkVersionMajor: sdkMajor });
        var major = sdkMajor > 0 ? sdkMajor : parseMajor(device);
        if (major >= MIN_WEBOS_TV_MAJOR) {
          resolve({ ok: true, major: major, device: device });
        } else if (major === 0) {
          // No usable version fields at all — likely a simulator stub. Allow through but warn.
          try { console.warn('[versionGate] No usable version fields; allowing through.'); } catch (_) {}
          resolve({ ok: true, major: 0, device: device, reason: 'no-version-fields' });
        } else {
          resolve({
            ok: false,
            major: major,
            device: device,
            message: 'Detected webOS TV major version ' + major + '. Minimum is ' + MIN_WEBOS_TV_MAJOR + '.'
          });
        }
      }
    });
  });
}

function runVersionGate() {
  return checkMinimumWebOS().then(function (result) {
    if (!result.ok) {
      showUnsupported(result.message);
      return { allowed: false, major: result.major || 0, reason: result.reason || null };
    }
    return {
      allowed: true,
      major: result.major || 0,
      device: result.device || null,
      reason: result.reason || null
    };
  });
}

export { MIN_WEBOS_TV_MAJOR, checkMinimumWebOS, runVersionGate, isTvRuntime };
