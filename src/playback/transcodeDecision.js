import { buildQuery } from '../utils/fetch.js';

/**
 * Minimal /decision query allow-list, modeled on plex-for-kodi's getDecisionPath:
 * send hasMDE + a client profile name + directPlay + buffer/subtitle hints, and
 * OMIT protocol / directStream / directStreamAudio / fastSeek / incomplete-segments
 * / autoAdjustQuality on the decision (those belong on start.m3u8 only). PMS over
 * WAN returns a bare HTTP 400 when the decision carries the streaming-only flags.
 */
var DECISION_QUERY_KEYS = [
  'path',
  'mediaIndex',
  'partIndex',
  'hasMDE',
  'directPlay',
  'mediaBufferSize',
  'session',
  'skipSubtitles',
  'subtitles',
  'subtitleStreamID',
  'X-Plex-Subtitle-Stream',
  'X-Plex-Subtitle-Offset',
  'subtitleSize',
  'audioBoost',
  'autoAdjustSubtitle',
  'advancedSubtitles',
  'location',
  'offset',
  'maxVideoBitrate',
  'videoResolution',
  'protocol',
  'X-Plex-Client-Profile-Name',
  'X-Plex-Client-Profile-Extra'
];

function buildMinimalDecisionParams(fullParams, metadataPath) {
  var params = {};
  fullParams = fullParams || {};
  DECISION_QUERY_KEYS.forEach(function (key) {
    if (fullParams[key] != null) params[key] = fullParams[key];
  });
  if (metadataPath) params.path = metadataPath;
  return params;
}

function buildUniversalDecisionUrl(base, params) {
  var q = buildQuery(params || {});
  return base.replace(/\/$/, '') +
    '/video/:/transcode/universal/decision' +
    (q ? '?' + q : '');
}

export {
  buildMinimalDecisionParams,
  buildUniversalDecisionUrl
};
