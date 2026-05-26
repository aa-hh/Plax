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

/* Diagnostic keys we surface in the playback log so we can confirm what PMS
 * actually receives (especially `path=`) without copy-pasting full URLs. */
var TRANSCODE_DIAGNOSTIC_KEYS = [
  'path',
  'protocol',
  'session',
  'location',
  'directPlay',
  'directStream',
  'subtitleStreamID',
  'subtitles',
  'skipSubtitles',
  'offset',
  'maxVideoBitrate',
  'mediaIndex',
  'partIndex'
];

/**
 * Extract the transcode-affecting query params from a playback URL so the
 * decoded `path=` value is visible in the console next to the rest of the
 * decision inputs. Returns null when the URL cannot be parsed (e.g. tests).
 */
function summarizeTranscodeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  var qIdx = url.indexOf('?');
  if (qIdx < 0) return {};
  var query = url.slice(qIdx + 1);
  var pairs = query.split('&');
  var out = {};
  var wanted = {};
  var i;
  for (i = 0; i < TRANSCODE_DIAGNOSTIC_KEYS.length; i++) {
    wanted[TRANSCODE_DIAGNOSTIC_KEYS[i]] = true;
  }
  for (i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    if (eq < 0) continue;
    var rawKey = pairs[i].slice(0, eq);
    if (!wanted[rawKey]) continue;
    var rawVal = pairs[i].slice(eq + 1);
    try {
      out[rawKey] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch (e) {
      out[rawKey] = rawVal;
    }
  }
  return out;
}

export { normalizePlexPath, summarizeTranscodeUrl };
