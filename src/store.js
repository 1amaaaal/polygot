// Everything the site remembers lives in one localStorage entry, shared by all
// pages. Storage can be unavailable (private windows, blocked cookies), so
// every access is best effort and the site still works without it.

import { newStats } from "./game.js";

const KEY = "polyglot-v1";

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export const store = {
  settings: {},       // { colorblind, hard }
  stats: newStats(),  // daily puzzles only
  daily: null,        // { day, guesses, hard }
  collection: {},     // { [language]: { wins, firstSolved } }
  history: {},        // daily results: { [day]: guesses, 0 = failed }
  archive: {},        // replayed past puzzles, same shape as history
  speed: { runs: [] },   // speed runs: [{ day, score }]
  endless: { runs: [] }, // endless runs: [{ day, score }]
  counters: {},       // { genius, clutch, hardWins, challengesWon } for badges
  badges: {},         // { [badge id]: date unlocked }
  github: "",         // the player's GitHub username, set when they sign in
  sentDays: [],       // no longer used: the server records daily results itself
  dayAnswers: {},     // { [day]: language } for daily puzzles the player has finished
  seenHelp: false,
  ...load(),
};

export function save() {
  store.changedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch { /* storage unavailable: progress lasts for this visit only */ }
}

// Returns true when this is the first time the language was solved.
export function collect(language) {
  const entry = store.collection[language];
  if (entry) {
    entry.wins += 1;
  } else {
    store.collection[language] = { wins: 1, firstSolved: new Date().toISOString().slice(0, 10) };
  }
  save();
  return !entry;
}

// Swap in merged progress (see merge.js) and save it.
export function replaceStore(data) {
  for (const [key, value] of Object.entries(data)) {
    if (key !== "__proto__" && key !== "constructor") store[key] = value;
  }
  save();
}

// Keep the most recent runs only, so storage can't grow without limit. The
// timestamp tells runs apart when progress from two devices is merged.
export function recordRun(kind, run) {
  run.at ??= Date.now();
  store[kind].runs.push(run);
  store[kind].runs = store[kind].runs.slice(-200);
  save();
}

export function count(counter) {
  store.counters[counter] = (store.counters[counter] ?? 0) + 1;
}
