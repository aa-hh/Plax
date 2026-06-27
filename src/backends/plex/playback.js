/**
 * Plex playback implementation of the shared backend playback contract.
 *
 * Both backends implement the same contract so sessionController can stay a thin
 * provider-agnostic delegator:
 *   resolveStreamUrl(session)            -> Promise<{ url, mode, subtitle? }>
 *   buildSubtitlePlan(server, session, track) -> { prepare?, attempts }
 *
 * This module owns ALL the Plex /decision + universal-transcode URL logic. It must
 * NOT import sessionController.js or backends/index.js (would create an import
 * cycle) — it only depends on the plex/* and playback/* leaf modules.
 */
import { getState } from '../../core/store.js';
import {
  serverUrl,
  fetchText,
  plexHeaders,
  getServerToken,
  redactPlexUrl
} from '../../plex/client.js';
import { applyPlexClientFields } from '../../plex/clientIdentity.js';
import {
  applyProfileToParams,
  getProfile,
  isDirectPlayOnlyQuality,
  requiresServerTranscode
} from '../../playback/qualityProfiles.js';
import {
  buildMinimalDecisionParams,
  buildUniversalDecisionUrl
} from '../../playback/transcodeDecision.js';
import {
  parseTranscodeDecision,
  strategyFromPartDecision
} from '../../playback/parseTranscodeDecision.js';
import { buildAudioTranscodeParam } from '../../playback/tracks/audioTracks.js';
import { normalizePlexPath } from '../../playback/plexPaths.js';
import {
  buildSubtitleTranscodeParams,
  resolveSessionPartPath,
  resolveSessionMetadataPath,
  offsetSecondsForPlex,
  getActiveTranscodeSession,
  plexLocationForServer,
  selectPartSubtitleStream,
  prepareClientSubtitlePlayback,
  buildSubtitleFetchPlan
} from '../../playback/tracks/subtitleTracks.js';
import {
  applyWebOsHlsTranscodeParams,
  buildHttpTranscodeFallbackParams,
  isSegmentedDeliveryProtocol,
  isWebOs4Tv,
  isHlsUrl,
  extractHlsManifestDiagnostics
} from '../../playback/hlsPolicy.js';
import { buildWebOsClientProfileExtra } from '../../playback/deviceProfile.js';
import { tvLog, tvError } from '../../utils/tvDebug.js';

/**
 * Client-side strategy hint when `/decision` is unavailable. Playback URLs
 * normally follow the server decision instead of this helper.
 */
function resolvePlaybackStrategy(session) {
  var prefs = getState().playbackPrefs || {};
  var quality = session.quality || prefs.quality || 'original';
  if (session.playbackStrategy) return session.playbackStrategy;
  if (isDirectPlayOnlyQuality(quality) && !session.forceTranscode) {
    return 'direct';
  }
  if (requiresServerTranscode(quality)) {
    return session.transcodeProtocol === 'http' ? 'http-transcode' : 'transcode';
  }
  if (session.forceTranscode || prefs.directPlay === false) {
    return session.transcodeProtocol === 'http' ? 'http-transcode' : 'transcode';
  }
  return 'direct';
}

