/**
 * Guards async playback restarts: a captured generation is stale after bump().
 */
function isStalePlaybackGeneration(capturedGeneration, currentGeneration) {
  return capturedGeneration !== currentGeneration;
}

function createPlaybackGenerationCounter() {
  var generation = 0;
  return {
    bump: function () {
      generation += 1;
      return generation;
    },
    current: function () {
      return generation;
    },
    isStale: function (captured) {
      return isStalePlaybackGeneration(captured, generation);
    }
  };
}

export { isStalePlaybackGeneration, createPlaybackGenerationCounter };
