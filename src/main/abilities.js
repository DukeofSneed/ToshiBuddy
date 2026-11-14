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

// Drawn poses an upgrade can ask for by name (the Mod API's action.animate),
// if the character's sheet has them mapped.
const PLAYABLE = {
  wave: 'wave or bow', think: 'think / look confused', surprised: 'look surprised', huff: 'look annoyed', shrug: 'shrug',
  frost: 'the double-click trick', stamp: 'stamp a form (at the desk only)',
};
// Which of those this character has. config: character.json; builtin: the drawn test character has all of them.
function playablePoses({ config = null, builtin = false } = {}) {
  const mapped = builtin ? Object.keys(PLAYABLE) : Object.keys(((config && config.sheet) || {}).animations || {});
  return Object.keys(PLAYABLE).filter((k) => mapped.includes(k));
}

// The hard limits. The character's artwork is fixed: an upgrade can never add,
// change, or redraw a pose, so an idea that needs one is not an upgrade. It may
// play a pose that is already drawn in the character's own sheet.
function limits(poses = []) {
  const have = poses.filter((k) => PLAYABLE[k]);
  return [
    'The character\'s artwork cannot be edited, redrawn, or added to. There are no new poses, expressions, or body-part movements: the head, arms, eyes and mouth cannot move on their own.'
      + (have.length
        ? ` The ONLY poses that may be used are the ones already drawn in the character's own sheet, played as they are: ${have.map((k) => `${k} (${PLAYABLE[k]})`).join(', ')}. Anything not in that list (a nod, a blink, a smile, a salute, a new pose) does not exist and cannot be used.`
        : ' This character has no extra drawn poses to play.')
      + ' Besides those, the only motion available is moving the whole existing picture (slide, hop, tilt, sway, shrink, grow, fade).',
    'Props are small add-ons that sit on top of or beside the character: a hat on top of the head, something held in a hand, something on the desk, something floating nearby. Never clothing, costumes, masks, capes, armour, or anything else that covers the body or face or changes how the outfit looks.',
    'An upgrade may add: spoken lines; the motion and poses above; small props drawn from simple shapes (or a picture the owner attached); and reactions to these events only: a click, a double-click, being dropped, the hour changing, waking up, falling asleep, leaning on the screen edge, sitting down at the desk, finishing a typing session at the desk, finishing a long typing session (20 minutes or more), the owner switching to another app, a donation, an upgrade finishing, the donation transformation starting, and a repeating timer.',
    'An upgrade may keep a simple count of how many times one of its events has happened (saved on this computer, so it survives restarts and sleep) and react every so many times or at set milestones. That is the only memory there is: no other saved data, scores, dates, or settings. It cannot know what the owner is doing beyond those events, read files or the screen, use the network, or play new sounds.',
    'If an idea would need new artwork of the character, a pose that is not in the list above, a separately moving body part, a change to the outfit, or anything else outside these limits, it must be thrown out, not adapted with a workaround.',
  ].join('\n');
}
const LIMITS = limits([]);

module.exports = { describe, limits, playablePoses, PLAYABLE, RULE, LIMITS, POSES, ALWAYS };
