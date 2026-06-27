/**
 * webOS Plex client profile (X-Plex-Client-Profile-Extra) for MDE / transcode URLs.
 *
 * The profile-extra string is generated PURELY from the capability matrix
 * (`capabilityMatrix.js`) so there is a single source of truth for codec,
 * container, audio, subtitle and transport behaviour per webOS generation.
 *
 * Grammar reference (Plex MDE `X-Plex-Client-Profile-Extra`):
 *   - add-direct-play-profile(type=videoProfile&container=...&videoCodec=...&audioCodec=...&subtitleCodec=...)
 *   - add-direct-play-profile(type=subtitleProfile&codec=...)
 *   - add-transcode-target(type=videoProfile&context=streaming&protocol=...&container=...&videoCodec=...&audioCodec=...)
 *   - add-transcode-target-audio-codec(type=videoProfile&context=streaming&audioCodec=<src>&transcodeCodec=<target>)
 *   - add-limitation(scope=videoCodec&codec=<c>&name=<name>&value=<value>)
 */

import {
  getDeviceCapabilities,
  directPlayAudioCodecList,
  isAudioDirectPlay,
  bitrateCeilingKbps,
  transportFlags
} from './capabilityMatrix.js';
import { getState } from '../core/store.js';

function resolveDeviceInfo(deviceInfo) {
  if (deviceInfo && Object.keys(deviceInfo).length) return deviceInfo;
  var state = typeof getState === 'function' ? getState() : null;
  return (state && state.deviceInfo) || {};
}

function isFullTranscodeStrategy(strategy) {
  return strategy === 'transcode' || strategy === 'http-transcode';
}

/**
 * Resolve the matrix entry for a deviceInfo. Accepts an already-resolved caps
 * object ({version,entry,label} or a bare entry) so callers/tests can inject one.
 */
function resolveCaps(deviceInfo, caps) {
  if (caps && (caps.entry || caps.video)) return caps;
  return getDeviceCapabilities(deviceInfo);
}

function entryOf(caps) {
  if (!caps) return null;
  if (caps.entry) return caps.entry;
  if (caps.video) return caps;
  return null;
}

/** Supported video codec families in matrix declaration order (h264,hevc,...). */
function supportedVideoCodecs(entry) {
  return Object.keys((entry && entry.video) || {});
}

function audioCodecsForDirectPlay(deviceInfo, caps) {
  caps = resolveCaps(deviceInfo, caps);
  return directPlayAudioCodecList(caps).join(',');
}

function isAudioDirectPlayable(audioCodec, deviceInfo) {
  return isAudioDirectPlay(resolveCaps(deviceInfo), audioCodec);
}

/**
 * Direct-play video profile(s). Declares container/video/audio/subtitle support
 * so PMS direct-plays compatible streams and renders text subs client-side
 * (no auto-burn). DTS core (`dca`) is in the audio list; DTS-HD variants are NOT
 * (they move to transcode targets — spec-correct).
 */
function buildDirectPlayProfiles(deviceInfo, caps) {
  caps = resolveCaps(deviceInfo, caps);
  var entry = entryOf(caps);
  var containers = entry.containers.join(',');
  var videoCodecs = supportedVideoCodecs(entry).join(',');
  var audioCodecs = directPlayAudioCodecList(caps).join(',');
  var subtitleCodecs = entry.subtitle.softTextCodecs.join(',');

  var profiles = [
    'add-direct-play-profile(type=videoProfile&container=' + containers +
      '&videoCodec=' + videoCodecs +
      '&audioCodec=' + audioCodecs +
      '&subtitleCodec=' + subtitleCodecs + ')'
  ];

  // Dolby Vision: PMS prefers the mp4 (remuxed) sibling for DV HEVC.
  if (deviceInfo && deviceInfo.dolbyVision) {
    profiles.push(
      'add-direct-play-profile(type=videoProfile&container=mp4&videoCodec=hevc' +
        '&audioCodec=' + audioCodecs + ')'
    );
  }
  return profiles;
}

