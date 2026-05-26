/**
 * Connection ranking: HTTPS always wins over HTTP. Plex publishes a signed
 * *.plex.direct cert for every PMS (LAN and remote), so the HTTPS candidate
 * is normally reachable. HTTP stays in the candidate list as a fallback
 * (heavily penalized when "Allow insecure HTTP" is off, neutral when it
 * is on) so a network where plex.direct DNS or TLS fails can still probe
 * through to HTTP. Within the same scheme tier the order preference is
 * local -> remote direct -> relay.
 */

function isHttpsUri(uri) {
  return uri && uri.indexOf('https://') === 0;
}

function isHttpUri(uri) {
  return uri && uri.indexOf('http://') === 0;
}

function scoreConnection(c, prefs) {
  prefs = prefs || {};
  var allowInsecure = prefs.allowInsecure === true;
  var preferSecure = prefs.preferSecure !== false;
  var order = prefs.connectionOrder || ['local', 'remote', 'relay'];
  var score = 0;
  var isHttps = isHttpsUri(c.uri);
  var isHttp = isHttpUri(c.uri);
  if (isHttps && preferSecure) score += 500;
  if (isHttp && !allowInsecure) score -= 1000;
  if (c.local) score += 100;
  if (c.relay) score -= 50;
  order.forEach(function (type, i) {
    if (type === 'local' && c.local) score += (order.length - i) * 10;
    if (type === 'remote' && !c.local && !c.relay) score += (order.length - i) * 10;
    if (type === 'relay' && c.relay) score += (order.length - i) * 5;
  });
  return score;
}

function rankSkipReasonForHttps(prefs, topConn) {
  prefs = prefs || {};
  if (prefs.preferSecure === false) return 'preferSecure disabled';
  if (topConn && isHttpUri(topConn.uri)) {
    return 'outranked by higher-scoring HTTP candidate';
  }
  return 'outranked by higher-scoring candidate';
}

/**
 * HTTPS URIs that exist but are not first after rankConnections (scored out).
 * Probe order uses this list; callers log each entry before probing.
 */
function httpsRankingRejections(connections, prefs) {
  var ranked = rankConnections(connections, prefs);
  if (!ranked.length) return [];
  if (isHttpsUri(ranked[0].uri)) return [];
  var top = ranked[0];
  var reason = rankSkipReasonForHttps(prefs, top);
  return (connections || []).filter(function (c) {
    return isHttpsUri(c.uri);
  }).map(function (c) {
    return { conn: c, reason: reason };
  });
}

function rankConnections(connections, prefs) {
  var scored = (connections || []).map(function (c) {
    return { conn: c, score: scoreConnection(c, prefs) };
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.map(function (s) { return s.conn; });
}

function pickBestConnection(connections, prefs) {
  var ranked = rankConnections(connections, prefs);
  return ranked[0] || null;
}

/** 'HTTPS' | 'HTTP' | 'unknown' for console logging. */
function connectionSchemeLabel(uri) {
  if (isHttpsUri(uri)) return 'HTTPS';
  if (isHttpUri(uri)) return 'HTTP';
  return 'unknown';
}

export {
  rankConnections,
  pickBestConnection,
  scoreConnection,
  httpsRankingRejections,
  isHttpsUri,
  isHttpUri,
  rankSkipReasonForHttps,
  connectionSchemeLabel
};
