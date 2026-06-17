/**
 * Single source of truth for LG webOS TV media capabilities, keyed by webOS
 * generation (major version 4 / 5 / 6, plus a `default` = latest-known).
 *
 * DOM-free and store-free on purpose: no `document`, no `getState`. This keeps
 * the matrix Node-testable and importable from anywhere (resolver takes a plain
 * `deviceInfo` object). The detection logic mirrors `webos.js parseWebOsMajor` /
 * `tvLikelySupportsDtsFromDevice` but is copied here so this module pulls in no
 * DOM-touching dependency.
 *
 * Reference: LG webOS TV A/V specs 4.0 / 5.0 / 6.0 and the existing
 * `lgBitrateLimits.js` ceilings (FHD h264/hevc 40000 kbps; UHD h264 50000,
 * UHD hevc 60000; FHD 60 fps, UHD h264 30 fps / hevc 60 fps).
 */

// --- shared codec/audio tables (avoid drift between generations) ---

var AUDIO_DIRECT_PLAY = ['aac', 'ac3', 'eac3', 'mp3', 'pcm', 'lpcm', 'dca']; // dca = base DTS CORE only
var AUDIO_TRANSCODE_TO = {
  'dca-ma': 'ac3',
  'dca-hi-res': 'ac3',
  'dca-x': 'ac3',
  truehd: 'ac3',
  mlp: 'ac3',
  flac: 'aac',
  opus: 'aac',
  wma: 'aac'
};

var SOFT_TEXT_SUBTITLE_CODECS = ['srt', 'ass', 'ssa', 'subrip', 'webvtt'];
var GRAPHICAL_SUBTITLE_CODECS = ['pgs', 'vobsub', 'dvd_subtitle'];

var H264 = {
  maxLevel: 42,
  profiles: ['baseline', 'main', 'high'],
  fhd: { maxBitrateKbps: 40000, maxFps: 60 },
  uhd: { maxBitrateKbps: 50000, maxFps: 30 }
};

var HEVC = {
  maxLevel: 51,
  profiles: ['main', 'main10'],
  maxBitDepth: 10,
  fhd: { maxBitrateKbps: 40000, maxFps: 60 },
  uhd: { maxBitrateKbps: 60000, maxFps: 60 }
};

// webOS 5+ adds VP9 + AV1.
var VP9 = {
  profiles: ['profile0', 'profile2'],
  maxBitDepth: 10,
  fhd: { maxBitrateKbps: 40000, maxFps: 60 },
  uhd: { maxBitrateKbps: 50000, maxFps: 60 }
};

var AV1 = {
  profiles: ['main'],
  maxBitDepth: 10,
  fhd: { maxBitrateKbps: 40000, maxFps: 60 },
  uhd: { maxBitrateKbps: 50000, maxFps: 60 }
};

function makeAudio() {
  return {
    directPlay: AUDIO_DIRECT_PLAY.slice(),
    transcodeTo: Object.assign({}, AUDIO_TRANSCODE_TO),
    maxChannels: 6
  };
}

function makeSubtitle(defaultDecision) {
  return {
    softTextCodecs: SOFT_TEXT_SUBTITLE_CODECS.slice(),
    graphicalCodecs: GRAPHICAL_SUBTITLE_CODECS.slice(),
    clientRendersText: true,
    defaultDecision: defaultDecision
  };
}

// --- per-generation matrix ---

var MATRIX = {
  4: {
    label: 'webOS 4 (2018)',
    containers: ['mp4', 'mkv', 'ts'],
    video: {
      h264: H264,
      hevc: HEVC
      // webOS 4 has NO vp9 / av1.
    },
    audio: makeAudio(),
    subtitle: makeSubtitle('none'),
    transport: {
      fmp4HlsBroken: true,
      nativeHlsNeedsCodecsPatch: true,
      preferProgressiveHttp: true
    }
  },
  5: {
    label: 'webOS 5 (2020)',
    containers: ['mp4', 'mkv', 'ts'],
    video: {
      h264: H264,
      hevc: HEVC,
      vp9: VP9,
      av1: AV1
    },
    audio: makeAudio(),
    subtitle: makeSubtitle('auto'),
    transport: {
      fmp4HlsBroken: false,
      nativeHlsNeedsCodecsPatch: false,
      preferProgressiveHttp: false
    }
  },
  6: {
    label: 'webOS 6 (2021)',
    containers: ['mp4', 'mkv', 'ts'],
    video: {
      h264: H264,
      hevc: HEVC,
      vp9: VP9,
      av1: AV1
    },
    audio: makeAudio(),
    subtitle: makeSubtitle('auto'),
    transport: {
      fmp4HlsBroken: false,
      nativeHlsNeedsCodecsPatch: false,
      preferProgressiveHttp: false
    }
  }
};

// default = latest-known (same as 6).
MATRIX.default = MATRIX[6];

