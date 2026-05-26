/**
 * Serializes playback restarts (flush → stop → session → play) so overlapping
 * async work cannot interleave or call playUrl with a stale session/generation.
 */
function createPlaybackRestartLock() {
  var tail = Promise.resolve();

  function run(task) {
    var next = tail.then(function () {
      return task();
    });
    tail = next.catch(function () {
      /* keep chain alive after rejection */
    });
    return next;
  }

  return { run: run };
}

export { createPlaybackRestartLock };
