/**
 * LG webOS TV maximum decode bitrates (webOS TV 5.0 AV spec).
 * https://webostv.developer.lge.com/develop/specifications/video-audio-50
 */
var LIMITS = {
  fhd: {
    h264: { maxWidth: 1920, maxHeight: 1080, maxFps: 60, maxBitrateKbps: 40000 },
    hevc: { maxWidth: 1920, maxHeight: 1080, maxFps: 60, maxBitrateKbps: 40000 }
  },
  uhd: {
    h264: { maxWidth: 3840, maxHeight: 2160, maxFps: 30, maxBitrateKbps: 50000 },
    hevc: { maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxBitrateKbps: 60000 },
    vp9: { maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxBitrateKbps: 50000 },
    av1: { maxWidth: 3840, maxHeight: 2160, maxFps: 60, maxBitrateKbps: 50000 }
  }
};

function codecFamily(videoCodec) {
  var c = (videoCodec || '').toLowerCase();
  if (c.indexOf('hevc') >= 0 || c.indexOf('h265') >= 0) return 'hevc';
  if (c.indexOf('vp9') >= 0) return 'vp9';
  if (c.indexOf('av1') >= 0) return 'av1';
  return 'h264';
}

function getLimits(isUhd, family) {
  var tier = isUhd ? LIMITS.uhd : LIMITS.fhd;
  return tier[family] || tier.h264;
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
  var lim = getLimits(isUhd, family);
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

export { LIMITS, getLimits, codecFamily, kbpsToMbps, exceedsBitrate, checkBitrate };
