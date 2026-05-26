/**
 * LG webOS Magic Remote motion sensor → app pointer mode.
 * https://webostv.developer.lge.com/develop/guides/motion-sensor-sensor-data
 * Luna: luna://com.webos.service.mrcu — sensor2/getSensorEventData
 */

import { getWebOSVersion, isSimulatorRuntime } from './webosRuntime.js';
import {
  createMotionCursorTracker,
  SHOW_AFTER_MS,
  HIDE_AFTER_MS,
  MOTION_GAP_MS
} from './motionCursorState.js';

var MRCU_URI = 'luna://com.webos.service.mrcu';
var SENSOR_METHOD = 'sensor2/getSensorEventData';
var TICK_MS = 200;
var GYRO_THRESHOLD_RAD_S = 0.12;
var LINEAR_ACCEL_THRESHOLD = 0.75;

export var MOTION_CURSOR_SHOW_EVENT = 'xplay-motion-cursor-show';
export var MOTION_CURSOR_HIDE_EVENT = 'xplay-motion-cursor-hide';

var BODY_CLASS = 'cursor-visible';
var initialized = false;
var cursorVisible = false;
var subscriptionHandle = null;
var tickTimer = null;
var tracker = null;
var nowFn = function () { return Date.now(); };

function setCursorVisible(visible) {
  if (cursorVisible === visible) return;
  cursorVisible = visible;
  document.body.classList.toggle(BODY_CLASS, visible);
  document.dispatchEvent(new CustomEvent(
    visible ? MOTION_CURSOR_SHOW_EVENT : MOTION_CURSOR_HIDE_EVENT
  ));
}

function isMotionCursorVisible() {
  return cursorVisible;
}

function vectorMag3(o) {
  if (!o) return 0;
  var x = Number(o.x) || 0;
  var y = Number(o.y) || 0;
  var z = Number(o.z) || 0;
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Ignore idle sensor noise; require meaningful gyro or linear acceleration.
 * @param {object} data MRCU sensor2 payload
 */
export function isSignificantSensorMotion(data) {
  if (!data) return false;
  if (data.gyroscope && vectorMag3(data.gyroscope) >= GYRO_THRESHOLD_RAD_S) return true;
  if (data.linearAcceleration && vectorMag3(data.linearAcceleration) >= LINEAR_ACCEL_THRESHOLD) {
    return true;
  }
  return false;
}

function canUseMrcuService() {
  return typeof webOS !== 'undefined' &&
    webOS.service &&
    typeof webOS.service.request === 'function';
}

function subscribeMotionSensor(onSample) {
  if (!canUseMrcuService()) return null;
  try {
    return webOS.service.request(MRCU_URI, {
      method: SENSOR_METHOD,
      parameters: {
        subscribe: true,
        sensorType: 'gyroscopelinearAcceleration'
      },
      onSuccess: function (response) {
        if (!response || response.returnValue === false) return;
        if (response.subscribed === false) return;
        if (isSignificantSensorMotion(response)) onSample();
      },
      onFailure: function () { /* TV without MRCU or already subscribed */ }
    });
  } catch (e) {
    return null;
  }
}

/**
 * Simulator / desktop: optional dev hook via mouse move (same debounce).
 */
function attachDevPointerMotion(onSample) {
  if (getWebOSVersion() === 'tv' && !isSimulatorRuntime()) return function () {};
  var lastDevAt = 0;
  function onMove() {
    var t = nowFn();
    if (t - lastDevAt < 50) return;
    lastDevAt = t;
    onSample();
  }
  document.addEventListener('mousemove', onMove);
  return function detach() {
    document.removeEventListener('mousemove', onMove);
  };
}

function startTick() {
  if (tickTimer != null) return;
  tickTimer = setInterval(function () {
    tracker.tick(nowFn());
  }, TICK_MS);
}

function stopTick() {
  if (tickTimer == null) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

/**
 * Global motion cursor (all screens). Idempotent.
 * @param {object} [options] Test hooks: now, showAfterMs, hideAfterMs, motionGapMs
 * @returns {function(): void} detach
 */
export function initMotionCursor(options) {
  if (initialized) return function () {};
  initialized = true;
  options = options || {};
  if (typeof options.now === 'function') nowFn = options.now;

  tracker = createMotionCursorTracker({
    showAfterMs: options.showAfterMs,
    hideAfterMs: options.hideAfterMs,
    motionGapMs: options.motionGapMs,
    onShow: function () { setCursorVisible(true); },
    onHide: function () { setCursorVisible(false); }
  });

  function onMotionSample() {
    tracker.onMotion(nowFn());
  }

  subscriptionHandle = subscribeMotionSensor(onMotionSample);
  var detachDev = attachDevPointerMotion(onMotionSample);
  startTick();

  return function detachMotionCursor() {
    if (!initialized) return;
    initialized = false;
    stopTick();
    detachDev();
    if (subscriptionHandle && typeof subscriptionHandle.cancel === 'function') {
      try { subscriptionHandle.cancel(); } catch (e) { /* ignore */ }
    }
    subscriptionHandle = null;
    if (tracker) tracker.reset();
    tracker = null;
    setCursorVisible(false);
    nowFn = function () { return Date.now(); };
  };
}

export {
  isMotionCursorVisible,
  SHOW_AFTER_MS,
  HIDE_AFTER_MS,
  MOTION_GAP_MS
};
