import { getCodecCapabilities } from '../platform/webos.js';
import { checkBitrate } from './lgBitrateLimits.js';

function isNativeProgressiveContainer(container) {
  if (!container) return true;
  var c = String(container).toLowerCase();
  // MKV: many LG TVs play MKV progressively when codecs match; Auto still falls back to remux.
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
  var warnings = [];
  var videoOk = true;
  var audioDirectOk = true;
  var videoCodec = (version && version.videoCodec) || '';
  var audioCodec = (version && version.audioCodec) || '';
  var container = (version && version.container) || '';

  if (videoCodec.indexOf('hevc') >= 0 || videoCodec.indexOf('h265') >= 0) {
    if (!codecReported(capabilities.hevc)) {
      videoOk = false;
      warnings.push('HEVC may require transcode on this TV');
    }
  }
  if (audioCodec.indexOf('dca') >= 0 || audioCodec.indexOf('dts') >= 0) {
    if (!codecReported(capabilities.dts)) {
      audioDirectOk = false;
      warnings.push('DTS audio may require server transcode');
    } else if (capabilities.dtsInferred) {
      warnings.push('DTS: TV hardware profile (browser probe inconclusive)');
    }
  }
  if (audioCodec.indexOf('ac3') >= 0 || audioCodec.indexOf('eac3') >= 0) {
    var ac = audioCodec.indexOf('eac3') >= 0 ? capabilities.eac3 : capabilities.ac3;
    if (!ac) warnings.push('Dolby audio support varies by model');
  }

  checkHdrSupport(version, deviceInfo, warnings);

  var bitrateCheck = checkBitrate(version, deviceInfo);
  var bitrateBlocks = bitrateCheck.exceeds;

  var progressiveOk = isNativeProgressiveContainer(container);
  var canDirectPlay = videoOk && audioDirectOk && progressiveOk && !bitrateBlocks;
  var canDirectStream = videoOk && !bitrateBlocks;

  if (videoOk && !bitrateBlocks && !progressiveOk) {
    warnings.push('Container will use direct stream (HLS remux) on this TV');
  } else if (videoOk && !bitrateBlocks && String(container).toLowerCase() === 'mkv') {
    warnings.push('MKV may direct play on this TV; Auto will try remux if playback fails');
  }
  if (!audioDirectOk && canDirectStream && !bitrateBlocks) {
    warnings.push('Auto can use HLS remux or transcode when DTS is not direct-playable');
  }

  return {
    canDirectPlay: canDirectPlay,
    canDirectStream: canDirectStream,
    warnings: warnings,
    bitrateCheck: bitrateCheck,
    capabilities: capabilities
  };
}

function isGraphicalSubtitle(codec) {
  if (!codec) return false;
  var c = codec.toLowerCase();
  return c.indexOf('pgs') >= 0 || c.indexOf('vobsub') >= 0 || c.indexOf('dvd') >= 0;
}

export { probePlayback, isGraphicalSubtitle };
