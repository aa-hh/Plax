/**
 * Shared helpers for build stamps (write-build-stamp.cjs, sim-launch.cjs).
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var TRACK_ROOTS = ['src', 'index.html', 'appinfo.json', 'build/rollup.config.js'];

var AREA_RULES = [
  { re: /profilePicker|profile-picker/i, area: 'profile-picker' },
  { re: /\/pinEntry|pinAuth/i, area: 'pin-auth' },
  { re: /\/focus\.js|focus-nav/i, area: 'focus' },
  { re: /playerScreen|playerAdapter|\/playback\//i, area: 'player' },
  { re: /pairingScreen|pinAuth/i, area: 'pairing' },
  { re: /appBootstrap/i, area: 'bootstrap' },
  { re: /homeScreen/i, area: 'home' },
  { re: /libraryScreen/i, area: 'library' },
  { re: /detailScreen/i, area: 'detail' },
  { re: /settingsScreen/i, area: 'settings' },
  { re: /searchScreen/i, area: 'search' },
  { re: /watchlistScreen/i, area: 'watchlist' },
  { re: /spinner\.js/i, area: 'spinner' },
  { re: /motionCursor/i, area: 'motion-cursor' },
  { re: /webos/i, area: 'platform' },
  { re: /app\.css/i, area: 'styles' },
  { re: /\/core\//i, area: 'core' },
  { re: /\/plex\//i, area: 'plex' },
  { re: /\/ui\//i, area: 'ui' },
  { re: /\/test\//i, area: 'tests' }
];

function execGit(args, projectRoot) {
  try {
    return cp.execSync('git ' + args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return '';
  }
}

function getGitInfo(projectRoot) {
  var inside = execGit('rev-parse --is-inside-work-tree', projectRoot);
  if (inside !== 'true') return { available: false };
  var commit = execGit('rev-parse --short HEAD', projectRoot);
  var branch = execGit('branch --show-current', projectRoot);
  var dirty = execGit('status --porcelain', projectRoot).length > 0;
  return {
    available: true,
    commit: commit || null,
    branch: branch || null,
    dirty: dirty
  };
}

function isTrackableFile(filePath) {
  return /\.(js|css|mjs|json|html)$/.test(filePath);
}

function collectTrackableFiles(projectRoot) {
  var files = [];
  function walk(rel) {
    var abs = path.join(projectRoot, rel);
    var st;
    try { st = fs.statSync(abs); } catch (_) { return; }
    if (st.isFile()) {
      if (isTrackableFile(rel)) files.push(rel.replace(/\\/g, '/'));
      return;
    }
    if (!st.isDirectory()) return;
    var entries;
    try { entries = fs.readdirSync(abs); } catch (_) { return; }
    for (var i = 0; i < entries.length; i++) {
      if (entries[i] === 'node_modules' || entries[i] === '.git') continue;
      walk(path.join(rel, entries[i]).replace(/\\/g, '/'));
    }
  }
  for (var r = 0; r < TRACK_ROOTS.length; r++) {
    walk(TRACK_ROOTS[r]);
  }
  files.sort();
  return files;
}

function fingerprintFile(absPath) {
  var st = fs.statSync(absPath);
  return { mtimeMs: st.mtimeMs, size: st.size };
}

function collectFingerprints(projectRoot) {
  var relFiles = collectTrackableFiles(projectRoot);
  var map = {};
  for (var i = 0; i < relFiles.length; i++) {
    var rel = relFiles[i];
    map[rel] = fingerprintFile(path.join(projectRoot, rel));
  }
  return map;
}

function diffFingerprints(prev, curr) {
  prev = prev || {};
  curr = curr || {};
  var changed = [];
  var added = [];
  var removed = [];
  var keys = Object.keys(curr);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!prev[k]) {
      added.push(k);
      continue;
    }
    if (prev[k].mtimeMs !== curr[k].mtimeMs || prev[k].size !== curr[k].size) {
      changed.push(k);
    }
  }
  var prevKeys = Object.keys(prev);
  for (var j = 0; j < prevKeys.length; j++) {
    if (!curr[prevKeys[j]]) removed.push(prevKeys[j]);
  }
  return {
    changedFiles: changed.concat(added).sort(),
    addedFiles: added.sort(),
    removedFiles: removed.sort()
  };
}

function basenameList(files, max) {
  max = max || 8;
  return files.slice(0, max).map(function (f) {
    return path.basename(f);
  });
}

function areaForFile(relPath) {
  for (var i = 0; i < AREA_RULES.length; i++) {
    if (AREA_RULES[i].re.test(relPath)) return AREA_RULES[i].area;
  }
  return 'other';
}

function summarizeChanges(diff, fingerprints, options) {
  options = options || {};
  var allChanged = diff.changedFiles.concat(diff.addedFiles);
  var removed = diff.removedFiles || [];
  var totalTracked = fingerprints ? Object.keys(fingerprints).length : 0;

  if (options.initialBuild) {
    return {
      summary: 'initial build (' + totalTracked + ' source files tracked)',
      changedAreas: [],
      initialBuild: true
    };
  }

  if (!allChanged.length && !removed.length) {
    return {
      summary: 'unchanged since last build',
      changedAreas: [],
      initialBuild: false
    };
  }

  var areaSet = {};
  for (var i = 0; i < allChanged.length; i++) {
    areaSet[areaForFile(allChanged[i])] = true;
  }
  var areas = Object.keys(areaSet).sort();
  var n = allChanged.length + removed.length;
  var summary = areas.join(', ');
  if (n > 1) summary += ' (' + n + ' files)';
  else if (n === 1) summary += ' (1 file)';

  return {
    summary: summary,
    changedAreas: areas,
    initialBuild: false
  };
}

function readLastStamp(projectRoot) {
  var lastPath = path.join(projectRoot, '.build-last-stamp.json');
  if (!fs.existsSync(lastPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lastPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeLastStamp(projectRoot, data) {
  fs.writeFileSync(
    path.join(projectRoot, '.build-last-stamp.json'),
    JSON.stringify(data, null, 2) + '\n'
  );
}

function formatStampLine(stamp) {
  if (!stamp) return 'Build: (no stamp — run npm run build)';
  var parts = ['Build @ ' + stamp.builtAt];
  if (stamp.gitCommit) {
    parts.push(stamp.gitCommit + (stamp.gitDirty ? '*' : ''));
    if (stamp.gitBranch) parts.push('on ' + stamp.gitBranch);
  }
  parts.push('— ' + (stamp.summary || 'unknown'));
  return parts.join(' ');
}

function formatStampDetail(stamp, opts) {
  opts = opts || {};
  var lines = [formatStampLine(stamp)];
  if (!stamp) return lines;

  if (stamp.initialBuild && stamp.trackedFileCount) {
    lines.push('  First stamped build; tracking ' + stamp.trackedFileCount + ' inputs.');
    return lines;
  }

  var changed = stamp.changedFiles || [];
  if (changed.length) {
    var names = basenameList(changed, opts.maxFiles || 10);
    var suffix = changed.length > names.length
      ? ' … +' + (changed.length - names.length) + ' more'
      : '';
    lines.push('  Changed: ' + names.join(', ') + suffix);
  } else if (stamp.summary === 'unchanged since last build') {
    lines.push('  No source input changes since previous build.');
  }

  if (stamp.removedFiles && stamp.removedFiles.length) {
    lines.push('  Removed: ' + basenameList(stamp.removedFiles, 5).join(', '));
  }

  return lines;
}

function createBuildStamp(projectRoot) {
  var prevRecord = readLastStamp(projectRoot);
  var prevFingerprints = prevRecord && prevRecord.fingerprints ? prevRecord.fingerprints : null;
  var fingerprints = collectFingerprints(projectRoot);
  var diff = diffFingerprints(prevFingerprints, fingerprints);
  var initialBuild = !prevFingerprints;
  var meta = summarizeChanges(diff, fingerprints, { initialBuild: initialBuild });
  var git = getGitInfo(projectRoot);

  var stamp = {
    builtAt: new Date().toISOString(),
    since: prevRecord && prevRecord.builtAt ? prevRecord.builtAt : null,
    initialBuild: meta.initialBuild,
    summary: meta.summary,
    changedAreas: meta.changedAreas,
    changedFiles: diff.changedFiles.concat(diff.addedFiles),
    removedFiles: diff.removedFiles,
    trackedFileCount: Object.keys(fingerprints).length,
    gitCommit: git.available ? git.commit : null,
    gitBranch: git.available ? git.branch : null,
    gitDirty: git.available ? git.dirty : null
  };

  writeLastStamp(projectRoot, {
    builtAt: stamp.builtAt,
    fingerprints: fingerprints,
    gitCommit: stamp.gitCommit
  });

  return stamp;
}

module.exports = {
  createBuildStamp: createBuildStamp,
  readLastStamp: readLastStamp,
  formatStampLine: formatStampLine,
  formatStampDetail: formatStampDetail,
  collectFingerprints: collectFingerprints,
  diffFingerprints: diffFingerprints,
  summarizeChanges: summarizeChanges
};
