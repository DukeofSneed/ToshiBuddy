const assert = require('assert');
const { classify } = require(require('path').join(__dirname, '..', 'src', 'main', 'activity.js'));
// Generic sample windows (made up; no real files or accounts).
const cases = [
  [{ p: 'WINWORD', t: 'Document1 - Word' }, 'writing'],
  [{ p: 'chrome', t: 'Untitled document - Google Docs - Google Chrome' }, 'writing'],
  [{ p: 'Code', t: 'index.js - my-project - Visual Studio Code' }, 'coding'],
  [{ p: 'AcroRd32', t: 'sample.pdf - Adobe Acrobat Reader' }, 'reading'],
  [{ p: 'msedge', t: 'example.pdf - Microsoft Edge' }, 'reading'],
  [{ p: 'vmware', t: 'Virtual Machine - VMware Workstation' }, 'lab'],
  [{ p: 'Wireshark', t: 'example.pcap' }, 'lab'],
  [{ p: 'firefox', t: 'pfSense | Dashboard - Mozilla Firefox' }, 'lab'],
  [{ p: 'steam', t: 'Steam' }, 'leisure'],
  [{ p: 'chrome', t: 'YouTube - Google Chrome' }, 'leisure'],
  [{ p: 'chrome', t: 'Ubuntu install guide - YouTube - Google Chrome' }, 'lab'],
  [{ p: 'chrome', t: 'Inbox - Google Chrome' }, null],
  [{ p: 'claude', t: 'Claude' }, null],
  [{ p: 'electron', t: 'ToshiBuddy' }, null],
  [{ p: '', t: '' }, null],
];
for (const [sample, want] of cases) {
  assert.strictEqual(classify(sample), want, `${sample.p} / ${sample.t}`);
}
// User overrides replace the defaults.
assert.strictEqual(classify({ p: 'steam', t: '' }, { apps: { lab: ['steam'], writing: [] }, titles: { lab: [], writing: [] } }), 'lab');
console.log(`ok: ${cases.length + 1} activity classification checks`);
