var startupBuildLogged = false;

function nonEmptyText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  var trimmed = value.trim();
  return trimmed || fallback;
}

function formatBuildNumber(value) {
  var parsed = Number(value);
  if (!isFinite(parsed)) return 'unknown-build';
  if (parsed < 1) return 'unknown-build';
  return String(Math.floor(parsed));
}

function formatStartupBuildLine(runtimeBuild) {
  var metadata = runtimeBuild || null;
  var buildNumber = metadata ? formatBuildNumber(metadata.buildNumber) : 'unknown-build';
  var builtAt = metadata ? nonEmptyText(metadata.builtAt, 'unknown-time') : 'unknown-time';
  var commit = metadata ? nonEmptyText(metadata.gitCommit, 'no-git') : 'no-git';
  var summary = metadata ? nonEmptyText(metadata.summary, 'unknown-change-set') : 'build-metadata-missing';
  return '[XPlay Lite] startup-build buildNumber=' + buildNumber +
    ' builtAt=' + builtAt +
    ' commit=' + commit +
    ' summary=' + summary;
}

function logStartupBuild(globalObject) {
  if (startupBuildLogged) return;
  startupBuildLogged = true;
  var runtimeBuild = globalObject && globalObject.__XPLAY_BUILD__
    ? globalObject.__XPLAY_BUILD__
    : null;
  console.info(formatStartupBuildLine(runtimeBuild));
}

function resetStartupBuildLogForTest() {
  startupBuildLogged = false;
}

/**
 * Pull the Chromium major version out of a webOS user-agent string.
 * webOS engine → Chromium: 4.0 ≈ 53, 4.5/5.0 ≈ 68, 6.0 ≈ 79, 22 ≈ 87.
 * Returns 0 when no Chrome/Chromium token is present.
 */
function parseChromiumMajor(userAgent) {
  if (typeof userAgent !== 'string') return 0;
  var match = userAgent.match(/Chrom(?:e|ium)\/(\d+)/i);
  if (!match) return 0;
  var major = parseInt(match[1], 10);
  return isNaN(major) ? 0 : major;
}

export {
  formatStartupBuildLine,
  logStartupBuild,
  parseChromiumMajor,
  resetStartupBuildLogForTest
};
