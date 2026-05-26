/**
 * Plex intro markers from GET /library/metadata/{id} (Marker children on metadata / Media / Part).
 * Times are milliseconds on the media timeline (maps to video.currentTime * 1000).
 * Server-side detection only — do not PUT /library/metadata/{id}/intro.
 */

/** Auto-skip this many ms after intro start; 0 = manual skip only (OK / dedicated key). */
var INTRO_AUTO_SKIP_DELAY_MS = 0;

/** Seek target lands this many ms before marker end (aligned with official Plex clients). */
var INTRO_SKIP_END_PAD_MS = 2000;

function parseMarker(node) {
  if (!node || node._tag !== 'Marker') return null;
  var startMs = parseInt(node.startTimeOffset, 10);
  var endMs = parseInt(node.endTimeOffset, 10);
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;
  return {
    id: parseInt(node.id, 10) || 0,
    type: node.type || '',
    startMs: startMs,
    endMs: endMs,
    final: node.final === '1' || node.final === true
  };
}

function parseMarkersFromChildren(children) {
  return (children || []).reduce(function (acc, child) {
    var m = parseMarker(child);
    if (m) acc.push(m);
    return acc;
  }, []);
}

function appendMarkersFromMediaNodes(out, mediaList) {
  (mediaList || []).forEach(function (media) {
    if (media._tag !== 'Media') return;
    out = out.concat(parseMarkersFromChildren(media._children));
    (media._children || []).forEach(function (part) {
      if (part._tag === 'Part') {
        out = out.concat(parseMarkersFromChildren(part._children));
      }
    });
  });
  return out;
}

/**
 * Collect Marker elements from metadata XML tree (top-level, Media, Part).
 */
function collectMarkersForItem(item) {
  if (!item) return [];
  var markers = parseMarkersFromChildren(item._children);
  var children = item._children || [];
  markers = appendMarkersFromMediaNodes(markers, children.filter(function (c) {
    return c._tag === 'Media';
  }));
  if (item.media && item.media.length) {
    markers = appendMarkersFromMediaNodes(markers, item.media);
  }
  return markers;
}

function markerKey(marker) {
  if (!marker) return '';
  return marker.id ? String(marker.id) : 'start:' + marker.startMs;
}

function findIntroMarkers(markers) {
  return (markers || [])
    .filter(function (m) { return m.type === 'intro'; })
    .sort(function (a, b) { return a.startMs - b.startMs; });
}

function findCreditMarkers(markers) {
  return (markers || [])
    .filter(function (m) { return m.type === 'credit'; })
    .sort(function (a, b) { return a.startMs - b.startMs; });
}

/** @deprecated use findIntroMarkers — first intro by timeline position */
function findIntroMarker(markers) {
  var intros = findIntroMarkers(markers);
  return intros.length ? intros[0] : null;
}

function findActiveIntroMarker(markers, currentMs) {
  if (currentMs == null) return null;
  var intros = findIntroMarkers(markers);
  for (var i = 0; i < intros.length; i++) {
    if (isInIntroRange(intros[i], currentMs)) return intros[i];
  }
  return null;
}

function findActiveCreditMarker(markers, currentMs) {
  if (currentMs == null) return null;
  var credits = findCreditMarkers(markers);
  for (var i = 0; i < credits.length; i++) {
    if (isInMarkerRange(credits[i], currentMs)) return credits[i];
  }
  return null;
}

function extractIntroMarkers(item) {
  if (!item) return [];
  if (item.introMarkers && item.introMarkers.length) return item.introMarkers;
  var markers = item.markers && item.markers.length
    ? item.markers.slice()
    : collectMarkersForItem(item);
  return findIntroMarkers(markers);
}

function extractCreditMarkers(item) {
  if (!item) return [];
  if (item.creditMarkers && item.creditMarkers.length) return item.creditMarkers;
  var markers = item.markers && item.markers.length
    ? item.markers.slice()
    : collectMarkersForItem(item);
  return findCreditMarkers(markers);
}

function extractIntroMarker(item) {
  if (!item) return null;
  if (item.introMarker) return item.introMarker;
  var intros = extractIntroMarkers(item);
  return intros.length ? intros[0] : null;
}

function isInMarkerRange(marker, currentMs) {
  if (!marker || currentMs == null) return false;
  return currentMs >= marker.startMs && currentMs < marker.endMs;
}

function isInIntroRange(intro, currentMs) {
  return isInMarkerRange(intro, currentMs);
}

function introSkipTargetMs(intro) {
  if (!intro) return 0;
  return Math.max(intro.startMs, intro.endMs - INTRO_SKIP_END_PAD_MS);
}

function creditSkipTargetMs(credit) {
  return introSkipTargetMs(credit);
}

function shouldAutoSkipIntro(intro, currentMs, enteredIntroAtMs) {
  if (!INTRO_AUTO_SKIP_DELAY_MS || !intro || !enteredIntroAtMs) return false;
  if (!isInIntroRange(intro, currentMs)) return false;
  return currentMs - enteredIntroAtMs >= INTRO_AUTO_SKIP_DELAY_MS;
}

function introEndSeconds(intro) {
  return intro ? intro.endMs / 1000 : 0;
}

export {
  INTRO_AUTO_SKIP_DELAY_MS,
  INTRO_SKIP_END_PAD_MS,
  parseMarker,
  parseMarkersFromChildren,
  collectMarkersForItem,
  markerKey,
  findIntroMarkers,
  findCreditMarkers,
  findActiveIntroMarker,
  findActiveCreditMarker,
  extractIntroMarkers,
  extractCreditMarkers,
  isInMarkerRange,
  isInIntroRange,
  introSkipTargetMs,
  creditSkipTargetMs
};
