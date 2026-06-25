/* Global error capture — runs before the app bundle loads.
   Externalized from index.html so a strict Content-Security-Policy
   (script-src 'self', no 'unsafe-inline') can be enforced.
   Uses XMLHttpRequest (not fetch) so it works on Chromium 53 before
   polyfills are available. Reads sink URL from localStorage directly. */
(function () {
  var LOG_SINK_KEY = 'plax_log_sink_url';

  function getSinkUrl() {
    try {
      var u = localStorage.getItem(LOG_SINK_KEY);
      if (u && String(u).trim()) return String(u).trim();
    } catch (e) { /* ignore */ }
    return null;
  }

  function postError(payload) {
    try {
      var url = getSinkUrl();
      if (!url) return;
      var body;
      try { body = JSON.stringify(payload); } catch (e) { return; }
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(body);
      } catch (e) { /* ignore */ }
    } catch (e) { /* handler must never throw */ }
  }

  window.addEventListener('error', function (evt) {
    try {
      var msg = evt && evt.message ? String(evt.message) : 'Unknown error';
      var detail = evt ? (evt.filename || '') + (evt.lineno != null ? ':' + evt.lineno : '') : '';
      postError({
        level: 'error',
        tag: 'global',
        message: msg,
        ts: new Date().toISOString(),
        detail: detail || undefined
      });
    } catch (e) { /* ignore */ }
  });

  window.addEventListener('unhandledrejection', function (evt) {
    try {
      var reason = evt && evt.reason != null ? evt.reason : 'Unhandled promise rejection';
      var msg = (reason && reason.message) ? String(reason.message) : String(reason);
      postError({
        level: 'error',
        tag: 'promise',
        message: msg,
        ts: new Date().toISOString()
      });
    } catch (e) { /* ignore */ }
  });
}());