/**
 * Subtitle profile — declares the soft-text codecs the client renders itself.
 * Declarative counterpart to sending subtitles=none: tells PMS not to auto-burn.
 *
 * The transcode-target is REQUIRED for PMS to allow /subtitles/:/transcode/universal/start
 * (embedded sub sidecar extraction). Without it PMS checks the cached session profile and
 * immediately 400s because it finds no subtitle transcode target. Confirmed by comparing
 * our profile (missing) with the official Plex-for-LG augmentation data (has it) — that
 * extra entry is why official /start → 200 but ours → 400 in 1ms (PMS bails before any
 * metadata fetch).
 */
function buildSubtitleProfiles(caps) {
  var entry = entryOf(caps) || entryOf(getDeviceCapabilities(null));
  var codecs = entry.subtitle.softTextCodecs.join(',');
  return [
    'add-direct-play-profile(type=subtitleProfile&codec=' + codecs + ')',
    'add-transcode-target(type=subtitleProfile&protocol=http&context=all&subtitleCodec=srt&container=srt)'
  ];
}

/**
 * Codec profiles using correct Plex `add-limitation` name/value grammar.
 * Replaces the old malformed `videoResolution=...&maxVideoBitrate=...` form.
 *
 * audio.channels uses `codec=*` (wildcard) — Plex applies it across all video
 * codecs rather than duplicating per codec.
 */
function buildCodecProfiles(caps, deviceInfo) {
  caps = resolveCaps(deviceInfo, caps);
  var entry = entryOf(caps);
  var isUhd = !!(deviceInfo && deviceInfo.uhd);
  var video = entry.video || {};
  var parts = [];

  // Per-codec bitrate ceilings (kbps) from the matrix.
  supportedVideoCodecs(entry).forEach(function (codec) {
    parts.push(limitation(codec, 'upperBound', 'video.bitrate',
      bitrateCeilingKbps(caps, codec, isUhd)));
  });

  // h264 level ceiling.
  if (video.h264 && video.h264.maxLevel != null) {
    parts.push(limitation('h264', 'upperBound', 'video.level', video.h264.maxLevel));
  }

  // hevc bit-depth ceiling.
  if (video.hevc && video.hevc.maxBitDepth != null) {
    parts.push(limitation('hevc', 'upperBound', 'video.bitDepth', video.hevc.maxBitDepth));
  }

  // Max audio channels (wildcard codec scope).
  if (entry.audio && entry.audio.maxChannels != null) {
    parts.push(limitation('*', 'upperBound', 'audio.channels', entry.audio.maxChannels));
  }

  return parts;
}

/**
 * Build a single add-limitation directive in Plex's CURRENT MDE grammar
 * (scopeName + type + replace), matching what Plex Web emits. The legacy
 * `codec=<c>` form without `type`/`replace` is silently ignored by modern PMS,
 * which let unsupported streams slip past our declared ceilings.
 */
function limitation(scopeName, type, name, value) {
  return 'add-limitation(scope=videoCodec&scopeName=' + scopeName +
    '&type=' + type + '&name=' + name + '&value=' + value + '&replace=true)';
}

/**
 * Thin alias preserved for back-compat: just the per-codec `video.bitrate`
 * limitation subset of buildCodecProfiles.
 */
function buildBitrateLimitations(deviceInfo, caps) {
  caps = resolveCaps(deviceInfo, caps);
  var entry = entryOf(caps);
  var isUhd = !!(deviceInfo && deviceInfo.uhd);
  return supportedVideoCodecs(entry).map(function (codec) {
    return limitation(codec, 'upperBound', 'video.bitrate',
      bitrateCeilingKbps(caps, codec, isUhd));
  });
}

/**
 * Transcode targets. Structure is gated on the playback strategy
 * (full-transcode → h264-only; direct-stream/remux → keep all video codecs),
 * while the transport choices (mpegts-vs-fmp4, progressive-http) are gated on
 * the matrix transport flags so webOS4 keeps mpegts + progressive http.
 *
 * Audio-codec transcode targets are driven by the matrix `audio.transcodeTo`
 * map (DTS-HD MA/HiRes/X + TrueHD/MLP → ac3; flac/opus/wma → aac).
 */
