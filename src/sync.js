// Keeps a signed-in player's progress in step with the server. Pages call
// pullOnLoad() before they render and pushSoon() after something changes.
// Everything is best effort: offline, the site carries on from local storage
// and catches up next time.

import { dayNumber } from "./game.js";
import { mergeStores } from "./merge.js";
import { completeSignIn, currentUser, loadSave, sendDaily, sendRun, writeSave } from "./server.js";
import { replaceStore, save, store } from "./store.js";

const PULL_EVERY = 5 * 60 * 1000;
const PULLED_KEY = "polyglot-pulled";
const SYNCED_KEY = "polyglot-synced";

function remember(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, String(value));
  } catch { /* storage unavailable */ }
}

function recall(storage, key) {
  try {
    return Number(storage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) =>
  setTimeout(() => reject(new Error("timed out")), ms))]);

// `stillWanted` says whether the page is still waiting for the result.
async function pull(stillWanted = () => true) {
  const remote = await loadSave();
  if (!stillWanted()) return;
  replaceStore(mergeStores(store, remote));
  remember(sessionStorage, PULLED_KEY, Date.now());
}

// Called once per page load, before the page renders. Finishes a sign-in if
// GitHub just sent the player back, and otherwise fetches progress from other
// devices every few minutes. Returns a message for the player, if any.
export async function pullOnLoad() {
  try {
    const user = await completeSignIn();
    if (user) {
      store.github = user.username;
      await pull();
      pushSoon(0);
      return `Signed in as @${user.username}`;
    }
  } catch (err) {
    return `Couldn't sign in: ${err.message}`;
  }
  if (!currentUser() || !navigator.onLine) return null;
  // Anything a previous page didn't get round to sending goes now.
  pushSoon();
  if (Date.now() - recall(sessionStorage, PULLED_KEY) < PULL_EVERY) return null;
  let late = false;
  try {
    await withTimeout(pull(() => !late), 2000);
  } catch {
    late = true;   // too slow: render with what this browser has
  }
  return null;
}

// Sends results the server doesn't have yet, then the merged progress.
async function push() {
  const today = dayNumber();
  let sent = false;
  for (const [key, guesses] of Object.entries(store.history)) {
    const day = Number(key);
    if (day < today - 7 || store.sentDays.includes(day)) continue;
    await sendDaily({ day, guesses, hard: Boolean(store.daily?.day === day && store.daily.hard) });
    store.sentDays = [...store.sentDays, day].slice(-30);
    sent = true;
  }
  for (const kind of ["speed", "endless"]) {
    for (const run of store[kind].runs) {
      if (run.day < today - 7 || run.score === 0 || (run.sent ?? -1) >= run.score) continue;
      await sendRun({ kind, day: run.day, score: run.score });
      run.sent = run.score;
      sent = true;
    }
  }
  if (!sent && (store.changedAt ?? 0) <= recall(localStorage, SYNCED_KEY)) return;
  save();
  // Merge with the server's copy rather than overwrite it: another device
  // may have saved since this page loaded.
  await writeSave(mergeStores(store, await loadSave()));
  remember(localStorage, SYNCED_KEY, Date.now());
}

let timer = null;
let running = Promise.resolve();

export function pushSoon(delay = 1500) {
  if (!currentUser()) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    running = running.then(push).catch((err) => console.warn("Sync failed:", err.message));
  }, delay);
}

// Sends anything outstanding and waits for it, e.g. before signing out.
export async function flush() {
  clearTimeout(timer);
  await (running = running.then(push).catch(() => {}));
  remember(localStorage, SYNCED_KEY, null);
}
