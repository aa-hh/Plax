/**
 * Network preference defaults and resolution.
 *
 * Plex personal servers on webOS TV 4.x (e.g. LG B8) often fail over HTTPS;
 * webOS 5+ handles signed *.plex.direct TLS reliably. Default Allow insecure
 * ON for webOS 4 and below unless the user saved an explicit choice.
 */

import { parseWebOsMajor } from '../platform/webos.js';

/** Secure PMS connections are reliable on webOS TV 5+; default insecure below that. */
var INSECURE_DEFAULT_MAX_MAJOR = 4;

var BASE_NETWORK_PREFS = {
  allowInsecure: false,
  preferDirect: true,
  connectionOrder: ['local', 'remote', 'relay']
};

function defaultAllowInsecure(webOsMajor) {
  if (webOsMajor == null || webOsMajor <= 0) return false;
  return webOsMajor <= INSECURE_DEFAULT_MAX_MAJOR;
}

function hasExplicitAllowInsecure(persisted) {
  return !!(persisted && typeof persisted.allowInsecure === 'boolean');
}

/**
 * Merge persisted prefs with platform defaults. Explicit allowInsecure in
 * localStorage wins; otherwise webOS major drives the default.
 */
function resolveNetworkPrefs(persisted, webOsMajor) {
  var merged = Object.assign({}, BASE_NETWORK_PREFS, persisted || {});
  if (!hasExplicitAllowInsecure(persisted)) {
    merged.allowInsecure = defaultAllowInsecure(webOsMajor);
  }
  return merged;
}

function resolveNetworkPrefsFromDevice(persisted, deviceInfo) {
  return resolveNetworkPrefs(persisted, parseWebOsMajor(deviceInfo));
}

function isAllowInsecureEnabled(prefs) {
  return !!(prefs && prefs.allowInsecure === true);
}

export {
  INSECURE_DEFAULT_MAX_MAJOR,
  BASE_NETWORK_PREFS,
  defaultAllowInsecure,
  resolveNetworkPrefs,
  resolveNetworkPrefsFromDevice,
  isAllowInsecureEnabled,
  hasExplicitAllowInsecure
};
