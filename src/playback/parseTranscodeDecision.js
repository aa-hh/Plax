function extractResourceSession(xmlText, containerAttrs) {
  if (containerAttrs && containerAttrs.resourceSession) {
    return containerAttrs.resourceSession;
  }
  if (!xmlText) return null;
  var match = String(xmlText).match(/\bresourceSession=(["'])(.*?)\1/);
  return match && match[2] ? match[2] : null;
}

function readXmlAttr(tag, name) {
  if (!tag) return null;
  var re = new RegExp('\\b' + name + '=(["\'])(.*?)\\1', 'i');
  var hit = String(tag).match(re);
  return hit ? hit[2] : null;
}

/** Plex Stream@streamType: 1=video, 2=audio, 3=subtitle. */
function streamKindName(streamType) {
  if (streamType === '1' || streamType === 1) return 'video';
  if (streamType === '2' || streamType === 2) return 'audio';
  if (streamType === '3' || streamType === 3) return 'subtitle';
  return null;
}

function isBurnAttr(value) {
  return value === '1' || value === 1 || value === 'true';
}

/** Parse each <Stream> tag into a normalized decision descriptor. */
function parseStreamDecisions(text) {
  var tags = text.match(/<Stream\b[^>]*\/?>/gi) || [];
  var streams = [];
  for (var i = 0; i < tags.length; i++) {
    var tag = tags[i];
    var streamType = readXmlAttr(tag, 'streamType');
    var burn = isBurnAttr(readXmlAttr(tag, 'burn'));
    streams.push({
      streamType: streamType != null ? parseInt(streamType, 10) : null,
      kind: streamKindName(streamType),
      codec: readXmlAttr(tag, 'codec') || null,
      decision: (readXmlAttr(tag, 'decision') || '').toLowerCase() || null,
      decisionText: readXmlAttr(tag, 'decisionText') || null,
      burn: burn
    });
  }
  return streams;
}

function decisionForKind(streams, kind) {
  for (var i = 0; i < streams.length; i++) {
    if (streams[i].kind === kind && streams[i].decision) return streams[i].decision;
  }
  return null;
}

/** A subtitle is burned when burn="1" or its decision text says "burn". */
function anySubtitleBurned(streams) {
  for (var i = 0; i < streams.length; i++) {
    var s = streams[i];
    if (s.kind !== 'subtitle') continue;
    if (s.burn) return true;
    if (s.decision === 'burn') return true;
    if (s.decisionText && /\bburn/i.test(s.decisionText)) return true;
  }
  return false;
}

/** First transcodeReason / decisionText at the Video or Part level, if present. */
function extractTranscodeReason(text, partTag) {
  var fromPart = partTag &&
    (readXmlAttr(partTag, 'transcodeReason') || readXmlAttr(partTag, 'decisionText'));
  if (fromPart) return fromPart;
  var videoTag = (text.match(/<Video\b[^>]*>/i) || [])[0];
  if (videoTag) {
    var fromVideo = readXmlAttr(videoTag, 'transcodeReason') ||
      readXmlAttr(videoTag, 'mdeDecisionText') ||
      readXmlAttr(videoTag, 'transcodeDecisionText');
    if (fromVideo) return fromVideo;
  }
  return null;
}

/**
 * Parse PMS `/transcode/universal/decision` XML into playback hints.
 * Regex-based so Node tests and browsers behave the same.
 * @returns {{
 *   resourceSession: string|null,
 *   part: { decision: string, protocol: string|null }|null,
 *   streams: Array<{streamType:number|null, kind:string|null, codec:string|null,
 *     decision:string|null, decisionText:string|null, burn:boolean}>,
 *   videoDecision: string|null,
 *   audioDecision: string|null,
 *   subtitleBurned: boolean,
 *   transcodeReason: string|null
 * }}
 */
function parseTranscodeDecision(xmlText, session) {
  session = session || {};
  var text = String(xmlText || '');
  var resourceSession = extractResourceSession(text, null);
  var streams = parseStreamDecisions(text);
  var videoDecision = decisionForKind(streams, 'video');
  var audioDecision = decisionForKind(streams, 'audio');
  var subtitleBurned = anySubtitleBurned(streams);

  var partTags = text.match(/<Part\b[^>]*\/?>/gi);
  if (!partTags || !partTags.length) {
    return {
      resourceSession: resourceSession,
      part: null,
      streams: streams,
      videoDecision: videoDecision,
      audioDecision: audioDecision,
      subtitleBurned: subtitleBurned,
      transcodeReason: extractTranscodeReason(text, null)
    };
  }

  var partIndex = session.partIndex != null ? session.partIndex : 0;
  var partTag = partTags[partIndex] || partTags[0];
  var transcodeReason = extractTranscodeReason(text, partTag);
  var decision = (readXmlAttr(partTag, 'decision') || '').toLowerCase();
  if (!decision) {
    return {
      resourceSession: resourceSession,
      part: null,
      streams: streams,
      videoDecision: videoDecision,
      audioDecision: audioDecision,
      subtitleBurned: subtitleBurned,
      transcodeReason: transcodeReason
    };
  }

  return {
    resourceSession: resourceSession,
    part: {
      decision: decision,
      protocol: readXmlAttr(partTag, 'protocol') || null
    },
    streams: streams,
    videoDecision: videoDecision,
    audioDecision: audioDecision,
    subtitleBurned: subtitleBurned,
    transcodeReason: transcodeReason
  };
}

/** Map Part@decision to XPlay playback strategy. */
function strategyFromPartDecision(partDecision) {
  var d = String(partDecision || '').toLowerCase();
  if (d === 'directplay') return 'direct';
  if (d === 'copy') return 'direct-stream';
  return 'transcode';
}

export {
  parseTranscodeDecision,
  strategyFromPartDecision,
  extractResourceSession
};
