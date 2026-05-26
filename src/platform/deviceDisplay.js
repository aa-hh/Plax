/**
 * App / video display metrics per LG App Resolution specification.
 * https://webostv.developer.lge.com/develop/specifications/app-resolution
 */

var cached = null;

function readGraphicsSize() {
  return {
    width: window.innerWidth || 1920,
    height: window.innerHeight || 1080
  };
}

function loadDeviceDisplay(callback) {
  if (cached) {
    callback(cached);
    return;
  }
  var graphics = readGraphicsSize();
  var info = {
    graphicsWidth: graphics.width,
    graphicsHeight: graphics.height,
    videoWidth: graphics.width,
    videoHeight: graphics.height,
    uhd: false,
    hdr10: false,
    dolbyVision: false
  };

  if (typeof webOS !== 'undefined' && webOS.deviceInfo) {
    webOS.deviceInfo(function (device) {
      if (device.screenWidth) info.videoWidth = device.screenWidth;
      if (device.screenHeight) info.videoHeight = device.screenHeight;
      info.uhd = !!device.uhd;
      info.hdr10 = !!device.hdr10;
      info.dolbyVision = !!device.dolbyVision;
      info.modelName = device.modelName;
      info.version = device.version;
      info.versionMajor = device.versionMajor;
      cached = info;
      callback(info);
    });
    return;
  }

  cached = info;
  callback(info);
}

function applyGraphicsViewport() {
  var g = readGraphicsSize();
  document.documentElement.style.setProperty('--app-width', g.width + 'px');
  document.documentElement.style.setProperty('--app-height', g.height + 'px');
}

export { readGraphicsSize, loadDeviceDisplay, applyGraphicsViewport };
