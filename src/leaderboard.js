// The weekly leaderboard: you against a field of bots.
//
// There's no server, so there are no other real players to rank against.
// The bots are clearly labelled as bots and play a simulated game each day.
// Their results come from a seeded random generator, so every visitor sees
// the same standings and they only change when a new day starts.

import { MAX_GUESSES, mulberry32, points } from "./game.js";

export const BOTS = [
  { name: "null_ptr", skill: 0.92, activity: 0.97 },
  { name: "segfault", skill: 0.85, activity: 0.9 },
  { name: "tabs_not_spaces", skill: 0.78, activity: 0.95 },
  { name: "lisp_wizard", skill: 0.74, activity: 0.8 },
  { name: "semicolon", skill: 0.66, activity: 0.92 },
  { name: "off_by_one", skill: 0.58, activity: 0.85 },
  { name: "hello_world", skill: 0.48, activity: 0.75 },
  { name: "copy_paste", skill: 0.38, activity: 0.7 },
];

function hash(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// One bot's simulated result on one day: null if it skipped the day,
// otherwise the number of guesses it needed (0 = failed).
export function botResult(bot, day) {
  const random = mulberry32(hash(bot.name) + day * 7919);
  if (random() > bot.activity) return null;
  if (random() > 0.45 + 0.5 * bot.skill) return 0;
  const guesses = 1 + Math.floor(random() * MAX_GUESSES * (1.1 - bot.skill));
  return Math.min(MAX_GUESSES, guesses);
}

// The leaderboard covers the last WEEK days, so a new player can compete
// straight away instead of chasing bots with months of points.
export const WEEK = 7;
export const weekStart = (today) => Math.max(0, today - WEEK + 1);

// A bot's stats for days fromDay..today. Today's result only counts once the
// bot has "played", which happens at a time of day that is fixed per bot.
export function botStats(bot, today, hourNow = 24, fromDay = 0) {
  const playHour = hash(bot.name) % 20 + 2;
  const lastDay = hourNow >= playHour ? today : today - 1;
  const distribution = Array(MAX_GUESSES).fill(0);
  let played = 0, wins = 0, streak = 0;
  for (let day = fromDay; day <= lastDay; day++) {
    const g = botResult(bot, day);
    if (g === null) { streak = 0; continue; }
    played += 1;
    if (g > 0) {
      wins += 1;
      streak += 1;
      distribution[g - 1] += 1;
    } else {
      streak = 0;
    }
  }
  return { played, wins, streak, distribution, points: points(distribution) };
}

// The player's points for the week, from their per-day history
// ({ [day]: guesses, 0 = failed }).
export function playerWeek(history, today) {
  const distribution = Array(MAX_GUESSES).fill(0);
  let wins = 0;
  for (let day = weekStart(today); day <= today; day++) {
    const g = history?.[day];
    if (g > 0) { wins += 1; distribution[g - 1] += 1; }
  }
  return { wins, points: points(distribution) };
}

// Everyone ranked by this week's points, then wins, then name.
export function standings(player, today, hourNow) {
  const rows = BOTS.map((bot) => ({ name: bot.name, bot: true, ...botStats(bot, today, hourNow, weekStart(today)) }));
  if (player) rows.push({ ...player, bot: false });
  rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

// ---------- arcade (speed run and endless) ----------
// Each day a bot plays, it posts one speed run and one endless run. The board
// shows everyone's best run of the last WEEK days.

export function botArcadeScore(bot, day, kind) {
  const random = mulberry32(hash(`${bot.name}:${kind}`) + day * 104729);
  if (random() > bot.activity) return null;
  return kind === "speed"
    ? Math.round(5 + bot.skill * 14 + random() * 5)
    : Math.round(bot.skill * 9 + random() * 6);
}

function botWeeklyBest(bot, kind, today, hourNow) {
  const playHour = hash(bot.name) % 20 + 2;
  const lastDay = hourNow >= playHour ? today : today - 1;
  let best = null;
  for (let day = weekStart(today); day <= lastDay; day++) {
    const score = botArcadeScore(bot, day, kind);
    if (score !== null) best = Math.max(best ?? 0, score);
  }
  return best;
}

// The player's best run this week, or null if they haven't played one.
export function weeklyBest(runs = [], today) {
  const recent = runs.filter((r) => r.day >= weekStart(today));
  return recent.length ? Math.max(...recent.map((r) => r.score)) : null;
}

// Ranked rows for an arcade board. Players who haven't played this week are
// listed last with no score.
export function arcadeStandings(kind, player, today, hourNow = 24) {
  const rows = BOTS.map((bot) => ({ name: bot.name, bot: true, score: botWeeklyBest(bot, kind, today, hourNow) }));
  if (player) rows.push({ ...player, bot: false });
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}
