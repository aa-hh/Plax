/**
 * Packages dist/ into a webOS IPK (requires ares-package CLI from webOS TV SDK).
 */
var fs = require('fs');
var path = require('path');
var { execSync } = require('child_process');

var dist = path.join(__dirname, '..', 'dist');
var out = path.join(__dirname, '..', 'build');

if (!fs.existsSync(dist)) {
  console.error('Run npm run build first');
  process.exit(1);
}

if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });

try {
  execSync('ares-package -o "' + out + '" "' + dist + '"', { stdio: 'inherit' });
  console.log('IPK written to', out);
} catch (e) {
  console.warn('ares-package not found. Install webOS TV SDK and run:');
  console.warn('  ares-package -o build dist');
  process.exit(0);
}