function buildTranscodeTargets(deviceInfo, caps, options) {
  options = options || {};
  caps = resolveCaps(deviceInfo, caps);
  var entry = entryOf(caps);
  var strategy = options.strategy || options.playbackStrategy || 'direct-stream';
  var transport = transportFlags(caps) || {};
  var audioCodecs = directPlayAudioCodecList(caps).join(',');
  var allVideoCodecs = supportedVideoCodecs(entry).join(',');

  // webOS4: fMP4 (container=mp4) HLS produces an #EXT-X-MAP init segment that
  // PMS 404s during transcode startup, stalling hls.js. mpegts has no init
  // segment dependency. preferProgressiveHttp adds the progressive-http target
  // so PMS has a conversion profile for the HTTP fallback (avoids decisionCode
  // 4005). On webOS5+ neither flag is set.
  var hlsContainer = transport.fmp4HlsBroken ? 'mpegts' : 'mp4';
  var wantProgressiveHttp = !!transport.preferProgressiveHttp;

  var parts = [];

  if (isFullTranscodeStrategy(strategy)) {
    // Full transcode → h264 only (HEVC encode is too costly / unsupported here).
    parts.push(
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls' +
        '&container=' + hlsContainer + '&videoCodec=h264&audioCodec=aac,ac3,mp3)'
    );
    if (wantProgressiveHttp) {
      parts.push(
        'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
          '&container=mp4&videoCodec=h264&audioCodec=aac,ac3,mp3)'
      );
    }
    parts.push(
      'add-transcode-target-audio-codec(type=videoProfile&context=streaming&protocol=hls&audioCodec=aac)'
    );
  } else {
    parts.push(
      'add-transcode-target(type=videoProfile&context=streaming&protocol=hls' +
        '&container=' + hlsContainer + '&videoCodec=' + allVideoCodecs +
        '&audioCodec=' + audioCodecs + ')'
    );
    if (wantProgressiveHttp) {
      parts.push(
        'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
          '&container=mp4&videoCodec=' + allVideoCodecs +
          '&audioCodec=' + audioCodecs + ')'
      );
    }
    if (deviceInfo && deviceInfo.dolbyVision) {
      parts.push(
        'add-transcode-target(type=videoProfile&context=streaming&protocol=http' +
          '&container=mp4&videoCodec=hevc&audioCodec=' + audioCodecs + ')'
      );
    }
  }

  // Audio-only transcode targets (direct stream + audio transcode). Looped from
  // the matrix transcodeTo map: DTS-HD MA/HiRes/X + TrueHD/MLP → ac3 (keeps
  // 5.1), surround flac/opus/wma → aac.
  var transcodeTo = (entry.audio && entry.audio.transcodeTo) || {};
  Object.keys(transcodeTo).forEach(function (srcCodec) {
    parts.push(
      'add-transcode-target-audio-codec(type=videoProfile&context=streaming' +
        '&audioCodec=' + srcCodec + '&transcodeCodec=' + transcodeTo[srcCodec] + ')'
    );
  });

  return parts;
}

/**
 * @param {object} deviceInfo uhd, hdr10, dolbyVision, versionMajor, model, ...
 * @param {{ strategy?: string, capabilities?: object }} options
 * @returns {string} joined profile-extra directives
 */
function buildWebOsClientProfileExtra(deviceInfo, options) {
  deviceInfo = resolveDeviceInfo(deviceInfo);
  options = options || {};
  var caps = getDeviceCapabilities(deviceInfo);
  return buildDirectPlayProfiles(deviceInfo, caps)
    .concat(buildSubtitleProfiles(caps))
    .concat(buildTranscodeTargets(deviceInfo, caps, options))
    .concat(buildCodecProfiles(caps, deviceInfo))
    .join('+');
}

export {
  buildWebOsClientProfileExtra,
  audioCodecsForDirectPlay,
  isAudioDirectPlayable,
  buildDirectPlayProfiles,
  buildSubtitleProfiles,
  buildCodecProfiles,
  buildTranscodeTargets,
  buildBitrateLimitations,
  resolveDeviceInfo
};
