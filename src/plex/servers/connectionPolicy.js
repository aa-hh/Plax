/**
 * Connection ranking: HTTPS always wins over HTTP. Plex publishes a signed
 * *.plex.direct cert for every PMS (LAN and remote), so the HTTPS candidate
 * is normally reachable. HTTP stays in the candidate list as a fallback
 * (heavily penalized when "Allow insecure HTTP" is off, neutral when it
 * is on) so a network where plex.direct DNS or TLS fails can still probe
 * through to HTTP. Within the same scheme tier the order preference is
 * local -> remote direct -> relay.
 */

function rankConnections(connections, prefs) {
  prefs = prefs || {};
  var allowInsecure = prefs.allowInsecure === true;
  var preferSecure = prefs.preferSecure !== false;
  var order = prefs.connectionOrder || ['local', 'remote', 'relay'];
  var scored = (connections || []).map(function (c) {
    var score = 0;
    var isHttps = c.uri.indexOf('https://') === 0;
    var isHttp = c.uri.indexOf('http://') === 0;
    if (isHttps && preferSecure) score += 500;
    if (isHttp) {
      if (!allowInsecure) score -= 1000;
    }
    if (c.local) score += 100;
    if (c.relay) score -= 50;
    order.forEach(function (type, i) {
      if (type === 'local' && c.local) score += (order.length - i) * 10;
      if (type === 'remote' && !c.local && !c.relay) score += (order.length - i) * 10;
      if (type === 'relay' && c.relay) score += (order.length - i) * 5;
    });
    return { conn: c, score: score };
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.map(function (s) { return s.conn; });
}

function pickBestConnection(connections, prefs) {
  var ranked = rankConnections(connections, prefs);
  return ranked[0] || null;
}

export { rankConnections, pickBestConnection };
