var startupBuildLogged = false;

function nonEmptyText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  var trimmed = value.trim();
  return trimmed || fallback;
}

function formatStartupBuildLine(runtimeBuild) {
  var metadata = runtimeBuild || null;
  var builtAt = metadata ? nonEmptyText(metadata.builtAt, 'unknown-time') : 'unknown-time';
  var commit = metadata ? nonEmptyText(metadata.gitCommit, 'no-git') : 'no-git';
  var summary = metadata ? nonEmptyText(metadata.summary, 'unknown-change-set') : 'build-metadata-missing';
  return '[XPlay Lite] startup-build builtAt=' + builtAt + ' commit=' + commit + ' summary=' + summary;
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

export {
  formatStartupBuildLine,
  logStartupBuild,
  resetStartupBuildLogForTest
};
