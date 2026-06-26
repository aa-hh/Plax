/**
 * webOS 4 (Chrome 53) DeviceProfile sent to Jellyfin's PlaybackInfo. Ported from
 * the official jellyfin-web `browser.web0s` branch (proven on real webOS hardware
 * — see docs/jellyfin/integration-research.md Part A) and reconciled to what the
 * B8 actually delivers: mpegts HLS (ts/h264/aac) is the guaranteed transcode path.
 *
 * This object stays the FROZEN webOS 4 baseline (proven on the B8). For newer
 * webOS, `buildJellyfinDeviceProfile()` clones it and widens the transport/codecs
 * per the capability matrix (fMP4 HLS instead of mpegts so HEVC/AV1 can remux into
 * HLS; VP9/AV1 direct play) — without re-deriving the hard-won webOS4 grammar.
 */
import { getState } from '../../core/store.js';
import {
  getDeviceCapabilities,
  transportFlags,
  isVideoCodecSupported
} from '../../playback/capabilityMatrix.js';

var webos4DeviceProfile = {
  MaxStreamingBitrate: 120000000,
  MaxStaticBitrate: 100000000,
  MusicStreamingTranscodingBitrate: 384000,

  DirectPlayProfiles: [
    {
      Container: 'mp4,m4v',
      Type: 'Video',
      VideoCodec: 'h264,hevc,mpeg2video,vc1',
      AudioCodec: 'aac,mp3,ac3,eac3,mp2,flac'
    },
    {
      Container: 'mkv',
      Type: 'Video',
      VideoCodec: 'h264,hevc,mpeg2video,vc1',
      AudioCodec: 'aac,mp3,ac3,eac3,mp2,flac'
    },
    { Container: 'aac', Type: 'Audio' },
    { Container: 'mp3', Type: 'Audio' },
    { Container: 'flac', Type: 'Audio' },
    { Container: 'webma', Type: 'Audio' },
    { Container: 'wav', Type: 'Audio' }
  ],

  TranscodingProfiles: [
    // The B8-proven baseline: mpegts HLS, H.264 + AAC/AC3/EAC3.
    {
      Container: 'ts',
      Type: 'Video',
      VideoCodec: 'h264',
      AudioCodec: 'aac,ac3,eac3,mp3',
      Protocol: 'hls',
      Context: 'Streaming',
      MaxAudioChannels: '6',
      MinSegments: '1',
      BreakOnNonKeyFrames: true
    },
    {
      Container: 'aac',
      Type: 'Audio',
      AudioCodec: 'aac',
      Protocol: 'http',
      Context: 'Streaming',
      MaxAudioChannels: '2'
    }
  ],

  CodecProfiles: [
    {
      Type: 'Video',
      Codec: 'h264',
      Conditions: [
        { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'high|main|baseline|constrained baseline', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '51', IsRequired: false }
      ]
    },
    {
      Type: 'Video',
      Codec: 'hevc',
      Conditions: [
        { Condition: 'EqualsAny', Property: 'VideoProfile', Value: 'main|main 10', IsRequired: false },
        { Condition: 'EqualsAny', Property: 'VideoRangeType', Value: 'SDR', IsRequired: false },
        { Condition: 'LessThanEqual', Property: 'VideoLevel', Value: '153', IsRequired: false }
      ]
    }
  ],

  // Text subs delivered as sidecars; image subs (PGS/VOBSUB) are intentionally
  // omitted so they only burn in (transcode) on explicit selection — never auto.
  SubtitleProfiles: [
    { Format: 'vtt', Method: 'External' },
    { Format: 'subrip', Method: 'External' },
    { Format: 'srt', Method: 'External' },
    { Format: 'ass', Method: 'External' },
    { Format: 'ssa', Method: 'External' }
  ],

  ResponseProfiles: [
    { Type: 'Video', Container: 'm4v', MimeType: 'video/mp4' }
  ]
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Append codecs to a comma list without duplicating. */
function addCodecs(list, extras) {
  var have = String(list || '').split(',').filter(Boolean);
  extras.forEach(function (c) { if (have.indexOf(c) < 0) have.push(c); });
  return have.join(',');
}

/**
 * DeviceProfile for the active (or given) webOS device. webOS 4 returns the frozen
 * baseline verbatim (mpegts HLS — fMP4 is broken on the B8). Newer webOS, per the
 * capability matrix, switches the HLS transcode container to fMP4 (so the server
 * can REMUX HEVC/AV1 into HLS instead of re-encoding to H.264) and adds VP9/AV1 to
 * direct play. Levels/profiles/audio stay in the proven webOS4 grammar.
 */
function buildJellyfinDeviceProfile(deviceInfo) {
  deviceInfo = deviceInfo || (typeof getState === 'function' && getState() && getState().deviceInfo) || {};
  var caps = getDeviceCapabilities(deviceInfo);
  var transport = transportFlags(caps) || {};

  // webOS 4 (fMP4 HLS broken) → frozen baseline, byte-identical behaviour.
  if (transport.fmp4HlsBroken) return deepClone(webos4DeviceProfile);

  var profile = deepClone(webos4DeviceProfile);
  var extraVideo = [];
  if (isVideoCodecSupported(caps, 'vp9')) extraVideo.push('vp9');
  if (isVideoCodecSupported(caps, 'av1')) extraVideo.push('av1');

  // Direct play: advertise VP9/AV1 too so matching files play untouched.
  profile.DirectPlayProfiles.forEach(function (p) {
    if (p.Type === 'Video' && p.VideoCodec) p.VideoCodec = addCodecs(p.VideoCodec, extraVideo);
  });

  // HLS transcode/remux: fMP4 container (not mpegts) + allow HEVC so the server
  // copies HEVC video and only repackages/transcodes audio when needed, instead
  // of a full H.264 re-encode. H.264 stays for the genuine transcode fallback.
  profile.TranscodingProfiles.forEach(function (p) {
    if (p.Type === 'Video' && String(p.Protocol).toLowerCase() === 'hls') {
      p.Container = 'mp4';
      p.VideoCodec = addCodecs(p.VideoCodec, ['hevc']);
    }
  });

  return profile;
}

export { webos4DeviceProfile, buildJellyfinDeviceProfile };
