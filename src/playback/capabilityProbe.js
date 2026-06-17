import { getCodecCapabilities } from '../platform/webos.js';
import { checkBitrate } from './lgBitrateLimits.js';
import {
  getDeviceCapabilities,
  isVideoCodecSupported,
  isAudioDirectPlay,
  audioTranscodeTarget,
  subtitlePolicy
} from './capabilityMatrix.js';

// Map a Plex audio codec string onto the matrix's audio vocabulary. The matrix
// keys plain DTS core as `dca` (its direct-play entry); Plex sometimes reports
// it as `dts`. DTS-HD variants (dca-ma / dca-hi-res / dca-x) are left intact so
// they classify as non-direct-play (audio transcode → ac3).
function normalizeAudioCodec(audioCodec) {
  var c = String(audioCodec || '').toLowerCase();
  if (c === 'dts') return 'dca';
  return c;
}

function isHevcCodec(videoCodec) {
  var c = String(videoCodec || '').toLowerCase();
  return c.indexOf('hevc') >= 0 || c.indexOf('h265') >= 0;
}

function isNativeProgressiveContainer(container) {
  if (!container) return true;
  var c = String(container).toLowerCase();
  // MKV: many LG TVs play MKV progressively when codecs match; remux fallback when needed.
  return c === 'mp4' || c === 'webm' || c === 'mov' || c === 'm4v' || c === 'mkv';
}

function impliesHdrContent(version) {
  if (!version) return false;
  var profile = String(version.videoProfile || '').toLowerCase();
  if (profile.indexOf('hdr') >= 0 || profile.indexOf('hlg') >= 0 ||
      profile.indexOf('main 10') >= 0 || profile.indexOf('main10') >= 0) {
    return true;
  }
  var res = String(version.videoResolution || '').toLowerCase();
  var codec = String(version.videoCodec || '').toLowerCase();
  if ((res.indexOf('4k') >= 0 || res.indexOf('2160') >= 0 || res.indexOf('3840') >= 0) &&
      (codec.indexOf('hevc') >= 0 || codec.indexOf('h265') >= 0) &&
      profile.indexOf('10') >= 0) {
    return true;
  }
  return false;
}

function checkHdrSupport(version, deviceInfo, warnings) {
  if (!impliesHdrContent(version) || !deviceInfo) return;
  if (deviceInfo.hdr10 || deviceInfo.dolbyVision) return;
  warnings.push('HDR content may look dim or incorrect on this TV (no HDR10/Dolby Vision reported)');
}

function codecReported(cap) {
  return !!(cap && cap !== '');
}

