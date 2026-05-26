/**
 * webOS TV platform integration via webOSTV.js (LG specification).
 * https://webostv.developer.lge.com/develop/references/webostvjs-introduction
 */

import { loadDeviceDisplay, applyGraphicsViewport } from './deviceDisplay.js';
import { initMotionCursor } from './motionCursor.js';
import { getWebOSVersion, isSimulatorRuntime } from './webosRuntime.js';
import { setPlexDeviceInfo, logPlexClientIdentityOnce } from '../plex/clientIdentity.js';

function getDeviceInfo(callback) {
  if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
    webOS.deviceInfo(function (info) {
      callback({
        version: info.version,
        versionMajor: info.versionMajor,
        model: info.modelName || 'LG TV',
        screenWidth: info.screenWidth,
        screenHeight: info.screenHeight,
        uhd: info.uhd,
        hdr10: info.hdr10,
        dolbyVision: info.dolbyVision
      });
    });
    return;
  }
  callback({ version: 'browser', model: 'Browser', screenWidth: window.innerWidth, screenHeight: window.innerHeight });
}

function initPlatform() {
  applyGraphicsViewport();
  window.addEventListener('resize', applyGraphicsViewport);

  if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
    webOS.deviceInfo(function (device) {
      setPlexDeviceInfo(device);
      logPlexClientIdentityOnce();
    });
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

  if (typeof webOS !== 'undefined' && webOS.platformBack) {
    try {
      webOS.platformBack.onBackKey = function () {
        document.dispatchEvent(new CustomEvent('webos-back'));
      };
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('webos-back', function () {
    var backEv = new KeyboardEvent('keydown', { keyCode: 461 });
    document.dispatchEvent(backEv);
  });

  initMotionCursor();
}

function probeCodec(mime) {
  var v = document.createElement('video');
  if (!v.canPlayType) return '';
  return v.canPlayType(mime) || '';
}

function parseWebOsMajor(deviceInfo) {
  if (!deviceInfo) return 0;
  if (deviceInfo.versionMajor != null) {
    var n = parseInt(deviceInfo.versionMajor, 10);
    if (!isNaN(n)) return n;
  }
  if (deviceInfo.version) {
    var parts = String(deviceInfo.version).split('.');
    var major = parseInt(parts[0], 10);
    if (!isNaN(major)) return major;
  }
  return 0;
}

/**
 * Device-only heuristic (no runtime / window). Used on real LG TVs when canPlayType omits DTS.
 */
function tvLikelySupportsDtsFromDevice(deviceInfo) {
  var major = parseWebOsMajor(deviceInfo);
  if (major >= 4) return true;
  var model = String((deviceInfo && (deviceInfo.modelName || deviceInfo.model)) || '');
  if (/OLED\d{2}[BCEW]8/i.test(model)) return true;
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

function getCodecCapabilities(deviceInfo) {
  var caps = {
    h264: probeCodec('video/mp4; codecs="avc1.640028"'),
    hevc: probeCodec('video/mp4; codecs="hvc1.1.6.L153.B0"'),
    ac3: probeCodec('audio/mp4; codecs="ac-3"'),
    eac3: probeCodec('audio/mp4; codecs="ec-3"'),
    dts: probeCodec('audio/vnd.dts')
  };
  if ((!caps.dts || caps.dts === '') && tvLikelySupportsDts(deviceInfo)) {
    caps.dts = 'probably';
    caps.dtsInferred = true;
  }
  if ((!caps.eac3 || caps.eac3 === '') && tvLikelySupportsDts(deviceInfo)) {
    caps.eac3 = 'probably';
    caps.eac3Inferred = true;
  }
  if ((!caps.ac3 || caps.ac3 === '') && tvLikelySupportsDts(deviceInfo)) {
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
  probeCodec,
  getCodecCapabilities,
  keepScreenOn,
  onAppBackground,
  isSimulatorRuntime,
  tvLikelySupportsDts,
  tvLikelySupportsDtsFromDevice,
  parseWebOsMajor
};
