/**
 * LG webOS TV maximum decode bitrates.
 *
 * The max-bitrate ceilings are now sourced from the single source of truth in
 * `capabilityMatrix.js` (`bitrateCeilingKbps`) instead of a hardcoded table, so
 * webOS 5/6 differences flow through automatically. The resolution / fps fields
 * (which the matrix keys per-tier but consumers here only read alongside the
 * ceiling) stay in a small local geometry table.
 *
 * `getLimits` keeps its `(isUhd, family)` signature — with no threadable device
 * context it resolves against the matrix's `default` (latest-known) entry, whose
 * ceilings match the previous hardcoded table exactly (FHD h264/hevc 40000;
 * UHD h264 50000, hevc 60000, vp9/av1 50000). `checkBitrate` threads its
 * `deviceInfo` arg into the matrix so per-version ceilings apply when known.
 *
 * https://webostv.developer.lge.com/develop/specifications/video-audio-50
 */
import { bitrateCeilingKbps } from './capabilityMatrix.js';

// Per-tier geometry (resolution / fps) only — the bitrate ceiling comes from the
// matrix. Kept so getLimits keeps returning its full {maxWidth,maxHeight,maxFps,
// maxBitrateKbps} shape.
var GEOMETRY = {
  fhd: {
    h264: { maxWidth: 1920, maxHeight: 1080, maxFps: 60 },
    hevc: { maxWidth: 1920, maxHeight: 1080, maxFps: 60 }
  },
  uhd: {
    h264: { maxWidth: 3840, maxHeight: 2160, maxFps: 30 },
    hevc: { maxWidth: 3840, maxHeight: 2160, maxFps: 60 },
    vp9: { maxWidth: 3840, maxHeight: 2160, maxFps: 60 },
    av1: { maxWidth: 3840, maxHeight: 2160, maxFps: 60 }
  }
};

function codecFamily(videoCodec) {
  var c = (videoCodec || '').toLowerCase();
  if (c.indexOf('hevc') >= 0 || c.indexOf('h265') >= 0) return 'hevc';
  if (c.indexOf('vp9') >= 0) return 'vp9';
  if (c.indexOf('av1') >= 0) return 'av1';
  return 'h264';
}

/**
 * Max-decode limits for a codec family at a resolution tier.
 * The bitrate ceiling is sourced from the capability matrix; an optional
 * `caps`/deviceInfo selects the webOS-version entry (defaults to latest-known).
 *
 * @param {boolean} isUhd
 * @param {string} family h264 | hevc | vp9 | av1
 * @param {object} [caps] resolved caps, {version,entry}, or raw deviceInfo
 * @returns {{maxWidth?:number, maxHeight?:number, maxFps?:number, maxBitrateKbps:number}}
 */
function getLimits(isUhd, family, caps) {
  var tier = isUhd ? GEOMETRY.uhd : GEOMETRY.fhd;
  var geo = tier[family] || tier.h264;
  // caps == null → matrix resolves to its `default` (latest) entry, whose
  // ceilings match the previous hardcoded table, so numbers are unchanged.
  return {
    maxWidth: geo.maxWidth,
    maxHeight: geo.maxHeight,
    maxFps: geo.maxFps,
    maxBitrateKbps: bitrateCeilingKbps(caps, family, isUhd)
  };
}

function kbpsToMbps(kbps) {
  return Math.round((kbps / 1000) * 10) / 10;
}

function exceedsBitrate(version, deviceInfo) {
  return checkBitrate(version, deviceInfo).exceeds;
}

function checkBitrate(version, deviceInfo) {
  var empty = {
    exceeds: false,
    actualKbps: null,
    limitKbps: null,
    actualMbps: null,
    limitMbps: null,
    message: ''
  };
  if (!version || version.bitrate == null || version.bitrate === '') {
    return {
      exceeds: false,
      unknown: true,
      actualKbps: null,
      limitKbps: null,
      actualMbps: null,
      limitMbps: null,
      message: 'Source bitrate not reported by Plex; direct play is not guaranteed on this TV'
    };
  }

  var kbps = parseInt(version.bitrate, 10);
  if (isNaN(kbps) || kbps <= 0) return empty;

  var isUhd = deviceInfo && deviceInfo.uhd;
  var family = codecFamily(version.videoCodec);
  // Thread deviceInfo into the matrix so per-webOS-version ceilings apply when
  // resolvable; falls back to the latest-known entry otherwise.
  var lim = getLimits(isUhd, family, deviceInfo);
  var limitKbps = lim.maxBitrateKbps;
  var actualMbps = kbpsToMbps(kbps);
  var limitMbps = kbpsToMbps(limitKbps);

  if (kbps <= limitKbps) {
    return {
      exceeds: false,
      actualKbps: kbps,
      limitKbps: limitKbps,
      actualMbps: actualMbps,
      limitMbps: limitMbps,
      message: ''
    };
  }

  return {
    exceeds: true,
    actualKbps: kbps,
    limitKbps: limitKbps,
    actualMbps: actualMbps,
    limitMbps: limitMbps,
    message: 'Direct Play not available: ' + actualMbps + ' Mbps exceeds this TV\'s ' +
      limitMbps + ' Mbps limit (' + family.toUpperCase() + (isUhd ? ', 4K' : ', 1080p') +
      '). Server transcode required.'
  };
}

export { getLimits, codecFamily, kbpsToMbps, exceedsBitrate, checkBitrate };
