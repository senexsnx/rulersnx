const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const stage = path.join(root, 'dist', 'chrome');
fs.mkdirSync(stage, { recursive: true });
// An allowlist keeps development files and Firefox metadata out of the upload.
for (const dir of ['src', 'icons']) {
  fs.mkdirSync(path.join(stage, dir), { recursive: true });
}
for (const name of ['background.js', 'exec.js', 'guides.js', 'popup.html', 'popup.js', 'toolbar.js']) {
  fs.copyFileSync(path.join(root, 'src', name), path.join(stage, 'src', name));
}
for (const size of [16, 32, 48, 128]) {
  fs.copyFileSync(path.join(root, 'icons', `icon${size}.png`), path.join(stage, 'icons', `icon${size}.png`));
}
fs.copyFileSync(path.join(root, 'chrome', 'service-worker.js'), path.join(stage, 'src', 'service-worker.js'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
delete manifest.browser_specific_settings;
manifest.background = { service_worker: 'src/service-worker.js' };
manifest.minimum_chrome_version = '102';
manifest.description = 'Lineale, Hilfslinien und Markierungen für Webseiten. Ausrichtung und Abstände prüfen – lokal und ohne Tracking.';
fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules', 'web-ext', 'bin', 'web-ext.js'),
  'build', '--source-dir', stage, '--artifacts-dir', path.join(root, 'chrome-artifacts'),
  '--filename', `rulersnx-chrome-${manifest.version}.zip`, '--overwrite-dest', '--no-config-discovery'
], { cwd: stage, stdio: 'inherit' });
process.exit(result.status ?? 1);
