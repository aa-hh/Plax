import { getState } from '../core/store.js';
import { isTvRuntime } from '../platform/versionGate.js';
import { isSimulatorRuntime } from '../platform/webosRuntime.js';

/** Product string for plex.tv pairing / account device list. */
var AUTH_PRODUCT = 'XPlay Lite';
var VERSION = '0.1.0';

/**
 * Identity PMS client profiles recognize for TranscodeUniversalRequest.
 * Official Plex for LG uses product "Plex for LG", platform "webOS", plus model/version.
 */
var PMS_PRODUCT = 'Plex for LG';
var PMS_PLATFORM = 'webOS';

var deviceSnapshot = null;
var identityLogged = false;

function setPlexDeviceInfo(device) {
  deviceSnapshot = device || null;
}

function resetPlexDeviceInfoForTest() {
  deviceSnapshot = null;
  identityLogged = false;
}

function resetPlexIdentityLogForTest() {
  identityLogged = false;
}

function firstNonEmpty() {
  var i;
  for (i = 0; i < arguments.length; i++) {
    if (arguments[i] != null && String(arguments[i]).trim() !== '') {
      return String(arguments[i]).trim();
    }
  }
  return '';
}

function semverMajor(raw) {
  if (raw == null || raw === '') return 0;
  var parts = String(raw).split('.');
  var n = parseInt(parts[0], 10);
  return isNaN(n) ? 0 : n;
}

function looksLikeWebOsSemver(raw) {
  return semverMajor(raw) >= 4;
}

function platformVersionFromDevice(device) {
  var candidates = [
    device && device.version,
    device && device.sdkVersion,
    device && device.firmwareVersion,
    device && device.platformVersion
  ];
  var i;
  for (i = 0; i < candidates.length; i++) {
    if (candidates[i] && looksLikeWebOsSemver(candidates[i])) {
      return String(candidates[i]).split('+')[0].trim();
    }
  }
  if (device && device.versionMajor != null) {
    var major = parseInt(device.versionMajor, 10);
    if (!isNaN(major) && major >= 4) return String(major) + '.0';
  }
  return '4.0';
}

function modelFromDevice(device) {
  return firstNonEmpty(device && device.modelName, device && device.model) || 'webOSTV';
}

function deviceNameFromDevice(device, model) {
  var custom = firstNonEmpty(device && device.deviceName);
  if (custom) return custom;
  if (model && model !== 'webOSTV') return 'LG ' + model;
  return 'LG webOS TV';
}

function browserChromeVersion() {
  try {
    var match = navigator.userAgent.match(/Chrome\/([\d.]+)/);
    if (match) return match[1];
  } catch (e) { /* ignore */ }
  return '120.0';
}

function plexWebIdentity() {
  return {
    product: 'Plex Web',
    platform: 'Chrome',
    platformVersion: browserChromeVersion(),
    device: 'Computer',
    model: 'Browser',
    deviceName: 'XPlay Lite (' + AUTH_PRODUCT + ')',
    deviceVendor: ''
  };
}

function isSimulatorPlexIdentity(device) {
  if (!isTvRuntime()) return false;
  if (isSimulatorRuntime()) return true;
  var model = firstNonEmpty(device && device.modelName, device && device.model);
  return /simulator|emulator/i.test(model);
}

function getPlexClientIdentity() {
  if (!isTvRuntime()) {
    return plexWebIdentity();
  }

  var device = deviceSnapshot;
  if (isSimulatorPlexIdentity(device)) {
    return plexWebIdentity();
  }

  var model = modelFromDevice(device);
  return {
    product: PMS_PRODUCT,
    platform: PMS_PLATFORM,
    platformVersion: platformVersionFromDevice(device),
    device: 'TV',
    model: model,
    deviceName: deviceNameFromDevice(device, model),
    deviceVendor: 'LG'
  };
}

function logPlexClientIdentityOnce() {
  if (identityLogged) return;
  identityLogged = true;
  var identity = getPlexClientIdentity();
  try {
    if (isSimulatorPlexIdentity(deviceSnapshot)) {
      console.info('[plex] client identity: simulator → Plex Web');
    } else if (isTvRuntime()) {
      console.info('[plex] client identity: TV → Plex for LG (model=' + identity.model + ')');
    } else {
      console.info('[plex] client identity: browser → Plex Web');
    }
  } catch (e) { /* ignore */ }
}

function getClientId() {
  var id = getState().clientId;
  return id || 'xplay-anonymous';
}

function plexClientFields() {
  var identity = getPlexClientIdentity();
  var fields = {
    'X-Plex-Client-Identifier': getClientId(),
    'X-Plex-Product': identity.product,
    'X-Plex-Version': VERSION,
    'X-Plex-Platform': identity.platform,
    'X-Plex-Platform-Version': identity.platformVersion,
    'X-Plex-Device': identity.device,
    'X-Plex-Model': identity.model,
    'X-Plex-Device-Name': identity.deviceName
  };
  if (identity.deviceVendor) {
    fields['X-Plex-Device-Vendor'] = identity.deviceVendor;
  }
  return fields;
}

function applyPlexClientFields(target, extra) {
  target = target || {};
  extra = extra || {};
  var out = Object.assign({}, target, plexClientFields());
  var k;
  for (k in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
  }
  return out;
}

export {
  AUTH_PRODUCT,
  VERSION,
  PMS_PRODUCT,
  PMS_PLATFORM,
  setPlexDeviceInfo,
  resetPlexDeviceInfoForTest,
  resetPlexIdentityLogForTest,
  isSimulatorPlexIdentity,
  getPlexClientIdentity,
  logPlexClientIdentityOnce,
  plexClientFields,
  applyPlexClientFields
};
