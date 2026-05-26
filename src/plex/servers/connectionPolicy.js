/**
 * Connection ranking: local secure -> local insecure -> remote direct -> relay.
 */

function rankConnections(connections, prefs) {
  prefs = prefs || {};
  var allowInsecure = prefs.allowInsecure !== false;
  var order = prefs.connectionOrder || ['local', 'remote', 'relay'];
  var scored = (connections || []).map(function (c) {
    var score = 0;
    var isHttps = c.uri.indexOf('https://') === 0;
    var isHttp = c.uri.indexOf('http://') === 0;
    if (!allowInsecure && isHttp) score -= 1000;
    if (c.local) score += 100;
    if (c.relay) score -= 50;
    if (isHttps && prefs.preferSecure !== false) score += 20;
    if (isHttp && allowInsecure) score += 30;
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
