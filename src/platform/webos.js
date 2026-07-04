/**
 * webOS TV platform integration via webOSTV.js (LG specification).
 * https://webostv.developer.lge.com/develop/references/webostvjs-introduction
 */

import { loadDeviceDisplay, applyGraphicsViewport } from './deviceDisplay.js';
import { initMotionCursor } from './motionCursor.js';
import { getWebOSVersion, isSimulatorRuntime } from './webosRuntime.js';
import { fetchSdkVersion, parseWebOSVersionMajor } from './webosSdkVersion.js';
import { setPlexDeviceInfo, logPlexClientIdentityOnce } from '../plex/clientIdentity.js';
import { setState } from '../core/store.js';
import {
  resolveWebOsMajor,
  isAudioDirectPlay as matrixIsAudioDirectPlay
} from '../playback/capabilityMatrix.js';

function normalizeDeviceInfoForStore(info, sdkVersion) {
  info = info || {};
  // sdkVersion from luna://com.webos.service.tv.systemproperty is the reliable
  // webOS version string (e.g. "4.4.3-22"). Falls back to deviceInfo.version
  // which on some firmwares reports internal firmware (e.g. "05.50.70") rather
  // than the actual webOS version.
  var version = sdkVersion || info.version;
  return {
    version: version,
    versionMajor: parseWebOSVersionMajor(version),
    model: info.modelName || info.model || 'LG TV',
    screenWidth: info.screenWidth,
    screenHeight: info.screenHeight,
    uhd: !!info.uhd,
    hdr10: !!info.hdr10,
    dolbyVision: !!info.dolbyVision
  };
}

function getDeviceInfo(callback) {
  if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
    var deviceInfoResult = null;
    var sdkVersionResult = null;
    var pending = 2;

    function onBothReady() {
      var normalized = normalizeDeviceInfoForStore(deviceInfoResult, sdkVersionResult);
      setState({ deviceInfo: normalized });
      callback(normalized);
    }

    webOS.deviceInfo(function (info) {
      deviceInfoResult = info;
      if (--pending === 0) onBothReady();
    });

    fetchSdkVersion(
      function (sdkVersion) { sdkVersionResult = sdkVersion; if (--pending === 0) onBothReady(); },
      function () { if (--pending === 0) onBothReady(); }
    );
    return;
  }
  var browserInfo = {
    version: 'browser',
    model: 'Browser',
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    uhd: false,
    hdr10: false,
    dolbyVision: false
  };
  setState({ deviceInfo: browserInfo });
  callback(browserInfo);
}

function initPlatform() {
  applyGraphicsViewport();
  window.addEventListener('resize', applyGraphicsViewport);

  if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
    var deviceInfoResult = null;
    var sdkVersionResult = null;
    var pending = 2;

    function onBothReady() {
      var normalized = normalizeDeviceInfoForStore(deviceInfoResult, sdkVersionResult);
      setState({ deviceInfo: normalized });
      // Pass the NORMALIZED device (version = sdkVersion, e.g. "4.4.0") so the
      // Plex client identity's platformVersion reflects the real webOS version,
      // not the firmware string (e.g. "05.50.70") that deviceInfo.version
      // reports. isWebOs4Tv() reads platformVersion from this identity.
      setPlexDeviceInfo(normalized);
      logPlexClientIdentityOnce();
    }

    webOS.deviceInfo(function (device) {
      deviceInfoResult = device;
      if (--pending === 0) onBothReady();
    });

    fetchSdkVersion(
      function (sdkVersion) { sdkVersionResult = sdkVersion; if (--pending === 0) onBothReady(); },
      function () { if (--pending === 0) onBothReady(); }
    );
  } else if (typeof webOS === 'undefined') {
    logPlexClientIdentityOnce();
  }

  var el = document.getElementById('compat-marker');
  if (el) {
    loadDeviceDisplay(function (info) {
      el.setAttribute('data-webos-version', info.version || getWebOSVersion());
      if (info.versionMajor != null) {
        el.setAttribute('data-webos-major', String(info.versionMajor));
      }
    });
  }

  // Note: do NOT set webOS.platformBack.onBackKey here.
  // The router already handles keydown 461 natively. Setting onBackKey would
  // cause a double back() call: native keydown 461 fires first, then onBackKey
  // fires and dispatches a synthetic 461, triggering back() a second time on
  // the home screen while exitToLauncher() is still in flight.

  initRelaunchHandling();
  initMotionCursor();
}

/**
 * Bring app to foreground after webOSRelaunch when handlesRelaunch is true in appinfo.json.
 * https://webostv.developer.lge.com/develop/guides/app-lifecycle-management
 */
function activateAppForeground() {
  var root = typeof globalThis !== 'undefined' ? globalThis
    : (typeof window !== 'undefined' ? window : null);
  if (!root) return false;
  try {
    if (root.webOSSystem && typeof root.webOSSystem.activate === 'function') {
      root.webOSSystem.activate();
      return true;
    }
    if (root.PalmSystem && typeof root.PalmSystem.activate === 'function') {
      root.PalmSystem.activate();
      return true;
    }
  } catch (e) { /* ignore */ }
  return false;
}

function initRelaunchHandling() {
  if (typeof document === 'undefined') return;
  document.addEventListener('webOSRelaunch', function () {
    activateAppForeground();
  }, true);
}

/**
 * Leave the app (Home / exit prompt per webOS version). Use on entry routes when Back
 * cannot go further in-app. https://webostv.developer.lge.com/develop/guides/back-button
 */
