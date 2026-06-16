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

/**
 * Parse PMS `/transcode/universal/decision` XML into playback hints.
 * Regex-based so Node tests and browsers behave the same.
 * @returns {{ resourceSession: string|null, part: { decision: string, protocol: string|null }|null }}
 */
function parseTranscodeDecision(xmlText, session) {
  session = session || {};
  var text = String(xmlText || '');
  var resourceSession = extractResourceSession(text, null);
  var partTags = text.match(/<Part\b[^>]*\/?>/gi);
  if (!partTags || !partTags.length) {
    return { resourceSession: resourceSession, part: null };
  }

  var partIndex = session.partIndex != null ? session.partIndex : 0;
  var partTag = partTags[partIndex] || partTags[0];
  var decision = (readXmlAttr(partTag, 'decision') || '').toLowerCase();
  if (!decision) {
    return { resourceSession: resourceSession, part: null };
  }

  return {
    resourceSession: resourceSession,
    part: {
      decision: decision,
      protocol: readXmlAttr(partTag, 'protocol') || null
    }
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
