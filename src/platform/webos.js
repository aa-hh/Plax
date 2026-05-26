/**
 * webOS TV platform integration via webOSTV.js (LG specification).
 * https://webostv.developer.lge.com/develop/references/webostvjs-introduction
 */

import { loadDeviceDisplay, applyGraphicsViewport } from './deviceDisplay.js';

function getWebOSVersion() {
  if (typeof webOS !== 'undefined' && webOS.platform && webOS.platform.tv) {
    try {
      if (webOS.deviceInfo && typeof webOS.deviceInfo === 'function') {
        return 'tv';
      }
    } catch (e) { /* ignore */ }
  }
  if (window.PalmSystem && window.PalmSystem.identifier) {
    return 'simulator';
  }
  return 'browser';
}

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
}

function probeCodec(mime) {
  var v = document.createElement('video');
  if (!v.canPlayType) return '';
  return v.canPlayType(mime) || '';
}

function getCodecCapabilities() {
  return {
    h264: probeCodec('video/mp4; codecs="avc1.640028"'),
    hevc: probeCodec('video/mp4; codecs="hvc1.1.6.L153.B0"'),
    ac3: probeCodec('audio/mp4; codecs="ac-3"'),
    eac3: probeCodec('audio/mp4; codecs="ec-3"'),
    dts: probeCodec('audio/vnd.dts')
  };
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

export { getWebOSVersion, getDeviceInfo, initPlatform, probeCodec, getCodecCapabilities, keepScreenOn };