var _exitPending = false;
function exitToLauncher() {
  if (_exitPending) return;
  _exitPending = true;
  // Reset after 2 s in case the exit was intercepted or the user cancelled.
  setTimeout(function () { _exitPending = false; }, 2000);
  if (typeof webOS !== 'undefined' && typeof webOS.platformBack === 'function') {
    try { webOS.platformBack(); return; } catch (e) { /* ignore */ }
  }
  // Fallback for webOS versions where platformBack is not a callable function.
  try { window.close(); } catch (e) { /* ignore */ }
}

function probeCodec(mime) {
  var v = document.createElement('video');
  if (!v.canPlayType) return '';
  return v.canPlayType(mime) || '';
}

/**
 * Resolve the webOS major version from a deviceInfo object. Delegates to the
 * capability matrix's `resolveWebOsMajor` (single source of truth for version
 * parsing + the `OLED\d{2}[BCEW]8` model regex) so webos.js and the matrix can
 * never drift. The matrix is DOM-free; webos.js delegates to it (not the
 * reverse) because the matrix must not import this DOM-touching module.
 */
function parseWebOsMajor(deviceInfo) {
  return resolveWebOsMajor(deviceInfo);
}

/**
 * Device-only heuristic (no runtime / window). Used on real LG TVs when
 * canPlayType omits DTS. webOS 4+ resolves directly via the matrix; the extra
 * model regex covers later B/C/E/W-series (e.g. C9, B7) whose version string
 * may be absent so the matrix returns 0 but the hardware still decodes DTS.
 */
function tvLikelySupportsDtsFromDevice(deviceInfo) {
  var major = parseWebOsMajor(deviceInfo);
  if (major >= 4) return true;
  var model = String((deviceInfo && (deviceInfo.modelName || deviceInfo.model)) || '');
  if (/OLED\d{2}[BCEW][789]\d/i.test(model)) return true;
  return false;
}

/**
 * HTML5 canPlayType often omits DTS even when the TV media pipeline decodes it
 * (common on 2018 LG OLED / webOS 4.x). Simulator and desktop browsers stay conservative.
 */
function tvLikelySupportsDts(deviceInfo) {
  if (isSimulatorRuntime()) return false;
  if (getWebOSVersion() === 'browser') return false;
  return tvLikelySupportsDtsFromDevice(deviceInfo);
}

/**
 * Browser `canPlayType` is the genuine runtime decode signal; we keep probing
 * it. When it comes back empty on a real TV (common on 2018 LG OLED / webOS 4.x
 * where the media pipeline decodes formats the HTML5 probe omits), fall back to
 * the capability matrix as the authority for *which* audio codecs the TV
 * direct-plays — `isAudioDirectPlay` replaces the old hardcoded DTS/AC-3 branch.
 * `tvLikelySupportsDts` stays as the runtime gate so browsers/simulators stay
 * conservative and never infer support they can't honour.
 */
function getCodecCapabilities(deviceInfo) {
  var caps = {
    h264: probeCodec('video/mp4; codecs="avc1.640028"'),
    hevc: probeCodec('video/mp4; codecs="hvc1.1.6.L153.B0"'),
    ac3: probeCodec('audio/mp4; codecs="ac-3"'),
    eac3: probeCodec('audio/mp4; codecs="ec-3"'),
    dts: probeCodec('audio/vnd.dts')
  };
  var inferOnTv = tvLikelySupportsDts(deviceInfo);
  if ((!caps.dts || caps.dts === '') && inferOnTv &&
      matrixIsAudioDirectPlay(deviceInfo, 'dca')) {
    caps.dts = 'probably';
    caps.dtsInferred = true;
  }
  if ((!caps.eac3 || caps.eac3 === '') && inferOnTv &&
      matrixIsAudioDirectPlay(deviceInfo, 'eac3')) {
    caps.eac3 = 'probably';
    caps.eac3Inferred = true;
  }
  if ((!caps.ac3 || caps.ac3 === '') && inferOnTv &&
      matrixIsAudioDirectPlay(deviceInfo, 'ac3')) {
    caps.ac3 = 'probably';
    caps.ac3Inferred = true;
  }
  return caps;
}

function keepScreenOn(enable) {
  if (typeof webOS !== 'undefined' && webOS.service) {
    try {
      webOS.service.request('luna://com.webos.service.tvpower', {
        method: enable ? 'keepAlive' : 'releaseKeepAlive',
        parameters: { subscribe: false }
      });
    } catch (e) { /* ignore */ }
  }
}

/**
 * Background / suspend signal for playback pause policy.
 *
 * webOSTV.js does not expose dedicated app suspend or foreground Luna callbacks
 * to packaged web apps. On webOS TV Chromium shells, losing focus (Home, app
 * switch, or TV standby) is reflected via the Page Visibility API — the same
 * signal LG documents for web apps — so visibilitychange is sufficient here.
 *
 * @param {function(): void} callback Invoked when document becomes hidden.
 * @returns {function(): void} Detach listener.
 */
function onAppBackground(callback) {
  function handler() {
    if (document.visibilityState === 'hidden') callback();
  }
  document.addEventListener('visibilitychange', handler);
  return function detachAppBackground() {
    document.removeEventListener('visibilitychange', handler);
  };
}

export {
  getWebOSVersion,
  getDeviceInfo,
  initPlatform,
  activateAppForeground,
  exitToLauncher,
  probeCodec,
  getCodecCapabilities,
  keepScreenOn,
  onAppBackground,
  isSimulatorRuntime,
  tvLikelySupportsDts,
  tvLikelySupportsDtsFromDevice,
  parseWebOsMajor
};
