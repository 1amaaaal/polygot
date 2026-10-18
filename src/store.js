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
  github: "",         // the player's GitHub username
  seenHelp: false,
  ...load(),
};

export function save() {
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
