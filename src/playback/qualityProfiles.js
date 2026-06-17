/**
 * Playback quality profiles.
 *
 * - original: let Plex /decision choose direct play or direct stream — no
 *   transcode cap. Shown in the modal with the source's actual bitrate.
 * - transcode tiers: explicit (bitrate, resolution) targets, mirroring the
 *   ladder Plex Web exposes.
 *
 * Legacy keys ('1080', '720', '480', '4k', 'directOnly', 'auto') remain in
 * the table so existing stored prefs keep working — listProfiles() only
 * returns the new entries.
 */

/** Transcode ladder high → low for rebuffer / probe downshift. Mirrors Plex Web. */
var TRANSCODE_QUALITY_ORDER = [
  '1080p-20', '1080p-12', '1080p-10', '1080p-8',
  '720p-4', '720p-3', '720p-2',
  '480p-1500',
  '320p-720', '240p-320'
];

/** Order shown in the player quality modal (Original prepended at render). */
var MODAL_QUALITY_ORDER = TRANSCODE_QUALITY_ORDER.slice();

var PROFILES = {
  original: {
    label: 'Original',
    maxVideoBitrate: 0,
    videoResolution: null
  },
  '1080p-20':  { label: '20 Mbps 1080p',  maxVideoBitrate: 20000, videoResolution: '1920x1080', requireTranscode: true },
  '1080p-12':  { label: '12 Mbps 1080p',  maxVideoBitrate: 12000, videoResolution: '1920x1080', requireTranscode: true },
  '1080p-10':  { label: '10 Mbps 1080p',  maxVideoBitrate: 10000, videoResolution: '1920x1080', requireTranscode: true },
  '1080p-8':   { label: '8 Mbps 1080p',   maxVideoBitrate: 8000,  videoResolution: '1920x1080', requireTranscode: true },
  '720p-4':    { label: '4 Mbps 720p',    maxVideoBitrate: 4000,  videoResolution: '1280x720',  requireTranscode: true },
  '720p-3':    { label: '3 Mbps 720p',    maxVideoBitrate: 3000,  videoResolution: '1280x720',  requireTranscode: true },
  '720p-2':    { label: '2 Mbps 720p',    maxVideoBitrate: 2000,  videoResolution: '1280x720',  requireTranscode: true },
  '480p-1500': { label: '1.5 Mbps 480p',  maxVideoBitrate: 1500,  videoResolution: '854x480',   requireTranscode: true },
  '320p-720':  { label: '720 Kbps 320p',  maxVideoBitrate: 720,   videoResolution: '576x320',   requireTranscode: true },
  '240p-320':  { label: '320 Kbps 240p',  maxVideoBitrate: 320,   videoResolution: '432x240',   requireTranscode: true },

  // Legacy keys — map to closest new entry so stored prefs keep working.
  auto:       { label: 'Original', maxVideoBitrate: 0, videoResolution: null, _alias: 'original' },
  directOnly: { label: 'Original', maxVideoBitrate: 0, videoResolution: null, _alias: 'original' },
  '4k':       { label: '20 Mbps 1080p', maxVideoBitrate: 20000, videoResolution: '1920x1080', requireTranscode: true, _alias: '1080p-20' },
  '1080':     { label: '12 Mbps 1080p', maxVideoBitrate: 12000, videoResolution: '1920x1080', requireTranscode: true, _alias: '1080p-12' },
  '720':      { label: '4 Mbps 720p', maxVideoBitrate: 4000, videoResolution: '1280x720', requireTranscode: true, _alias: '720p-4' },
  '480':      { label: '1.5 Mbps 480p', maxVideoBitrate: 1500, videoResolution: '854x480', requireTranscode: true, _alias: '480p-1500' }
};

function normalizeQualityKey(key) {
  if (!key) return 'original';
  var profile = PROFILES[key];
  if (profile && profile._alias) return profile._alias;
  return key;
}

