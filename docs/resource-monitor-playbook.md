# Resource Monitoring Playbook

Use this playbook with LG's [Resource Monitor](https://webostv.developer.lge.com/develop/tools/resource-monitor-introduction) to find performance bottlenecks in XPlay Lite.

## 1) Run the app in Simulator

```bash
cd "XPlay 2"
npm run sim:23
```

Use the simulator version that matches your target TV generation.

## 2) Enable in-app perf markers

XPlay Lite includes lightweight telemetry (boot marks, route render time, heap snapshot, video buffer/dropped-frame stats).

Enable it once in Web Inspector console:

```js
localStorage.setItem('xplay_perf_enabled', '1');
location.reload();
```

Inspect runtime stats:

```js
window.__xplayPerf.getSnapshot();
window.__xplayPerf.exportData(); // full samples + marks
```

Perf mode now also shows an on-screen HUD (top-right) with:

- current route
- heap used/total MB (when available)
- video buffer-ahead (sec)
- dropped/total frames (when available)
- playback time

HUD controls (only while perf mode is enabled):

- Press `H` (keyCode `72`) to toggle HUD visibility.
- Enable directly from URL with `?perf=1` or keep using `localStorage.xplay_perf_enabled=1`.

Disable:

```js
localStorage.removeItem('xplay_perf_enabled');
location.reload();
```

## 3) Resource Monitor scenarios

Record app + system metrics (CPU, memory) for these repeatable scenarios:

1. **Cold boot**: launch app -> first screen rendered.
2. **Pairing flow**: QR/pin screen idle 60s.
3. **Home browse**: load promoted hubs, move through 3 rows.
4. **Library grid**: open large library, scroll continuously for 2 minutes.
5. **Detail open/close**: open 20 random items then back.
6. **Playback direct**: start 1080p direct play, seek +-15s repeatedly.
7. **Playback transcode HLS**: force lower quality, watch 5 minutes.
8. **Rebuffer path**: throttle network to trigger buffering fallback.
9. **Episode queue autoplay**: play through 3 episodes.
10. **Search**: run 10 searches in sequence.

For each scenario, save a Resource Monitor capture and export `window.__xplayPerf.exportData()`.

## 4) Improvement thresholds

- **Boot route render** (`route:render` marks):
  - target < 120ms for `home`, < 150ms for `library` with cached hubs.
- **Heap growth** (`samples[].heap.used`):
  - should stabilize after 3-5 minutes of browsing; no unbounded climb.
- **Playback buffer ahead** (`samples[].video.bufferAheadSec`):
  - should stay > 5s on stable LAN.
- **Dropped frames** (`samples[].video.droppedFrames`):
  - should not increase rapidly during steady playback.

## 5) Known hotspots to monitor

- Poster row rendering in library/home grids.
- Repeated metadata/detail opens.
- Hub refresh intervals and cache invalidation churn.
- Playback fallback transitions (direct -> HLS -> HTTP).

## 6) Notes

- No Service Worker caching is used (intentional for webOS compatibility).
- Sampling is intentionally lightweight (5s interval) and disabled by default.
