// Loads the renderer's quips.js with a fake window and checks the dialogue engine.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const quipsJs = path.join(__dirname, '..', 'src', 'renderer', 'pet', 'quips.js');
const dialogueFile = path.join(__dirname, '..', 'characters', 'toshitoshi', 'quips.json');
const window = {};
vm.runInNewContext(fs.readFileSync(quipsJs, 'utf8'), { window, Date, Math, Number, Set, Map, Array, String });
const Q = window.BuddyQuips;
const d = JSON.parse(fs.readFileSync(dialogueFile, 'utf8'));
Q.setBase(d.quips.map((q) => ({ ...q, pack: 'character:toshitoshi' })));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const tagOf = (text) => (d.quips.find((q) => q.text === text) || {}).tags || [];

const greet = Q.pickEntry(['greet'], {});
ok(greet && tagOf(greet.text)[0] === `time_${Q.timeTag()}`, `greet uses time_${Q.timeTag()}: ${greet && greet.text}`);
ok(greet.priority === 2, 'time line priority 2');
const click = Q.pickEntry(['click'], {});
ok(tagOf(click.text)[0] === 'click', 'click line');
ok(tagOf(Q.pick(['annoyed-2'], {}))[0] === 'repeated_click', 'annoyed -> repeated_click');
ok(tagOf(Q.pick(['drop'], {}))[0] === 'drag', 'drop -> drag');
ok(tagOf(Q.pick(['desk-enter-coding', 'desk-enter'], {}))[0] === 'desk_spawn', 'desk enter -> desk_spawn');
ok(tagOf(Q.pick(['desk-exit'], {}))[0] === 'desk_despawn', 'desk exit -> desk_despawn');
ok(tagOf(Q.pick(['desk-pause'], {}, { fallback: false }))[0] === 'desk_idle', 'desk pause -> desk_idle');
const dc = tagOf(Q.pick(['desk-coding', 'desk'], {}))[0];
ok(dc === 'desk_typing' || dc === 'activity_coding', 'desk coding -> desk_typing/activity_coding ' + dc);
ok(tagOf(Q.pick(['wake'], {}))[0] === 'inactivity_long', 'wake -> inactivity_long');
ok(tagOf(Q.pick(['inactive'], {}, { fallback: false }))[0] === 'inactivity', 'inactive -> inactivity');
ok(Q.pick(['jar-grow'], {}, { fallback: false }) === null, 'no donation lines -> silent (the app shows a notice)');
const up = Q.pickEntry(['upgrade'], {}, { fallback: false });
ok(tagOf(up.text)[0] === 'achievement' && up.priority === 3, 'upgrade -> achievement, priority 3');
ok(tagOf(Q.pick(['level-up'], {}, { fallback: false }))[0] === 'milestone', 'level -> milestone');
ok(tagOf(Q.pick(['upgrade-failed'], {}, { fallback: false }))[0] === 'failure', 'failed -> failure');
const idle = tagOf(Q.pick(['idle'], {}))[0];
ok(/^random/.test(idle), 'idle -> a random line ' + idle);
ok(Q.pick(['hour'], {}, { fallback: false }) === null, 'hour with no lines stays quiet');
ok(/^random/.test(tagOf(Q.pick(['lean'], {}))[0]), 'unknown event falls back to random');
ok(Q.has(['slacking-extended']) && !Q.has(['hour']), 'has()');
// Cooldown: 7 inactivity lines, 1200 s each; 7 picks are all different, the 8th repeats the oldest.
const seen = new Set();
for (let i = 0; i < 7; i++) seen.add(Q.pick(['inactive'], {}, { fallback: false }));
ok(seen.size === 7, 'no repeats within cooldown: ' + seen.size);
// Kori-style pack: library aliases don't interfere.
Q.setBase([{ text: 'Kori greet', tags: ['greet'], pack: 'base.json' }, { text: 'Kori idle', tags: ['idle'], pack: 'base.json' }]);
ok(Q.pick(['greet'], {}) === 'Kori greet', 'plain greet still works');
ok(Q.pick(['inactive'], {}, { fallback: false }) === null, 'no inactivity lines -> silent');
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
