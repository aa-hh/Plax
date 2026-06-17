/**
 * User-visible playback failure messages (TV has no reliable DevTools).
 */

function errMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

function errStatus(err) {
  if (!err || err.status == null) return null;
  return err.status;
}

function stripHtmlErrorBody(body) {
  if (!body) return '';
  var text = String(body).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/<html|<!DOCTYPE|<body/i.test(text)) return '';
  return text;
}

function errBodySnippet(err, maxLen) {
  maxLen = maxLen || 120;
  if (!err || !err.body) return '';
  var body = stripHtmlErrorBody(err.body);
  if (!body) return '';
  if (body.length > maxLen) body = body.slice(0, maxLen) + '…';
  return body;
}

/**
 * @param {Error|string|null} err
 * @param {{ phase?: string, fallback?: string }} context
 */
function formatPlaybackFailure(err, context) {
  context = context || {};
  var phase = context.phase ? context.phase + ': ' : '';
  var msg = errMessage(err);
  var status = errStatus(err);
  var body = errBodySnippet(err);

  if (/cannot read propert(y|ies) .*replace/i.test(msg)) {
    return phase + 'Plex server connection missing. Open Settings and retest network, then try again.';
  }
  if (/no plex server|connection url|connection uri/i.test(msg)) {
    return phase + msg;
  }
  if (status === 401) {
    return phase + 'Plex sign-in expired (HTTP 401). Sign out and pair again.';
  }
  if (status === 403) {
    return phase + 'Plex denied playback (HTTP 403). Check library access for this profile.';
  }
  if (status === 404) {
    return phase + 'Media not found on Plex (HTTP 404).';
  }
  if (status === 400) {
    return phase + 'Plex rejected the playback request (HTTP 400). Try Original or 720p quality, or check remote access on the server.';
  }
  if (status >= 500) {
    return phase + 'Plex server error (HTTP ' + status + '). Check the server or try lower quality.';
  }
  if (status) {
    var line = phase + 'Playback failed (HTTP ' + status + ')';
    if (body) line += ' — ' + body;
    return line;
  }
  if (/request timeout/i.test(msg)) {
    return phase + 'Plex request timed out. Check network or try a transcode quality.';
  }
  if (/failed to fetch|network error|load failed/i.test(msg)) {
    return phase + 'Network error reaching Plex. Check connection or HTTPS certificate.';
  }
  if (/not supported|codec|decode|MEDIA_ERR/i.test(msg)) {
    return phase + msg + ' Try Original or 720p in Settings.';
  }
  if (context.fallback) {
    return phase + msg + ' ' + context.fallback;
  }
  if (phase && msg.indexOf(phase) !== 0) {
    return phase + msg;
  }
  return msg || 'Playback failed. Try Original quality or check your Plex server.';
}

export {
  formatPlaybackFailure,
  errMessage,
  errStatus,
  errBodySnippet,
  stripHtmlErrorBody
};
