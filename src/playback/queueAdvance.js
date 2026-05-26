/**
 * Queue next/prev: flush Plex timeline as stopped, then stop without a second write.
 * Matches restartPlaybackAt / destroy flush-then-skipTimeline contract.
 */
function stopPlaybackForQueueAdvance(player) {
  return player.flushProgress('stopped').catch(function () {
    /* flushProgress already surfaced timeline failure */
  }).then(function () {
    player.stop({ skipTimeline: true });
  });
}

export { stopPlaybackForQueueAdvance };
