/**
 * Player chrome focus-trap helper (extracted for unit testing).
 *
 * When a drawer/panel opens over the player, the bottom controls are trapped at
 * tabindex=-1 so D-pad nav can't reach them behind the modal; on close they're
 * restored. The focusable cache in focus.js is keyed by container and filters
 * out tabindex<0 at capture time, so it MUST be invalidated on every transition
 * — otherwise a list captured while the chrome was trapped (e.g. the focusout
 * watchdog re-homing during a drawer category switch) survives the close and
 * leaves D-pad DOWN from the seek bar with no transport candidate to move to.
 */
import { focusableSelector, invalidateFocusableCache } from '../focus.js';

function setPlayerBottomFocusable(overlay, enabled) {
  var bottom = overlay && overlay.querySelector('.player-bottom');
  if (!bottom) return;
  bottom.querySelectorAll(focusableSelector).forEach(function (el) {
    if (enabled) {
      if (el.dataset.prevTabindex != null) {
        if (el.dataset.prevTabindex === '') el.removeAttribute('tabindex');
        else el.tabIndex = parseInt(el.dataset.prevTabindex, 10);
        delete el.dataset.prevTabindex;
      }
    } else {
      el.dataset.prevTabindex = el.hasAttribute('tabindex') ? String(el.tabIndex) : '';
      el.tabIndex = -1;
    }
  });
  // Keep the focusable cache in lock-step with the trap state — see module doc.
  invalidateFocusableCache();
}

export { setPlayerBottomFocusable };
