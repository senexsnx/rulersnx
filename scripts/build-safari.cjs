const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

// Safari's Web Extension Packager consumes a web-extension ZIP. Build the same
// Chromium-compatible package first so Chrome, Edge and Safari all use identical
// extension code and version metadata.
const build = spawnSync(process.execPath, [path.join(__dirname, 'build-chrome.cjs')], {
  cwd: root,
  stdio: 'inherit'
});
if ((build.status ?? 1) !== 0) process.exit(build.status ?? 1);

const input = path.join(root, 'chrome-artifacts', `rulersnx-chrome-${manifest.version}.zip`);
const outputDir = path.join(root, 'safari-artifacts');
const output = path.join(outputDir, `rulersnx-safari-${manifest.version}.zip`);
fs.mkdirSync(outputDir, { recursive: true });
fs.copyFileSync(input, output);
console.log(`Safari source package: ${output}`);
