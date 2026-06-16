/**
 * Minimal pub/sub state container (no framework).
 */
var listeners = {};
var state = {
  authToken: null,
  ownerAuthToken: null,
  clientId: null,
  user: null,
  homeUsers: [],
  activeHomeUser: null,
  servers: [],
  activeServer: null,
  libraries: [],
  activeLibrary: null,
  networkPrefs: {
    // Resolved at boot via resolveNetworkPrefs (webOS 4 defaults ON).
    allowInsecure: false,
    preferDirect: true,
    connectionOrder: ['local', 'remote', 'relay']
  },
  playbackPrefs: {
    quality: 'auto',
    maxBitrate: 20000,
    directPlay: true,
    directStream: true,
    subtitleOffsetMs: 0,
    subtitleSize: 'm',
    subtitleBackground: true
  },
  settings: {},
  networkProbe: null
};

function getState() {
  return state;
}

function setState(partial) {
  var key;
  for (key in partial) {
    if (Object.prototype.hasOwnProperty.call(partial, key)) {
      state[key] = partial[key];
    }
  }
  notify('change', state);
}

function subscribe(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return function unsubscribe() {
    listeners[event] = listeners[event].filter(function (l) { return l !== fn; });
  };
}

function notify(event, data) {
  (listeners[event] || []).forEach(function (fn) {
    try { fn(data); } catch (e) { console.error(e); }
  });
}

export { getState, setState, subscribe };
