/**
 * Enforce minimum webOS TV 4.0 (2018 LG OLED B8 and newer).
 * Uses webOSTV.js deviceInfo (versionMajor) when available.
 */
import { tvLog } from '../utils/tvDebug.js';

var MIN_WEBOS_TV_MAJOR = 4;

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
      var major = parseMajor(device);
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
