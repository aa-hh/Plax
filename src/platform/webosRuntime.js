/**
 * webOS runtime detection (no platform init / motion cursor deps).
 */

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

function isSimulatorRuntime() {
  if (getWebOSVersion() === 'simulator') return true;
  if (getWebOSVersion() !== 'tv') return false;
  try {
    var id = window.PalmSystem && window.PalmSystem.identifier;
    if (id && /simulator|emulator/i.test(String(id))) return true;
  } catch (e) { /* ignore */ }
  return false;
}

export { getWebOSVersion, isSimulatorRuntime };
