/**
 * Playback quality profiles.
 *
 * Modes:
 * - auto: progressive direct play when possible, then HLS direct stream (remux), then transcode.
 * - original / directOnly (legacy id): Plex part URL only — no remux or transcode fallback.
 * - 4k / 1080 / 720 / 480: server transcode caps (HLS or HTTP).
 */

/** Transcode ladder high → low (rebuffer / probe downshift). */
var TRANSCODE_QUALITY_ORDER = ['4k', '1080', '720', '480'];

var PROFILES = {
  auto: {
    label: 'Auto (direct → remux → transcode)',
    maxVideoBitrate: 20000,
    videoResolution: null
  },
  original: {
    label: 'Original file only (no fallback)',
    maxVideoBitrate: 0,
    videoResolution: null,
    forceDirect: true,
    directPlayOnly: true
  },
  directOnly: {
    label: 'Original file only (no fallback)',
    maxVideoBitrate: 0,
    videoResolution: null,
    forceDirect: true,
    directPlayOnly: true
  },
  '4k': {
    label: '4K (transcode)',
    maxVideoBitrate: 40000,
    videoResolution: '3840x2160',
    requireTranscode: true
  },
  '1080': {
    label: '1080p (transcode)',
    maxVideoBitrate: 12000,
    videoResolution: '1920x1080',
    requireTranscode: true
  },
  '720': {
    label: '720p (transcode)',
    maxVideoBitrate: 4000,
    videoResolution: '1280x720',
    requireTranscode: true
  },
  '480': {
    label: '480p (transcode)',
    maxVideoBitrate: 2000,
    videoResolution: '854x480',
    requireTranscode: true
  }
};

function normalizeQualityKey(key) {
  if (key === 'directOnly') return 'original';
  return key;
}

function getProfile(key) {
  return PROFILES[normalizeQualityKey(key)] || PROFILES.auto;
}

function listProfiles() {
  return Object.keys(PROFILES)
    .filter(function (k) { return k !== 'directOnly'; })
    .map(function (k) {
      return { id: k, label: PROFILES[k].label };
    });
}

function isDirectPlayOnlyQuality(key) {
  var profile = getProfile(key);
  return !!(profile && profile.directPlayOnly);
}

function allowsPlaybackFallback(key) {
  return !isDirectPlayOnlyQuality(key);
}

function requiresServerTranscode(key) {
  var profile = getProfile(key);
  return !!(profile && profile.requireTranscode);
}

function nextLowerTranscodeProfileKey(key) {
  var normalized = normalizeQualityKey(key);
  var idx = TRANSCODE_QUALITY_ORDER.indexOf(normalized);
  if (idx < 0 || idx >= TRANSCODE_QUALITY_ORDER.length - 1) return null;
  return TRANSCODE_QUALITY_ORDER[idx + 1];
}

function applyProfileToParams(params, profileKey, prefs) {
  var profile = getProfile(profileKey);
  prefs = prefs || {};
  if (profile.maxVideoBitrate) {
    params['maxVideoBitrate'] = profile.maxVideoBitrate;
  }
  if (profile.videoResolution) {
    params['videoResolution'] = profile.videoResolution;
  }
  return params;
}

export {
  PROFILES,
  TRANSCODE_QUALITY_ORDER,
  getProfile,
  normalizeQualityKey,
  listProfiles,
  applyProfileToParams,
  isDirectPlayOnlyQuality,
  allowsPlaybackFallback,
  requiresServerTranscode,
  nextLowerTranscodeProfileKey
};
