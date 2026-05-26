import { timelineStateForFlush } from './timelineSyncState.js';

/**
 * Force-sync Plex timeline (queue advance, destroy, manual flush).
 * Injectable updateProgress for unit tests.
 */
function flushTimelineProgress(options) {
  options = options || {};
  if (!options.session) return Promise.resolve();
  var server = options.session.server;
  var item = options.session.item;
  if (!server || !item || !item.ratingKey) return Promise.resolve();

  var state = timelineStateForFlush(!!options.isPaused, options.explicitState);
  var updateProgress = options.updateProgress;
  if (typeof updateProgress !== 'function') {
    return Promise.reject(new Error('updateProgress required'));
  }

  var extra = options.extra || {};
  if (state === 'stopped') extra.continuing = 0;

  return updateProgress(
    server,
    item.ratingKey,
    options.viewOffsetMs || 0,
    state,
    options.durationMs || 0,
    extra
  ).catch(function (err) {
    if (options.onFailure) {
      try { options.onFailure(err); } catch (e) { /* ignore */ }
    }
    return Promise.reject(err);
  });
}

export { flushTimelineProgress };
