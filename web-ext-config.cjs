/*
 * What ships to addons.mozilla.org. Everything not needed at runtime stays out
 * of the package: a reviewer should see only the files the add-on actually runs.
 */
module.exports = {
  ignoreFiles: [
    'node_modules',
    'test',
    'docs',
    'demo',
    'chrome',
    'scripts',
    'dist',
    'chrome-artifacts',
    'package.json',
    'package-lock.json',
    'web-ext-config.cjs',
    'web-ext-artifacts',
    'README.md',
    'CHANGELOG.md',
    '*.log',
    '*.zip'
  ],
  build: {
    overwriteDest: true
  }
};
