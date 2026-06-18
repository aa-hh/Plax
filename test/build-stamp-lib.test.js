import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

var require = createRequire(import.meta.url);
var stampLib = require('../scripts/build-stamp-lib.cjs');

test('createBuildStamp increments persistent build numbers', function () {
  var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plax-build-stamp-'));
  try {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'src', 'app.js'), 'console.log("xplay");\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'index.html'), '<!doctype html>\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'appinfo.json'), '{}\n', 'utf8');
    fs.mkdirSync(path.join(tmpRoot, 'build'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'build', 'rollup.config.js'), 'export default {};\n', 'utf8');

    var first = stampLib.createBuildStamp(tmpRoot);
    var second = stampLib.createBuildStamp(tmpRoot);

    assert.equal(first.buildNumber, 1);
    assert.equal(second.buildNumber, 2);

    var seqFile = JSON.parse(fs.readFileSync(path.join(tmpRoot, '.build-seq.json'), 'utf8'));
    assert.equal(seqFile.buildNumber, 2);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
