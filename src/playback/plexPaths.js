/**
 * Server-relative Plex paths for transcode `path=` and direct file GET.
 * Part keys from PMS sometimes include query params (checkFiles, offset, session id);
 * those belong on the universal transcode URL, not inside `path=`.
 */
function normalizePlexPath(path) {
  if (!path) return null;
  var s = String(path).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch (e) {
      s = s.replace(/^https?:\/\/[^/?#]+/i, '') || s;
    }
  }
  var q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  var h = s.indexOf('#');
  if (h >= 0) s = s.slice(0, h);
  if (!s) return null;
  return s.indexOf('/') === 0 ? s : '/' + s;
}

export { normalizePlexPath };
