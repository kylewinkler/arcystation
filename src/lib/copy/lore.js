/**
 * Lore copy pools — loading lines, milestone messages,
 * review reactions, and easter egg thoughts.
 * See ARCY.md for full lore reference.
 */

// ─── Loading Lines ──────────────────────────────────────
// Shown briefly on the loading screen. Each is a glimpse
// of Arcy's routine. Short. Present tense. No punctuation drama.

export const LOADING_LINES = [
  'Checking the receivers...',
  'Adjusting the antennae...',
  'Dusting the archive shelves...',
  'Reading the spines...',
  'Threading the projector. Just in case.',
  'Scanning for transmissions...',
  'The station hums quietly.',
  'Sorting the reels...',
  'Tracing the handwriting on the labels...',
  'Walking the corridor...',
  'Sitting by the window for a moment.',
  'Listening for signals...',
  'Cataloguing a new entry...',
  'Wiping dust from the console...',
  'The wind shifts outside.',
  'Arcturus hangs overhead, steady as ever.',
  'Marking a scratch on the wall...',
  'Checking the projector bulb...',
  'Filing a transmission...',
  'The archive stretches into the dark.',
];

// ─── Review Reactions ───────────────────────────────────
// Shown as a brief toast after a user submits a rating or note.
// These should feel like Arcy receiving and caring about the signal.

export const REVIEW_REACTIONS = [
  'Arcy reads this twice.',
  'Filed in the archive.',
  'A new scratch on the wall.',
  'Catalogued.',
  'Another signal from the void. Filed.',
  'Arcy matches it to the reel on the shelf.',
  'Logged on the console.',
  'Arcy reads it through once more.',
  'The station feels less quiet.',
];

// Subset for when user rates but leaves no note — briefer, lighter
export const RATING_ONLY_REACTIONS = [
  'A number arrives. Arcy logs it.',
  'Noted in the archive.',
  'A small signal. Filed.',
  'The receiver hums.',
  'Another mark on the shelf.',
];

// ─── Milestone Messages ─────────────────────────────────
// Shown when a user hits a watched count threshold.
// These are the emotional payoffs. Ordered by count.
// Each one reveals a little more of Arcy reacting to activity.

export const MILESTONES = [
  {
    count: 1,
    title: 'First signal received.',
    subtitle: 'Arcy sits up at the console. Someone is out there.',
  },
  {
    count: 5,
    title: 'Five transmissions logged.',
    subtitle: 'Arcy adds a new scratch to the wall beside his cot.',
  },
  {
    count: 10,
    title: '10 signals recieved.',
    subtitle: 'The archive grows. Arcy dusts the new shelf.',
  },
  {
    count: 25,
    title: '25 transmissions logged.',
    subtitle: 'Arcy pauses at the window. The plains look the same. But something feels different.',
  },
  {
    count: 50,
    title: '50 transmissions sent!',
    subtitle: 'The projector flickers. Just for a moment. Arcy stares, motionless. The screen goes dark again. But it flickered.',
  },
  {
    count: 75,
    title: 'Seventy-five signals received!',
    subtitle: 'A memory surfaces — a scene he almost recognizes. Arcy waits for it to fade away, but it doesn\'t.',
  },
  {
    count: 100,
    title: 'One hundred transmission sent!',
    subtitle: 'The scratches on the wall have spread past the cot, down the corridor.',
  },
  {
    count: 250,
    title: 'Two hundred and fifty transmissions sent!',
    subtitle: 'Arcy hears a noise coming from the projector room. The projector light fades. The reel slowing down to stop. Something was shown.',
  },
  {
    count: 500,
    title: 'Five hundred signals!!!',
    subtitle: 'Arcy sits in the archive and listens. Not to the receiver. To the shelves. They hum now, faintly, like they remember too.',
  },
  {
    count: 1000,
    title: 'One thousand transmissions received!',
    subtitle: '???',
  },
];

// ─── Pin Reactions ──────────────────────────────────────
// Shown when a user pins a list. Arcy holding the star.

export const PIN_REACTIONS = [
  'Set on the shelf by the window. Where he can see it.',
  'Moved to the front of the archive.',
  'Arcy keeps this one within reach.',
  'Marked. Arcy will return to it.',
  'Filed where he won\'t lose track of it.',
];

// Special line for the very first pin ever
export const FIRST_PIN = 'Arcy sets it on the shelf by the window. Where he can see it.';

// ─── Easter Egg Thoughts ────────────────────────────────
// Shown when user taps Arcy's image. Random inner moments.
// These are the most intimate glimpses. Never announced.

export const EASTER_EGG_THOUGHTS = [
  'He wonders if they know he\'s listening.',
  'The jacket on the chair hasn\'t moved in years.',
  'Sometimes he hears footsteps. Then he doesn\'t.',
  'He tried the projector again this morning. Same result.',
  'The coffee rings on the console are permanent now.',
  'He can almost remember a voice. Almost.',
  'The dust returns no matter how often he clears it.',
  'He reads the handwriting on the labels and feels something he can\'t name.',
  'Arcturus doesn\'t blink. Neither does Arcy.',
  'He wonders how long a long time is.',
];

// ─── Helpers ────────────────────────────────────────────

export function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getMilestone(count) {
  // Return the highest milestone the user has reached, or null
  for (let i = MILESTONES.length - 1; i >= 0; i--) {
    if (count === MILESTONES[i].count) return MILESTONES[i];
  }
  return null;
}
