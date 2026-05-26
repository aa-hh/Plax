import { buildQuery } from '../utils/fetch.js';

var DECISION_QUERY_KEYS = [
  'path',
  'mediaIndex',
  'partIndex',
  'fastSeek',
  'hasMDE',
  'directPlay',
  'directStream',
  'directStreamAudio',
  'autoAdjustQuality',
  'mediaBufferSize',
  'session',
  'transcodeSessionId',
  'X-Plex-Session-Identifier',
  'skipSubtitles',
  'location',
  'offset',
  'maxVideoBitrate',
  'videoResolution',
  'protocol'
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
