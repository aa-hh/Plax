/**
 * Offset policy when advancing the in-player episode queue (Next, Previous, autoplay).
 * Always start the next episode at 0 even if Plex reports a prior partial viewOffset.
 */
function resolveQueueAdvanceOffset() {
  return 0;
}

/**
 * Initial start position for a playback session.
 * Explicit offset (including 0) wins over item / route defaults.
 */
function resolveInitialPlaybackOffset(explicitOffset, itemViewOffset, paramsOffset) {
  if (explicitOffset != null) return explicitOffset;
  return itemViewOffset || paramsOffset || 0;
}

export { resolveQueueAdvanceOffset, resolveInitialPlaybackOffset };
