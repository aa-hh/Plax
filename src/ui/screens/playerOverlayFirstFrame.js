/**
 * Overlay auto-hide is deferred until the first decoded frame so mount/show
 * does not start the hide timer before video is visible.
 */

function shouldScheduleOverlayHideWhenShowing(hideAfterFirstFrame) {
  return !!hideAfterFirstFrame;
}

/**
 * @returns {{ hideAfterFirstFrame: true, scheduleHide: boolean }}
 */
function onPlaybackFirstFrame(hideAfterFirstFrame) {
  if (hideAfterFirstFrame) {
    return { hideAfterFirstFrame: true, scheduleHide: false };
  }
  return { hideAfterFirstFrame: true, scheduleHide: true };
}

export { shouldScheduleOverlayHideWhenShowing, onPlaybackFirstFrame };
