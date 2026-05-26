import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

var require = createRequire(import.meta.url);
var { resolveSimulatorPaths, findSimulator } = require('../scripts/sim-launch.cjs');

describe('resolveSimulatorPaths', function () {
  it('uses parent directory for .app bundle (ares-launch -sp)', function () {
    var app = '/Applications/webOS_TV_26_Simulator_1.5.0/webOS_TV_26_Simulator_1.5.0.app';
    var paths = resolveSimulatorPaths(app);
    assert.equal(paths.appPath, app);
    assert.equal(paths.aresDir, '/Applications/webOS_TV_26_Simulator_1.5.0');
  });

  it('uses /Applications when .app sits at top level', function () {
    var app = '/Applications/webOS_TV_6.0_Simulator_1.4.1.app';
    var paths = resolveSimulatorPaths(app);
    assert.equal(paths.appPath, app);
    assert.equal(paths.aresDir, '/Applications');
  });

  it('resolves .app inside an install folder', function () {
    var installDir = '/Applications/webOS_TV_26_Simulator_1.5.0';
    var paths = resolveSimulatorPaths(installDir);
    assert.equal(
      paths.appPath,
      path.join(installDir, 'webOS_TV_26_Simulator_1.5.0.app')
    );
    assert.equal(paths.aresDir, installDir);
  });
});

describe('findSimulator', function () {
  it('returns aresDir as parent of nested .app when installed', function () {
    var installDir = '/Applications/webOS_TV_26_Simulator_1.5.0';
    var appPath = path.join(installDir, 'webOS_TV_26_Simulator_1.5.0.app');
    try {
      fs.accessSync(appPath);
    } catch (_) {
      return;
    }
    var detected = findSimulator('26');
    assert.ok(detected, 'expected TV 26 simulator on this machine');
    assert.equal(detected.appPath, appPath);
    assert.equal(detected.aresDir, installDir);
  });
});
