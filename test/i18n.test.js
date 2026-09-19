const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('src/i18n.js', 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(code, context);

const i18n = context.globalThis.RulerSNXI18n;
if (!i18n) throw new Error('RulerSNXI18n is not defined');
if (i18n.get('en', 'activate') !== 'Activate') throw new Error('English activation label missing');
if (i18n.get('de', 'activate') !== 'Aktivieren') throw new Error('German activation label missing');
if (i18n.get('xx', 'activate') !== 'Aktivieren') throw new Error('Unknown locales must fall back to German');
if (i18n.normalize('en-US') !== 'en') throw new Error('English locale normalization failed');
if (i18n.normalize(null) !== 'en' || i18n.normalize('') !== 'en') throw new Error('Missing locale must default to English');

console.log('i18n dictionary works');
