/**
 * webOS 4 (Chrome 53) DeviceProfile sent to Jellyfin's PlaybackInfo. Ported from
 * the official jellyfin-web `browser.web0s` branch (proven on real webOS hardware
 * — see docs/jellyfin/integration-research.md Part A) and reconciled to what the
 * B8 actually delivers: mpegts HLS (ts/h264/aac) is the guaranteed transcode path.
 *
 * NOTE: this profile is the contract that decides direct-play vs remux vs transcode.
 * It is conservative-but-capable; the codec set (HEVC level, MKV demux, AC3/EAC3
 * passthrough, fMP4 HLS) needs a round of real-B8 verification to widen safely.
 */
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

export { webos4DeviceProfile };