/** Plex Web-style client playback id (distinct from PMS transcode session query param). */
function generateClientPlaybackSessionId() {
  var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  var out = '';
  for (var i = 0; i < 24; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

function sessionQualityKey(session) {
  var prefs = getState().playbackPrefs || {};
  return session.quality || prefs.quality || 'original';
}

function applyPlexTranscodeLevelParams(params, session, usesTranscoder) {
  if (!usesTranscoder && !requiresServerTranscode(sessionQualityKey(session))) return;
  params.subtitleSize = '75';
  params.audioBoost = '100';
}

function buildDecisionRequestFlags(session) {
  var prefs = getState().playbackPrefs || {};
  var quality = sessionQualityKey(session);
  var strategy = session.playbackStrategy;

  if (requiresServerTranscode(quality)) {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (session.forceTranscode || prefs.directPlay === false) {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (strategy === 'direct-stream') {
    return { directPlay: '0', directStream: '1', directStreamAudio: '1' };
  }
  if (strategy === 'transcode' || strategy === 'http-transcode') {
    return { directPlay: '0', directStream: '0', directStreamAudio: '0' };
  }
  if (strategy === 'direct' || isDirectPlayOnlyQuality(quality)) {
    return { directPlay: '1', directStream: '1', directStreamAudio: '1' };
  }
  return { directPlay: '1', directStream: '1', directStreamAudio: '1' };
}

function buildTranscodeParams(server, partKey, session, protocol, strategyOverride) {
  var prefs = getState().playbackPrefs || {};
  var strategy = strategyOverride || resolvePlaybackStrategy(session);
  var path = resolveSessionMetadataPath(session) || normalizePlexPath(partKey);
  var fullTranscode = strategy === 'transcode' || strategy === 'http-transcode';
  var directStream = strategy === 'direct-stream';
  var params = applyPlexClientFields({
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    fastSeek: '1',
    hasMDE: '1',
    directPlay: fullTranscode ? '0' : (directStream ? '0' : '1'),
    directStream: fullTranscode ? '0' : '1',
    directStreamAudio: fullTranscode ? '0' : '1',
    autoAdjustQuality: '0',
    mediaBufferSize: '102400',
    location: plexLocationForServer(server)
  });
  assignStartUrlSessionParams(params, session);
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs, session.version && session.version.bitrate);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  var usesTranscoder = directStream || fullTranscode;
  applyPlexTranscodeLevelParams(params, session, usesTranscoder);
  var softTextSubs = usesTranscoder && session.subtitleStreamId != null &&
    session.subtitleBurnIn !== true;
  Object.assign(params, buildSubtitleTranscodeParams(
    session.subtitleStreamId,
    session.subtitleOffset,
    {
      burnIn: session.subtitleBurnIn === true,
      clientSubtitles: softTextSubs,
      advancedSubtitles: session.subtitleBurnIn === true && session.subtitleAdvancedBurn
        ? 'burn'
        : undefined
    }
  ));

  if (protocol === 'http') {
    if (isWebOs4Tv()) {
      // webOS 4 progressive HTTP needs the SAME WAN-400-safe param stripping as
      // the HLS path (this PMS build 400s start URLs that carry hasMDE,
      // mediaBufferSize, location=wan, the X-Plex-* identity fields, etc.).
      // applyWebOsHlsTranscodeParams does that stripping; then switch to
      // progressive HTTP (drop the HLS-only incomplete-segments flag).
      applyWebOsHlsTranscodeParams(params, { strategy: strategy });
      params.protocol = 'http';
      delete params['X-Plex-Incomplete-Segments'];
    } else {
      params = buildHttpTranscodeFallbackParams(params);
    }
  } else {
    applyWebOsHlsTranscodeParams(params, { strategy: strategy });
  }

  return params;
}

/** Params sent to `/decision` — ask PMS with subtitles=auto when soft subs are on. */
function assignDecisionSessionParams(params, session) {
  var clientSession = session.playbackSessionId || session.sessionId;
  if (!clientSession) {
    clientSession = generateClientPlaybackSessionId();
    session.playbackSessionId = clientSession;
  }
  params.session = clientSession;
  delete params.transcodeSessionId;
  delete params['X-Plex-Session-Identifier'];
  return params;
}

function requirePmsTranscodeSession(session) {
  var resourceSession = getActiveTranscodeSession(session);
  if (!resourceSession) {
    var err = new Error(
      'Plex did not return a transcode session from /decision. Cannot start universal transcode.'
    );
    err.code = 'PMS_SESSION_MISSING';
    throw err;
  }
  return resourceSession;
}

function assignStartUrlSessionParams(params, session) {
  var resourceSession = requirePmsTranscodeSession(session);
  var clientSession = session.playbackSessionId || session.sessionId;
  params.session = resourceSession;
  params.transcodeSessionId = resourceSession;
  tvLog('session', 'play session alignment', {
    decisionResourceSession: resourceSession,
    clientPlaybackSessionId: clientSession,
    matchesClientSession: resourceSession === clientSession,
    playSession: params.session,
    playTranscodeSessionId: params.transcodeSessionId
  });
  return params;
}

function prefersMp4RemuxForDv(session) {
  var version = session && session.version;
  if (!version) return false;
  var container = String(version.container || '').toLowerCase();
  var profile = String(version.videoProfile || '').toLowerCase();
  var codec = String(version.videoCodec || '').toLowerCase();
  var hasDv = profile.indexOf('dv') >= 0 || codec.indexOf('dv') >= 0 ||
    profile.indexOf('dolby') >= 0;
  return hasDv && container === 'mkv';
}

function buildMinimalDecisionRequestParams(server, partKey, session, flagOverrides) {
  var prefs = getState().playbackPrefs || {};
  var deviceInfo = getState().deviceInfo || {};
  var path = resolveSessionMetadataPath(session) || normalizePlexPath(partKey);
  var params = applyPlexClientFields(Object.assign({
    path: path,
    mediaIndex: session.mediaIndex != null ? session.mediaIndex : 0,
    partIndex: session.partIndex != null ? session.partIndex : 0,
    hasMDE: '1',
    directPlay: '1',
    directStream: '1',
    directStreamAudio: '1',
    mediaBufferSize: '102400',
    location: plexLocationForServer(server)
  }, flagOverrides || {}));
  assignDecisionSessionParams(params, session);
  // webOS 4: pin the decision to protocol=hls. Verified against PMS — without a
  // protocol the server defaults toward the http target and, because our profile
  // offers both an hls/mpegts and an http/mp4 transcode target, it commits the
  // session to mp4 (fMP4). fMP4 HLS then emits an #EXT-X-MAP /base/header init
  // segment that 404s and hangs hls.js. With protocol=hls the server
  // deterministically commits to mpegts (clean .ts, no init segment), and
  // direct-playable items still return directplay (protocol doesn't force a
  // transcode). The transcode is delivered over HLS to hls.js; copy/DV reroutes
  // to progressive HTTP at start time regardless of this.
  if (isWebOs4Tv()) {
    params.protocol = 'hls';
  }
  var offsetSec = offsetSecondsForPlex(session);
  if (offsetSec > 0) params.offset = String(offsetSec);
  applyProfileToParams(params, session.quality || prefs.quality, prefs, session.version && session.version.bitrate);
  Object.assign(params, buildAudioTranscodeParam(session.audioStreamId));
  if (session.subtitleStreamId != null && session.subtitleBurnIn !== true) {
    // We render text subs client-side (SRT TextTrack pipeline). On webOS 4 the
    // official Plex-for-LG app sends subtitles=sidecar on the PLAYBACK decision
    // (PMS-server-log verified 2026-06-27, session vtyws…): the video still comes
    // back decision="direct play" (HDR untouched), AND the same session is then
    // accepted by /subtitles/:/transcode/universal/start to extract the embedded
    // SRT as a sidecar. The values we used before both fail the sidecar /start:
    //   - subtitles=none registers the session for NO subs → /start 400s on the
    //     mismatch (PMS "Found session GUID … in session start" then 400; this was
    //     the root cause of the whole embedded-sub saga).
    //   - subtitles=auto burns (Generic profile declares no SubtitleProfiles).
    // sidecar is the one value that keeps direct play AND enables client-rendered
    // text extraction off the SAME session. webOS 5+ keeps the soft-mux (auto) path.
    params.subtitles = isWebOs4Tv() ? 'sidecar' : 'auto';
  } else if (session.subtitleStreamId != null && session.subtitleBurnIn === true) {
    Object.assign(params, buildSubtitleTranscodeParams(
      session.subtitleStreamId,
      session.subtitleOffset,
      {
        burnIn: true,
        clientSubtitles: false,
        advancedSubtitles: session.subtitleAdvancedBurn ? 'burn' : undefined
      }
    ));
  } else {
    // No subtitle selected. If we leave the param off, PMS auto-selects and
    // BURNS a (often forced) subtitle, which mandates a full video transcode.
    // Tell it subtitles=none for ALL webOS versions: with nothing chosen there
    // is nothing to show, so never let PMS auto-pick. (subtitles is already in
    // DECISION_QUERY_KEYS so it survives the WAN strip; do not add
    // subtitleStreamID/skipSubtitles here — none is a value, not a new key.)
    params.subtitles = 'none';
  }
  return buildMinimalDecisionParams(params, path);
}

function buildDecisionRequestParams(server, partKey, session, protocol) {
  var flags = buildDecisionRequestFlags(session);
  return buildMinimalDecisionRequestParams(server, partKey, session, flags);
}

function buildPlaybackUrl(server, partKey, session, protocol, strategyOverride) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildTranscodeParams(server, partKey, session, protocol, strategyOverride);
  if (protocol === 'http') {
    return serverUrl(server.connectionUri, '/video/:/transcode/universal/start', params, server);
  }
  return serverUrl(server.connectionUri, '/video/:/transcode/universal/start.m3u8', params, server);
}

function buildDecisionParams(server, partKey, session, protocol) {
  return buildDecisionRequestParams(server, partKey, session, protocol);
}

function buildDecisionHeaders(server, session) {
  var headers = plexHeaders({ Accept: 'application/xml' });
  var token = getServerToken(server);
  if (token) headers['X-Plex-Token'] = token;
  // X-Plex-Session-Identifier must be the CLIENT ID (not the playback session GUID).
  // Official Plex-for-LG sends clientId in BOTH the decision and /subtitles/start,
  // so PMS can match the session when /subtitles/start fires. If we send the session
  // GUID here and then clientId in /subtitles/start, PMS sees a mismatch and 400s
  // in 1ms — confirmed from PMS log + TV log comparison (session kyuaodh vs client ID).
  headers['X-Plex-Session-Identifier'] = headers['X-Plex-Client-Identifier'];
  // Profile MUST arrive in request headers, not URL query. PMS caches the profile
  // in the session only when it comes via headers — if it's only in the query it's
  // consumed for that single decision but not stored, so /subtitles/start 400s.
  headers['X-Plex-Client-Profile-Name'] = 'Generic';
  headers['X-Plex-Client-Profile-Extra'] = buildWebOsClientProfileExtra(
    getState().deviceInfo || {},
    { strategy: (session && session.playbackStrategy) || 'direct' }
  );
  return headers;
}

function decisionErrorDetails(err) {
  if (!err || !err.status) return '';
  var detail = ' HTTP ' + err.status;
  if (err.status === 400 && err.body) {
    detail += ' body="' + String(err.body).replace(/\s+/g, ' ').slice(0, 240) + '"';
  }
  return detail;
}

function buildDecisionUrl(server, partKey, session, protocol) {
  protocol = protocol || (session && session.transcodeProtocol) || 'hls';
  var params = buildDecisionParams(server, partKey, session, protocol);
  return buildUniversalDecisionUrl(server.connectionUri, params);
}

function applyPmsDeliveryFromDecision(session, partProtocol) {
  if (!session) return;
  var protocol = partProtocol || null;
  session.pmsDeliveryProtocol = protocol;
  session.commitToHlsDelivery = isSegmentedDeliveryProtocol(protocol);
}

function resolveStrategyFromDecision(parsed, session, requestProtocol) {
  if (parsed && parsed.part && parsed.part.decision) {
    var strategy = strategyFromPartDecision(parsed.part.decision);
    var partDecision = parsed.part.decision;
    var partProtocol = parsed.part.protocol;
    var quality = sessionQualityKey(session);
    if (requiresServerTranscode(quality) &&
        (partDecision === 'copy' || partDecision === 'directplay')) {
      console.info(
        '[playback] quality override: PMS said ' + partDecision +
          ', forcing transcode for ' + quality
      );
      strategy = 'transcode';
    }
    applyPmsDeliveryFromDecision(session, partProtocol);
    /* Honor explicit HTTP fallback from the screen; otherwise follow PMS protocol. */
    if (session.playbackStrategy === 'http-transcode') {
      if (strategy === 'transcode') {
        return { strategy: 'http-transcode', protocol: 'http' };
      }
    } else if (partProtocol === 'http' && strategy !== 'direct') {
      return { strategy: 'http-transcode', protocol: 'http' };
    } else if (isSegmentedDeliveryProtocol(partProtocol)) {
      return {
        strategy: strategy,
        protocol: partProtocol
      };
    }
    return {
      strategy: strategy,
      protocol: partProtocol || requestProtocol
    };
  }
  applyPmsDeliveryFromDecision(session, requestProtocol);
  session.commitToHlsDelivery = isSegmentedDeliveryProtocol(requestProtocol);
  return {
    strategy: resolvePlaybackStrategy(session),
    protocol: requestProtocol
  };
}

function buildDecisionRetryUrl(server, partKey, session, flagOverrides) {
  return buildUniversalDecisionUrl(
    server.connectionUri,
    buildMinimalDecisionRequestParams(server, partKey, session, flagOverrides)
  );
}

function buildFirstDecisionUrl(server, partKey, session, protocol) {
  // The first decision is optimistic — directPlay=1 — so PMS direct-plays when it
  // can and still reports burn/codec reasons when it must transcode anyway. Two
  // cases must NOT be optimistic:
  //   - requiresServerTranscode quality cap: directPlay=1 bypasses maxVideoBitrate,
  //     so PMS replies "Direct play OK" and never builds a transcode session →
  //     start.m3u8 400s. Send directPlay=0 so it commits a real (mpegts) session.
  //   - direct-stream strategy (text-subtitle remux, f41a9c7 "prefer HLS remux for
  //     text subs"): a directPlay=1 probe returns "Direct play OK" and builds NO
  //     session, so an embedded text sub has nothing to extract from → universal/
  //     subtitles 400s, subtitle silently missing. Send directPlay=0,directStream=1
  //     so PMS commits a remux session (video copied → HDR/codec preserved) the
  //     subtitle is extracted from.
  // NOTE: on webOS 4 directStream is stripped from the decision, so directPlay=0
  // alone yields a FULL transcode (re-encode), not a remux. Do NOT force
  // directPlay=0 for a direct-stream strategy here — it would needlessly transcode
  // direct-playable files. Stay optimistic except for an explicit quality cap.
  var flags = requiresServerTranscode(sessionQualityKey(session))
    ? { directPlay: '0', directStream: '0', directStreamAudio: '0' }
    : { directPlay: '1', directStream: '1', directStreamAudio: '1' };
  return buildDecisionRetryUrl(server, partKey, session, flags);
}

/**
 * Ask PMS how to deliver this item; adopt resourceSession + Part@decision.
 */
function requestPlaybackDecision(server, partKey, session, protocol) {
  var url = buildFirstDecisionUrl(server, partKey, session, protocol);
  if (!url) {
    return Promise.resolve(resolveStrategyFromDecision(null, session, protocol));
  }
  tvError('session', 'decision request', { url: redactPlexUrl(url) });
  var headers = buildDecisionHeaders(server, session);

  function fetchDecision(decisionUrl) {
    return fetchText(decisionUrl, {
      headers: headers,
      timeout: 15000
    });
  }

  function handleDecisionBody(body) {
    var bodyStr = String(body || '').replace(/\s+/g, ' ');
    tvError('session', 'decision response body', {
      body: bodyStr.slice(0, 3000)
    });
    var parsed = parseTranscodeDecision(body, session);
    // The per-Stream decisions name exactly which track PMS refuses to direct
    // play and why (e.g. videoCodec/container/audioCodec). The container-level
    // text is generic ("Direct play is disabled"); the Stream tags carry the
    // real reason. Drive these off the single parse (no second inline scrape).
    parsed.streams.forEach(function (s) {
      if (!s.decisionText) return;
      tvError('session', 'stream decision', {
        type: s.streamType,
        kind: s.kind,
        codec: s.codec,
        decision: s.decision,
        burn: s.burn,
        why: s.decisionText
      });
    });
    // One structured outcome line — with subtitleBurned surfaced, an auto-burned
    // forced subtitle (the original full-transcode bug) is obvious at a glance.
    tvLog('session', 'decision outcome', {
      part: parsed.part,
      video: parsed.videoDecision,
      audio: parsed.audioDecision,
      subtitleBurned: parsed.subtitleBurned,
      reason: parsed.transcodeReason
    });
    if (session) {
      if (parsed.resourceSession) {
        session.transcodeSessionId = parsed.resourceSession;
        tvLog('session', 'decision resourceSession', {
          resourceSession: parsed.resourceSession
        });
      } else {
        session.transcodeSessionId = session.playbackSessionId || session.sessionId;
        tvLog('session', 'decision resourceSession missing, using client session', {
          resourceSession: session.transcodeSessionId
        });
      }
    }
    var resolved = resolveStrategyFromDecision(parsed, session, protocol);
    if (parsed.part && parsed.part.decision) {
      session.pmsPlaybackDecision = parsed.part.decision;
    }
    session.decisionInfo = parsed;
    session.playbackStrategy = resolved.strategy;
    logPlaybackDecisionOutcome(session, parsed, resolved);
    return resolved;
  }

  function tryDecision400Retries() {
    var transcodeUrl = buildDecisionRetryUrl(server, partKey, session, {
      directPlay: '0',
      directStream: '0',
      directStreamAudio: '0'
    });
    tvLog('session', 'decision retry transcode flags', { url: redactPlexUrl(transcodeUrl) });
    return fetchDecision(transcodeUrl).then(handleDecisionBody);
  }

  function logDecisionFailure(err, decisionUrl) {
    var body = err && err.body
      ? String(err.body).replace(/\s+/g, ' ').slice(0, 300)
      : '';
    console.warn(
      '[playback] decision failed for ' + redactPlexUrl(decisionUrl) +
        decisionErrorDetails(err) + ': ' +
        (err && err.message ? err.message : String(err))
    );
    tvLog('session', 'decision failed', {
      url: redactPlexUrl(decisionUrl),
      status: err && err.status ? err.status : 0,
      error: err && err.message ? err.message : String(err),
      body: body
    });
  }

  // A failed /decision must never dead-end playback: PMS issues no transcode
  // session, so fall through to progressive HTTP transcode using the client
  // session id (mirrors the missing-resourceSession branch in handleDecisionBody).
  function fallbackToHttpTranscode(err) {
    if (session) {
      session.transcodeSessionId = session.playbackSessionId || session.sessionId;
      session.playbackStrategy = 'http-transcode';
      session.pmsDeliveryProtocol = 'http';
      session.commitToHlsDelivery = false;
    }
    tvLog('session', 'decision failed → http-transcode fallback', {
      status: err && err.status ? err.status : 0
    });
    return { strategy: 'http-transcode', protocol: 'http' };
  }

  return fetchDecision(url).then(handleDecisionBody).catch(function (err) {
    if (err && err.status === 400) {
      return tryDecision400Retries().catch(function (retryErr) {
        logDecisionFailure(retryErr || err, url);
        return fallbackToHttpTranscode(retryErr || err);
      });
    }
    logDecisionFailure(err, url);
    return fallbackToHttpTranscode(err);
  });
}

function buildDirectPlayUrl(server, partKey) {
  var path = normalizePlexPath(partKey);
  return serverUrl(server.connectionUri, path, {}, server);
}

function logPlaybackDecisionOutcome(session, parsed, resolved) {
  var quality = sessionQualityKey(session);
  var profile = getProfile(quality);
  var parts = [
    'quality=' + quality,
    'strategy=' + resolved.strategy
  ];
  if (profile.maxVideoBitrate) parts.push('maxVideoBitrate=' + profile.maxVideoBitrate);
  if (profile.videoResolution) parts.push('videoResolution=' + profile.videoResolution);
  if (parsed && parsed.part) {
    parts.push('decision=' + (parsed.part.decision || 'unknown'));
    if (parsed.part.protocol) parts.push('protocol=' + parsed.part.protocol);
  }
  if (session.commitToHlsDelivery) parts.push('delivery=hls-committed');
  console.info('[playback] ' + parts.join(' '));
  tvError('session', 'decision ' + parts.join(' '));
  var v = session.version || {};
  var dev = getState().deviceInfo || {};
  tvError('session', 'decision why', {
    source: {
      container: v.container,
      videoCodec: v.videoCodec,
      videoProfile: v.videoProfile,
      videoResolution: v.videoResolution,
      width: v.width,
      height: v.height,
      bitrateKbps: v.bitrate,
      audioCodec: v.audioCodec
    },
    device: { uhd: dev.uhd, hdr10: dev.hdr10, dolbyVision: dev.dolbyVision, model: dev.model, versionMajor: dev.versionMajor, version: dev.version }
  });
}

function resolveStreamMode(strategy, protocol) {
  if (strategy === 'direct') return 'direct';
  if (strategy === 'direct-stream') return 'direct-stream';
  if (strategy === 'http-transcode' || protocol === 'http') return 'transcode-http';
  return 'transcode-hls';
}

function shouldSelectPartSubtitleBeforePlay(session) {
  return session.subtitleStreamId != null;
}

function probeHlsPlaylistOrReject(server, url, session) {
  if (!isHlsUrl(url)) return Promise.resolve();
  var headers = plexHeaders({});
  var token = getServerToken(server);
  if (token) headers['X-Plex-Token'] = token;
  if (session && (session.playbackSessionId || session.sessionId)) {
    headers['X-Plex-Session-Identifier'] = session.playbackSessionId || session.sessionId;
  }
  return fetchText(url, { headers: headers, timeout: 10000 }).then(function (body) {
    var diag = extractHlsManifestDiagnostics(body);
    if (!diag.isM3u8) {
      var invalid = new Error('Plex start.m3u8 did not return a valid HLS playlist.');
      invalid.status = 502;
      throw invalid;
    }
    tvLog('session', 'start.m3u8 probe ok', {
      status: 200,
      isM3u8: true,
      streamInfs: diag.streamInfs.slice(0, 2),
      snippet: diag.snippet.slice(0, 240),
      url: redactPlexUrl(url)
    });
  }).catch(function (err) {
    var status = err && err.status;
    var message = status === 400
      ? 'Plex rejected start.m3u8 (HTTP 400). Transcode session may not match /decision.'
      : 'Plex start.m3u8 probe failed' + (status ? ' (HTTP ' + status + ')' : '');
    tvError('session', 'start.m3u8 probe failed', {
      status: status,
      error: err && err.message ? err.message : String(err),
      body: err && err.body ? String(err.body).replace(/\s+/g, ' ').slice(0, 300) : '',
      url: redactPlexUrl(url)
    });
    var out = new Error(message);
    out.status = status;
    throw out;
  });
}

/**
 * Plex implementation of the shared `resolveStreamUrl(session)` contract.
 * Returns `{ url, mode }` (Plex uses buildSubtitlePlan for subtitles, so no
 * `subtitle` field here).
 */
function resolveStreamUrl(session) {
  if (!session || !session.server) {
    var noServerErr = new Error('No Plex server connected. Return to library and try again.');
    tvError('session', 'resolveStreamUrl failed', noServerErr.message);
    return Promise.reject(noServerErr);
  }
  if (!session.server.connectionUri) {
    var noUriErr = new Error('Plex server has no connection URL. Check network in Settings.');
    tvError('session', 'resolveStreamUrl failed', noUriErr.message);
    return Promise.reject(noUriErr);
  }
  var server = session.server;
  var partKey = resolveSessionPartPath(session);
  if (!partKey) {
    var noPartErr = new Error('Could not resolve media file path for playback.');
    tvError('session', 'resolveStreamUrl failed', noPartErr.message);
    return Promise.reject(noPartErr);
  }
  /* Ask /decision for HLS unless the user explicitly requested HTTP fallback. */
  var requestProtocol = session.playbackStrategy === 'http-transcode'
    ? 'http'
    : 'hls';

  var pre = shouldSelectPartSubtitleBeforePlay(session)
    ? selectPartSubtitleStream(server, session)
    : Promise.resolve();

  return Promise.all([
    pre,
    requestPlaybackDecision(server, partKey, session, requestProtocol)
  ]).then(function (results) {
    var resolved = results[1];
    try {
      var strategy = resolved.strategy;
      var protocol = resolved.protocol || requestProtocol;
      // webOS 4: progressive HTTP transcode returns a 0-byte body, so http-transcode
      // is never a usable delivery here. Coerce any http-transcode strategy back to a
      // mpegts HLS transcode regardless of how it was reached (stale session state,
      // inherited protocol, fallback). The transcode itself is identical; only the
      // delivery changes to the one this hardware can actually play.
      if (isWebOs4Tv() && strategy === 'http-transcode') {
        strategy = 'transcode';
        protocol = 'hls';
        if (session) { session.playbackStrategy = 'transcode'; session.transcodeProtocol = 'hls'; }
        tvError('session', 'webOS4: coerced http-transcode → mpegts HLS', {});
      }
      if (strategy === 'direct') {
        var directUrl = buildDirectPlayUrl(server, partKey);
        tvLog('session', 'url direct play', { url: redactPlexUrl(directUrl) });
        return {
          url: directUrl,
          mode: 'direct'
        };
      }
      var startProtocol = strategy === 'http-transcode' ? 'http' : protocol;
      // webOS 4 delivery split (verified by probing the PMS endpoints directly):
      //  - Full transcode (H.264) → HLS with mpegts (.ts) segments via hls.js.
      //    When container=mpegts is requested at BOTH /decision and /start, PMS
      //    emits a clean TS playlist with NO #EXT-X-MAP init segment and the .ts
      //    segments fetch 200 (video/MP2T). hls.js demuxes TS via MSE. (The
      //    start-time mpegts profile is forced in resolveWebOsHlsProfileExtra;
      //    fMP4 here is what produced the /base/header 404 that hung startup.)
      //  - Progressive HTTP (/start protocol=http) is NOT usable: PMS returns
      //    200 video/mp4 with a ZERO-byte body, so <video> stalls at
      //    networkState=3. Never route transcode there on webOS 4.
      //  - Direct-stream/copy (HEVC/DV remux) → progressive HTTP as before; it
      //    can't ride hls.js MSE on this hardware. True direct play is already
      //    progressive.
      if (isWebOs4Tv() && isSegmentedDeliveryProtocol(startProtocol) &&
          strategy === 'direct-stream') {
        startProtocol = 'http';
        tvError('session', 'webOS4: direct-stream HLS → progressive HTTP', { strategy: strategy });
      } else if (strategy === 'direct-stream' && prefersMp4RemuxForDv(session)) {
        startProtocol = 'http';
        tvLog('session', 'DV MKV remux → progressive MP4', {
          container: session.version && session.version.container
        });
      }
      var playbackUrl = buildPlaybackUrl(server, partKey, session, startProtocol, strategy);
      var mode = resolveStreamMode(strategy, startProtocol);
      tvLog('session', 'url ' + mode, {
        strategy: strategy,
        protocol: startProtocol,
        url: redactPlexUrl(playbackUrl)
      });
      if (startProtocol === 'http') {
        return {
          url: playbackUrl,
          mode: mode
        };
      }
      if (isWebOs4Tv()) {
        // Do NOT pre-probe with XHR on webOS 4. The XHR probe (Accept: application/json
        // + duplicated X-Plex-* headers) draws a spurious HTTP 400 from PMS that the
        // native HLS player never hits — the official Plex app just points <video> at
        // start.m3u8 and lets the TV fetch it. Hand the playlist straight to the native
        // player; a genuine failure surfaces via the video-error fallback chain.
        tvLog('session', 'webOS4 HLS: skip XHR probe, native player loads playlist', {
          url: redactPlexUrl(playbackUrl)
        });
        return {
          url: playbackUrl,
          mode: mode
        };
      }
      return probeHlsPlaylistOrReject(server, playbackUrl, session).then(function () {
        return {
          url: playbackUrl,
          mode: mode
        };
      }).catch(function (probeErr) {
        // Native HLS start rejected (non-webOS-4) — fall through to progressive HTTP
        // transcode rather than dead-ending.
        tvLog('session', 'start.m3u8 failed → http-transcode fallback', {
          status: probeErr && probeErr.status ? probeErr.status : 0
        });
        session.playbackStrategy = 'http-transcode';
        session.pmsDeliveryProtocol = 'http';
        session.commitToHlsDelivery = false;
        session.transcodeSessionId = session.playbackSessionId || session.sessionId;
        var httpUrl = buildPlaybackUrl(server, partKey, session, 'http', 'http-transcode');
        tvLog('session', 'url transcode-http (hls fallback)', {
          url: redactPlexUrl(httpUrl)
        });
        return { url: httpUrl, mode: 'transcode-http' };
      });
    } catch (buildErr) {
      tvError('session', 'build playback URL failed', buildErr && buildErr.message ? buildErr.message : buildErr);
      throw buildErr;
    }
  });
}

/**
 * Plex implementation of the shared `buildSubtitlePlan(server, session, track)`
 * contract. Wraps the existing client-subtitle pipeline:
 *   prepare()  -> primes the PMS-side soft-sub session (when needed)
 *   attempts   -> ordered list of subtitle fetch URLs the player tries in turn
 */
function buildSubtitlePlan(server, session, track) {
  var playbackMode = (session && session.playbackMode) || 'direct';
  return {
    prepare: function () {
      return prepareClientSubtitlePlayback(server, session, track, playbackMode);
    },
    // Thunk, NOT a precomputed array: prepare() (primeDirectPlaySubtitleSession)
    // mutates session.transcodeSessionId, and the universal subtitle URLs embed
    // that id. Building eagerly — before prepare — yields URLs without the primed
    // session → Plex returns no subtitle. Must evaluate AFTER prepare resolves.
    attempts: function () {
      return buildSubtitleFetchPlan(server, session, track, { playbackMode: playbackMode });
    }
  };
}

export {
  resolveStreamUrl,
  buildSubtitlePlan,
  buildPlaybackUrl,
  buildDirectPlayUrl,
  buildDecisionRequestParams,
  applyPmsDeliveryFromDecision,
  resolvePlaybackStrategy,
  requestPlaybackDecision,
  buildFirstDecisionUrl,
  assignStartUrlSessionParams,
  requirePmsTranscodeSession
};
