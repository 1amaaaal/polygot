// Badges. Each badge measures one number from the player's saved data and
// unlocks when it reaches a target, so the profile can show progress too.

import { LANGUAGES } from "../data/languages.js";

const best = (runs = []) => runs.reduce((m, r) => Math.max(m, r.score), 0);
const has = (collection, ...names) => names.filter((n) => collection[n]).length;
const LISPS = LANGUAGES.filter((l) => l.family === "Lisp").map((l) => l.name);

// Everything the badges look at, worked out from the store.
export function progressState(store) {
  const c = store.collection ?? {};
  const counters = store.counters ?? {};
  return {
    wins: Object.values(c).reduce((sum, e) => sum + e.wins, 0),
    maxStreak: store.stats?.maxStreak ?? 0,
    collected: Object.keys(c).length,
    genius: counters.genius ?? 0,
    clutch: counters.clutch ?? 0,
    hardWins: counters.hardWins ?? 0,
    challengesWon: counters.challengesWon ?? 0,
    archivePlayed: Object.keys(store.archive ?? {}).length,
    speedBest: best(store.speed?.runs),
    endlessBest: best(store.endless?.runs),
    legacy: has(c, "COBOL", "Fortran"),
    metal: has(c, "x86 Assembly"),
    lisp: has(c, ...LISPS),
  };
}

export const ACHIEVEMENTS = [
  { id: "hello-world", name: "Hello, World", text: "Win your first puzzle.", glyph: ">_", key: "wins", target: 1 },
  { id: "streak-3", name: "On a roll", text: "Win the daily puzzle 3 days in a row.", glyph: "3d", key: "maxStreak", target: 3 },
  { id: "streak-7", name: "Full week", text: "Win the daily puzzle 7 days in a row.", glyph: "7d", key: "maxStreak", target: 7 },
  { id: "streak-30", name: "Habit", text: "Win the daily puzzle 30 days in a row.", glyph: "30d", key: "maxStreak", target: 30 },
  { id: "first-try", name: "First try", text: "Solve a puzzle with your first guess.", glyph: "1/6", key: "genius", target: 1 },
  { id: "clutch", name: "Clutch", text: "Solve a puzzle on your sixth and last guess.", glyph: "6/6", key: "clutch", target: 1 },
  { id: "hard-mode", name: "No highlighting", text: "Win a puzzle in hard mode.", glyph: "*", key: "hardWins", target: 1 },
  { id: "collect-10", name: "Apprentice", text: "Collect 10 different languages.", glyph: "10", key: "collected", target: 10 },
  { id: "collect-all", name: "Polyglot", text: `Collect all ${LANGUAGES.length} languages.`, glyph: String(LANGUAGES.length), key: "collected", target: LANGUAGES.length },
  { id: "legacy", name: "Legacy code", text: "Solve both COBOL and Fortran.", glyph: "IBM", key: "legacy", target: 2 },
  { id: "metal", name: "Close to the metal", text: "Solve x86 Assembly.", glyph: "asm", key: "metal", target: 1 },
  { id: "parens", name: "Parenthetical", text: `Solve every Lisp: ${LISPS.join(" and ")}.`, glyph: "( )", key: "lisp", target: LISPS.length },
  { id: "speed-10", name: "Quick fingers", text: "Name 10 languages in one speed run.", glyph: "10s", key: "speedBest", target: 10 },
  { id: "speed-20", name: "Speed demon", text: "Name 20 languages in one speed run.", glyph: "20s", key: "speedBest", target: 20 },
  { id: "endless-5", name: "Keep going", text: "Solve 5 in a row in endless mode.", glyph: "∞5", key: "endlessBest", target: 5 },
  { id: "endless-15", name: "Unstoppable", text: "Solve 15 in a row in endless mode.", glyph: "∞15", key: "endlessBest", target: 15 },
  { id: "rival", name: "Rival", text: "Beat a friend's challenge.", glyph: "vs", key: "challengesWon", target: 1 },
  { id: "historian", name: "Historian", text: "Play 10 puzzles from the archive.", glyph: "#10", key: "archivePlayed", target: 10 },
];

// Each badge with its progress, e.g. { ...badge, current: 3, unlocked: false }.
export function evaluate(store) {
  const state = progressState(store);
  return ACHIEVEMENTS.map((a) => {
    const current = Math.min(state[a.key], a.target);
    return { ...a, current, unlocked: current >= a.target, date: store.badges?.[a.id] ?? null };
  });
}

// Records the date of any badge unlocked since last time and returns them.
export function claimNew(store, today = new Date().toISOString().slice(0, 10)) {
  store.badges ??= {};
  const fresh = evaluate(store).filter((a) => a.unlocked && !store.badges[a.id]);
  for (const a of fresh) store.badges[a.id] = today;
  return fresh;
}