function getProfile(key) {
  return PROFILES[normalizeQualityKey(key)] || PROFILES.original;
}

function listProfiles() {
  var ids = ['original'].concat(MODAL_QUALITY_ORDER);
  return ids.map(function (k) {
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

/**
 * Format the "Original" option label using the source file's bitrate +
 * resolution. e.g. (35600 kbps, "4k") → "35.6 Mbps 4K (Original)".
 * Falls back gracefully when bitrate or resolution is missing.
 */
function formatOriginalQualityLabel(bitrateKbps, resolutionTag) {
  var parts = [];
  if (bitrateKbps && bitrateKbps > 0) {
    if (bitrateKbps >= 1000) {
      // Round to 1 decimal, drop trailing .0
      var mbps = Math.round(bitrateKbps / 100) / 10;
      parts.push((mbps % 1 === 0 ? mbps.toFixed(0) : mbps.toFixed(1)) + ' Mbps');
    } else {
      parts.push(Math.round(bitrateKbps) + ' Kbps');
    }
  }
  var resLabel = formatResolutionTag(resolutionTag);
  if (resLabel) parts.push(resLabel);
  if (!parts.length) return 'Original';
  return parts.join(' ') + ' (Original)';
}

function formatResolutionTag(tag) {
  var s = String(tag || '').toLowerCase().trim();
  if (!s) return '';
  if (s.indexOf('4k') >= 0 || s.indexOf('2160') >= 0 || s.indexOf('3840') >= 0) return '4K';
  if (s.indexOf('1080') >= 0) return '1080p';
  if (s.indexOf('720') >= 0) return '720p';
  if (s.indexOf('480') >= 0) return '480p';
  if (s.indexOf('360') >= 0) return '360p';
  if (s === 'sd') return 'SD';
  if (s === 'hd') return 'HD';
  return s.toUpperCase();
}

/* "Maximum" ceiling for Original quality. Plex applies a low remote-streaming
 * default when the client sends no maxVideoBitrate over WAN, which refuses
 * Direct Play (directPlayDecisionCode 3000). Sending an unattainably high value
 * mirrors Plex Web's "Maximum" setting so PMS lets Direct Play / full-bitrate
 * through instead of capping. A hard server-side limit still wins; this only
 * defeats the implicit default. */
var ORIGINAL_MAX_BITRATE_KBPS = 2000000;

function applyProfileToParams(params, profileKey, prefs, sourceBitrateKbps) {
  var profile = getProfile(profileKey);
  prefs = prefs || {};
  if (profile.maxVideoBitrate) {
    params['maxVideoBitrate'] = profile.maxVideoBitrate;
  } else if (sourceBitrateKbps && sourceBitrateKbps > 0) {
    // Original quality: target the source file's own bitrate. This still lets
    // Direct Play through (source <= max), but when a transcode IS forced (e.g.
    // PGS burn-in) PMS targets a sane bitrate instead of the 2 Gbps placeholder
    // — which otherwise makes it transcode to an absurd bitrate the TV/WAN
    // can't sustain. Small headroom so rounding never trips the <= check.
    params['maxVideoBitrate'] = Math.ceil(Number(sourceBitrateKbps) * 1.1);
  } else {
    params['maxVideoBitrate'] = ORIGINAL_MAX_BITRATE_KBPS;
  }
  if (profile.videoResolution) {
    params['videoResolution'] = profile.videoResolution;
  }
  return params;
}

export {
  PROFILES,
  TRANSCODE_QUALITY_ORDER,
  MODAL_QUALITY_ORDER,
  getProfile,
  normalizeQualityKey,
  listProfiles,
  formatOriginalQualityLabel,
  formatResolutionTag,
  applyProfileToParams,
  isDirectPlayOnlyQuality,
  allowsPlaybackFallback,
  requiresServerTranscode,
  nextLowerTranscodeProfileKey
};