function probePlayback(item, version, capabilities, deviceInfo) {
  capabilities = capabilities || getCodecCapabilities(deviceInfo);
  var caps = getDeviceCapabilities(deviceInfo);
  var warnings = [];
  var videoOk = true;
  var audioDirectOk = true;
  var videoCodec = (version && version.videoCodec) || '';
  var audioCodec = (version && version.audioCodec) || '';
  var container = (version && version.container) || '';

  // Video: the matrix knows which codecs the TV decodes (h264 everywhere; hevc
  // everywhere; vp9/av1 on webOS 5+). HEVC additionally needs the browser probe
  // to confirm the Chromium build advertises it — keep that runtime gate so a
  // probe miss blocks both direct play and direct stream.
  if (isHevcCodec(videoCodec)) {
    var hevcSupported = isVideoCodecSupported(caps, 'hevc') && codecReported(capabilities.hevc);
    if (!hevcSupported) {
      videoOk = false;
      warnings.push('HEVC may require transcode on this TV');
    }
  }

  // Audio: the matrix is the spec source of truth for direct-play vs transcode.
  // For codecs it deems direct-playable but whose runtime decode is probe-gated
  // (dts/eac3/ac3), keep consulting the browser canPlayType probe + inferred
  // hardware flags so existing device behavior is unchanged.
  var normalizedAudio = normalizeAudioCodec(audioCodec);
  if (audioCodec) {
    if (!isAudioDirectPlay(caps, normalizedAudio)) {
      audioDirectOk = false;
      if (normalizedAudio.indexOf('dca') >= 0) {
        warnings.push('DTS audio may require server transcode');
      } else if (normalizedAudio.indexOf('truehd') >= 0 || normalizedAudio.indexOf('mlp') >= 0) {
        warnings.push('TrueHD audio requires server transcode on LG TVs');
      } else {
        var target = audioTranscodeTarget(caps, normalizedAudio);
        warnings.push(target
          ? 'Audio requires server transcode to ' + String(target).toUpperCase() + ' on this TV'
          : 'Audio codec may require server transcode on this TV');
      }
    } else if (normalizedAudio.indexOf('dca') >= 0) {
      if (!codecReported(capabilities.dts)) {
        audioDirectOk = false;
        warnings.push('DTS audio may require server transcode');
      } else if (capabilities.dtsInferred) {
        warnings.push('DTS: TV hardware profile (browser probe inconclusive)');
      }
    } else if (normalizedAudio.indexOf('eac3') >= 0) {
      if (!codecReported(capabilities.eac3)) {
        audioDirectOk = false;
        warnings.push('E-AC-3 (DD+) audio may require remux or transcode on this device');
      } else if (capabilities.eac3Inferred) {
        warnings.push('E-AC-3: TV hardware profile (browser probe inconclusive)');
      }
    } else if (normalizedAudio.indexOf('ac3') >= 0) {
      if (!codecReported(capabilities.ac3)) {
        audioDirectOk = false;
        warnings.push('AC-3 (Dolby Digital) audio may require remux or transcode on this device');
      } else if (capabilities.ac3Inferred) {
        warnings.push('AC-3: TV hardware profile (browser probe inconclusive)');
      }
    }
  }

  checkHdrSupport(version, deviceInfo, warnings);

  var bitrateCheck = checkBitrate(version, deviceInfo);
  var bitrateBlocks = bitrateCheck.exceeds;
  var bitrateUnknown = !!bitrateCheck.unknown;

  if (bitrateUnknown) {
    warnings.push(bitrateCheck.message || 'Source bitrate unknown; direct play may require transcode');
  }

  var progressiveOk = isNativeProgressiveContainer(container);
  var canDirectPlay = videoOk && audioDirectOk && progressiveOk && !bitrateBlocks && !bitrateUnknown;
  var canDirectStream = videoOk && !bitrateBlocks;

  if (videoOk && !bitrateBlocks && !progressiveOk) {
    warnings.push('Container will use direct stream (HLS remux) on this TV');
  } else if (videoOk && !bitrateBlocks && String(container).toLowerCase() === 'mkv') {
    warnings.push('MKV may direct play on this TV; remux will be tried if playback fails');
  }
  if (!audioDirectOk && canDirectStream && !bitrateBlocks) {
    warnings.push('HLS remux or transcode may be used when audio is not direct-playable');
  }

  return {
    canDirectPlay: canDirectPlay,
    canDirectStream: canDirectStream,
    warnings: warnings,
    bitrateCheck: bitrateCheck,
    capabilities: capabilities
  };
}

// Graphical (bitmap) subtitle codecs come from the matrix's single source of
// truth (subtitle.graphicalCodecs). Codec-graphicalness is version-independent,
// so resolve with no deviceInfo → the default matrix entry. We substring-match
// each matrix token against the codec name (pgs, vobsub, dvd_subtitle) so codec
// strings like "hdmv_pgs_subtitle" or "dvd_subtitle" still classify correctly.
var GRAPHICAL_SUBTITLE_MATCHERS = (subtitlePolicy().graphicalCodecs || []).map(
  function (codec) {
    // dvd_subtitle → match on the "dvd" stem to keep prior substring behavior.
    return String(codec).toLowerCase().indexOf('dvd') === 0
      ? 'dvd'
      : String(codec).toLowerCase();
  }
);

function isGraphicalSubtitle(codec) {
  if (!codec) return false;
  var c = String(codec).toLowerCase();
  for (var i = 0; i < GRAPHICAL_SUBTITLE_MATCHERS.length; i++) {
    if (c.indexOf(GRAPHICAL_SUBTITLE_MATCHERS[i]) >= 0) return true;
  }
  return false;
}

export { probePlayback, isGraphicalSubtitle };
