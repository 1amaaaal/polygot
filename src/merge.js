// Merging two copies of a player's saved progress, e.g. this browser's and
// the one stored on the server from another device. Nothing is lost: results,
// runs, languages and badges from either side are kept. Pure functions, so
// tests/game.test.js can check them in Node.

import { newStats, recordResult } from "./game.js";

const earlier = (a, b) => (a && b ? (a < b ? a : b) : a || b);

// Daily stats replayed from the per-day results.
export function statsFromHistory(history) {
  let stats = newStats();
  for (const day of Object.keys(history).map(Number).sort((a, b) => a - b)) {
    const guesses = history[day];
    stats = recordResult(stats, { day, won: guesses > 0, guesses });
  }
  return stats;
}

function mergeRuns(a = [], b = []) {
  const runs = new Map();
  for (const run of [...a, ...b]) {
    // Runs recorded before they had a timestamp are matched on day and score.
    const key = run.at ? `at:${run.at}` : `${run.day}:${run.score}`;
    const prev = runs.get(key);
    if (!prev) {
      runs.set(key, { ...run });
    } else {
      // An endless run can grow after a copy was saved: keep the longer one.
      prev.score = Math.max(prev.score, run.score);
      if (run.sent !== undefined) prev.sent = Math.max(prev.sent ?? -1, run.sent);
    }
  }
  return [...runs.values()].sort((x, y) => x.day - y.day || (x.at ?? 0) - (y.at ?? 0)).slice(-200);
}

function mergeCollection(a = {}, b = {}) {
  const out = { ...b };
  for (const [name, entry] of Object.entries(a)) {
    const other = out[name];
    out[name] = other
      ? { wins: Math.max(entry.wins, other.wins), firstSolved: earlier(entry.firstSolved, other.firstSolved) }
      : entry;
  }
  return out;
}

function mergeMax(a = {}, b = {}) {
  const out = { ...b };
  for (const [key, value] of Object.entries(a)) out[key] = Math.max(value, out[key] ?? 0);
  return out;
}

function mergeDates(a = {}, b = {}) {
  const out = { ...b };
  for (const [key, date] of Object.entries(a)) out[key] = earlier(date, out[key]);
  return out;
}

// Today's puzzle in progress: the copy that got further.
function mergeDaily(a, b) {
  if (!a || !b) return a ?? b ?? null;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  if (a.done !== b.done) return a.done ? a : b;
  return a.guesses.length >= b.guesses.length ? a : b;
}

// `local` is this browser's progress, `remote` the copy from the server. Where
// both played the same day, the server's result wins, since it was saved first.
export function mergeStores(local, remote) {
  if (!remote) return local;
  const history = { ...local.history, ...remote.history };
  const rebuilt = statsFromHistory(history);
  const known = [local.stats, remote.stats].filter(Boolean).sort((a, b) => b.played - a.played)[0];
  return {
    ...remote,
    ...local,
    // Older saves may have stats from before per-day history was kept.
    stats: !known || rebuilt.played >= known.played ? rebuilt : known,
    daily: mergeDaily(local.daily, remote.daily),
    history,
    archive: { ...local.archive, ...remote.archive },
    dayAnswers: { ...remote.dayAnswers, ...local.dayAnswers },
    collection: mergeCollection(local.collection, remote.collection),
    speed: { runs: mergeRuns(local.speed?.runs, remote.speed?.runs) },
    endless: { runs: mergeRuns(local.endless?.runs, remote.endless?.runs) },
    counters: mergeMax(local.counters, remote.counters),
    badges: mergeDates(local.badges, remote.badges),
    sentDays: [...new Set([...(local.sentDays ?? []), ...(remote.sentDays ?? [])])].sort((a, b) => a - b).slice(-30),
    seenHelp: Boolean(local.seenHelp || remote.seenHelp),
  };
}
