/**
 * sdkVersion is the authoritative webOS version string, fetched via the luna
 * TV system-property service — the one field proven reliable across firmwares
 * (unlike deviceInfo().version/versionMajor, which on some real hardware, e.g.
 * a 2018 LG B8, mirrors LG's internal firmware build number instead of the
 * actual webOS platform major — see app.js strictWebosMajor).
 *
 * Deliberately dependency-free (no imports) so both webos.js and
 * versionGate.js can import it without creating a circular module graph.
 */

function parseWebOSVersionMajor(versionString) {
  if (!versionString) return 0;
  var major = parseInt(String(versionString), 10);
  return !isNaN(major) && major > 0 ? major : 0;
}

/**
 * Fetch sdkVersion via the luna TV system property service.
 * Calls onSuccess(sdkVersion) or onFailure() if unavailable.
 */
function fetchSdkVersion(onSuccess, onFailure) {
  if (typeof webOS === 'undefined' || !webOS.service || !webOS.service.request) {
    onFailure();
    return;
  }
  webOS.service.request('luna://com.webos.service.tv.systemproperty', {
    method: 'getSystemInfo',
    parameters: { keys: ['sdkVersion'] },
    onSuccess: function (res) { onSuccess(res.sdkVersion || ''); },
    onFailure: function () { onFailure(); }
  });
}

export { fetchSdkVersion, parseWebOSVersionMajor };
