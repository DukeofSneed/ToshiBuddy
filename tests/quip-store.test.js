const fs = require('fs');
const os = require('os');
const path = require('path');
const { QuipStore } = require(path.join(__dirname, '..', 'src', 'main', 'quip-store.js'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const packs = [
  { text: 'Hello {name}.', tags: ['greet'], pack: 'base.json' },
  { text: 'Idle line.', tags: ['idle'], pack: 'base.json' },
  { text: 'Pack line.', tags: ['idle'], pack: 'snow.json' },
];
let s = new QuipStore(dir);
ok(s.merged(packs).length === 3, 'starts with packs');
const q = s.add({ text: '  My   own quip ', tags: 'click, IDLE, bad tag!' });
ok(q.text === 'My own quip', 'text cleaned');
ok(JSON.stringify(q.tags) === '["click","idle"]', 'tags cleaned ' + q.tags);
ok(s.merged(packs).length === 4, 'added shows');
s.remove('p:base.json|Idle line.');
ok(!s.merged(packs).some((x) => x.text === 'Idle line.'), 'removed hides');
s.update('p:base.json|Hello {name}.', { text: 'Hi {name}!', tags: ['greet'] });
ok(s.merged(packs).some((x) => x.text === 'Hi {name}!'), 'edit applies');
s.update(`c:${q.id}`, { text: 'Changed', tags: [] });
ok(s.merged(packs).some((x) => x.text === 'Changed' && x.tags[0] === 'idle'), 'custom edit + default tag');
let threw = false; try { s.add({ text: '   ' }); } catch (_) { threw = true; }
ok(threw, 'empty rejected');
threw = false; try { s.add({ text: 'x'.repeat(241) }); } catch (_) { threw = true; }
ok(threw, 'long rejected');
s = new QuipStore(dir); // reload from disk
const list = s.editorList(packs);
ok(list.length === 4, 'editor list has all incl removed');
ok(list.find((x) => x.text === 'Idle line.').removed === true, 'removed flagged');
ok(list.find((x) => x.text === 'Hi {name}!').original === 'Hello {name}.', 'original kept');
s.restore('p:base.json|Idle line.'); s.restore('p:base.json|Hello {name}.');
ok(s.merged(packs).length === 4 && s.merged(packs).some((x) => x.text === 'Hello {name}.'), 'restore works');
s.remove(`c:${q.id}`);
ok(s.merged(packs).length === 3, 'custom delete');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
