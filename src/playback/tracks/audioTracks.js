import { collectStreamsFromMedia } from './streamUtils.js';

function parseAudioStreams(media) {
  return collectStreamsFromMedia(media, 2).map(function (s, i) {
    return {
      id: s.id,
      index: s.index,
      language: s.language || s.languageCode,
      codec: s.codec,
      channels: s.channels,
      title: s.title || s.language || ('Track ' + (i + 1)),
      selected: s.selected === '1'
    };
  });
}

function buildAudioTranscodeParam(streamId) {
  if (streamId == null) return {};
  return { 'X-Plex-Auto-Audio-Stream': '0', 'X-Plex-Audio-Stream': String(streamId) };
}

export { parseAudioStreams, buildAudioTranscodeParam };