// --- detection (copied from webos.js to stay DOM-free) ---

var B8_MODEL_RE = /OLED\d{2}[BCEW]8/i;

/**
 * Resolve the webOS major version from a plain deviceInfo object.
 * Precedence: deviceInfo.versionMajor → leading int of deviceInfo.version →
 * B8 model regex (→ 4) → 0 (unknown). versionMajor/version intentionally take
 * precedence over the model regex so a future B-series model on a newer webOS
 * resolves to its real version, not 4.
 *
 * @param {object} deviceInfo
 * @returns {number}
 */
function resolveWebOsMajor(deviceInfo) {
  if (!deviceInfo) return 0;

  // versionMajor is parsed from sdkVersion or deviceInfo.version by webos.js
  // and is now reliable (sdkVersion is the official LG getSystemInfo value).
  if (deviceInfo.versionMajor != null) {
    var vm = parseInt(deviceInfo.versionMajor, 10);
    if (!isNaN(vm) && vm > 0) return vm;
  }

  if (deviceInfo.version) {
    var major = parseInt(String(deviceInfo.version), 10);
    if (!isNaN(major) && major > 0) return major;
  }

  // Fallback: B8 models only shipped with webOS 4.
  var model = String((deviceInfo.model || deviceInfo.modelName) || '');
  if (B8_MODEL_RE.test(model)) return 4;

  return 0;
}

/**
 * Map a resolved major version onto the nearest defined matrix entry.
 * @param {number} major
 * @returns {{version:number, entry:object}}
 */
function entryForMajor(major) {
  if (major === 4) return { version: 4, entry: MATRIX[4] };
  if (major === 5) return { version: 5, entry: MATRIX[5] };
  if (major >= 6) return { version: 6, entry: MATRIX[6] };
  // unknown (0) or anything below 4 → default (latest-known).
  return { version: 6, entry: MATRIX.default };
}

/**
 * @param {object} deviceInfo
 * @returns {{version:number, entry:object, label:string}}
 */
function getDeviceCapabilities(deviceInfo) {
  var major = resolveWebOsMajor(deviceInfo);
  var resolved = entryForMajor(major);
  return {
    version: resolved.version,
    entry: resolved.entry,
    label: resolved.entry.label
  };
}

// --- internal normalizer: accept resolved entry, {version,entry}, or deviceInfo ---

function toEntry(caps) {
  if (!caps) return MATRIX.default;
  // { version, entry, label } shape → use .entry
  if (caps.entry && caps.entry.video) return caps.entry;
  // a resolved matrix entry → has .video
  if (caps.video) return caps;
  // otherwise treat as raw deviceInfo and resolve it.
  return getDeviceCapabilities(caps).entry;
}

// --- accessors ---

function isVideoCodecSupported(caps, codec) {
  var entry = toEntry(caps);
  var c = String(codec || '').toLowerCase();
  if (c === 'h265') c = 'hevc';
  return !!(entry.video && entry.video[c]);
}

function videoCodecKey(codec) {
  var c = String(codec || '').toLowerCase();
  if (c === 'h265') return 'hevc';
  return c;
}

function bitrateCeilingKbps(caps, codec, isUhd) {
  var entry = toEntry(caps);
  var key = videoCodecKey(codec);
  var fam = (entry.video && entry.video[key]) || (entry.video && entry.video.h264);
  if (!fam) return 0;
  var tier = isUhd ? fam.uhd : fam.fhd;
  if (!tier) return 0;
  return tier.maxBitrateKbps;
}

function isAudioDirectPlay(caps, audioCodec) {
  if (audioCodec == null || audioCodec === '') return true;
  var entry = toEntry(caps);
  var c = String(audioCodec).toLowerCase();
  var list = (entry.audio && entry.audio.directPlay) || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].toLowerCase() === c) return true;
  }
  return false;
}

function audioTranscodeTarget(caps, audioCodec) {
  if (audioCodec == null || audioCodec === '') return null;
  var entry = toEntry(caps);
  var c = String(audioCodec).toLowerCase();
  if (isAudioDirectPlay(entry, c)) return null;
  var map = (entry.audio && entry.audio.transcodeTo) || {};
  // case-insensitive lookup
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === c) return map[keys[i]];
  }
  return null;
}

function directPlayAudioCodecList(caps) {
  var entry = toEntry(caps);
  return (entry.audio && entry.audio.directPlay) || [];
}

function transportFlags(caps) {
  return toEntry(caps).transport;
}

function subtitlePolicy(caps) {
  return toEntry(caps).subtitle;
}

export {
  MATRIX,
  getDeviceCapabilities,
  resolveWebOsMajor,
  isVideoCodecSupported,
  bitrateCeilingKbps,
  isAudioDirectPlay,
  audioTranscodeTarget,
  directPlayAudioCodecList,
  transportFlags,
  subtitlePolicy
};
