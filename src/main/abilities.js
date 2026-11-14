'use strict';
// What the active character already does, as plain text for the idea, pricing
// and upgrade prompts, so new upgrades add something instead of repeating or
// replacing what is there. Built from the app's own behaviors and the NAMES of
// the animations mapped in character.json (labels like "sleep" or "wave" that
// the app defines); never from the images, the sheets, or the quips.

// Behaviors every character has, whatever its sheet.
const ALWAYS = [
  'walks back and forth along the taskbar and stops to idle',
  'says short lines in a speech bubble (greetings, time of day, reactions to clicks, idle chatter)',
  'falls asleep after a while with no activity and wakes when clicked or when activity returns',
  'sits at a small desk and does paperwork while the user is typing for a long stretch, with lines about the kind of work',
  'can be picked up with the mouse, dropped, and lands',
  'reacts to single clicks, repeated clicks (annoyed), and a double-click trick with an effect',
  'transforms for a short time when tokens are donated, and tends the donation jar in the corner of the screen',
  'shows a working pose while an upgrade is being built',
];

// Hand-drawn poses, by animation name. An upgrade must not imitate these with
// a bobbing or tilting idle pose: the drawn pose already covers it.
const POSES = {
  idle: 'standing idle', blink: 'blinking', walk: 'a walk cycle', talk: 'talking', sleep: 'sleeping (with its own drawn sleep marks)',
  drag: 'being carried (dizzy)', fall: 'falling', land: 'landing', lean: 'leaning on the screen edge', desk: 'sitting at the desk',
  working: 'working', scribbling: 'writing at the desk', think: 'thinking or confused (with a "?" mark)', surprised: 'surprised (with a "!" mark)',
  huff: 'annoyed', shrug: 'shrugging', wave: 'waving or bowing', frost: 'the double-click trick', release: 'the donation transformation',
  stamp: 'stamping a form',
};

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// config: character.json (or null for the built-in character, which has every pose).
// built: titles of tricks already built for this character. planned: titles of its open goals.
function describe({ config = null, builtin = false, built = [], planned = [] } = {}) {
  const mapped = builtin ? Object.keys(POSES) : Object.keys(((config && config.sheet) || {}).animations || {}).filter((k) => POSES[k]);
  const lines = [];
  lines.push(`Behaviors already built in: ${ALWAYS.join('; ')}.`);
  if (mapped.length) lines.push(`Hand-drawn poses the character already has: ${mapped.map((k) => POSES[k]).join(', ')}.`);
  const b = built.map((t) => clean(t, 80)).filter(Boolean).slice(0, 30);
  if (b.length) lines.push(`Tricks already built: ${b.join('; ')}.`);
  const p = planned.map((t) => clean(t, 80)).filter(Boolean).slice(0, 40);
  if (p.length) lines.push(`Ideas already on the list: ${p.join('; ')}.`);
  return lines.join('\n');
}

// The rule that goes with the list in every prompt.
const RULE = 'Do not repeat, replace, or imitate anything in this list. In particular, never fake a pose the character already has drawn (sleeping, thinking, waving and so on) with a moving idle pose or a drawn symbol. An upgrade must add something new: a new prop, a new occasion, new lines, or a new behavior. Adding lines or a small prop to an existing behavior is fine; a second version of it is not.';

// The hard limits. The character's artwork is fixed: an upgrade can never add,
// change, or redraw a pose, so an idea that needs one is not an upgrade.
const LIMITS = [
  'The character\'s artwork cannot be edited, redrawn, or added to. There are no new poses, expressions, outfits, or body-part movements: the head, arms, eyes and mouth cannot move on their own. The only motion available is moving the whole existing picture (slide, hop, tilt, sway, shrink, grow, fade).',
  'An upgrade may add: spoken lines; whole-figure CSS motion as above; small props drawn from simple shapes (or a picture the owner attached) on the head, a hand, or the desk; and reactions to these events only: a click, a double-click, being dropped, the hour changing, waking up, falling asleep, leaning on the screen edge, sitting down at the desk, a donation, an upgrade finishing, the donation transformation starting, and a repeating timer.',
  'An upgrade cannot: remember anything between sessions (no counters, streaks, scores, or saved settings), know what the owner is doing beyond those events, read files or the screen, use the network, or play new sounds.',
  'If an idea would need new artwork of the character, a separately moving body part, or anything in the "cannot" list, it must be thrown out, not adapted with a workaround.',
].join('\n');

module.exports = { describe, RULE, LIMITS, POSES, ALWAYS };
