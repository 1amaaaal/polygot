// Pure game logic: no DOM, no storage. Everything here runs in Node too,
// which is how tests/game.test.js checks it.

export const MAX_GUESSES = 6;
export const START_LINES = 3;
export const LINES_PER_MISS = 2;

// Puzzle #1 was played on this local date.
export const LAUNCH = { year: 2026, month: 10, day: 18 };

// Which snippets the daily puzzle draws from. The daily order is a fixed
// shuffle of the first `poolSize` snippets in snippets.txt, so adding new
// snippets at the end of the file never changes past or current puzzles.
// To bring new snippets into the daily rotation, append an entry whose
// startDay is a future day number and whose poolSize covers them.
export const SCHEDULE = [
  { startDay: 0, poolSize: 80, seed: 2026 },
];

const HEADER = /^=+\[\s*(.+?)\s*\]=+\s*$/;

export function parseSnippets(text) {
  const snippets = [];
  let current = null;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const header = line.match(HEADER);
    if (header) {
      current = { language: header[1], lines: [] };
      snippets.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  for (const s of snippets) {
    while (s.lines.length && s.lines[s.lines.length - 1].trim() === "") s.lines.pop();
    while (s.lines.length && s.lines[0].trim() === "") s.lines.shift();
  }
  return snippets;
}

// Days since launch, by the player's local calendar. Built from UTC dates so
// daylight-saving changes can't make a day 23 or 25 hours long.
export function dayNumber(date = new Date()) {
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const launch = Date.UTC(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day);
  return Math.max(0, Math.round((today - launch) / 86_400_000));
}

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A seeded shuffle of 0..n-1 that avoids the same language two days running.
export function dailyOrder(snippets, n, seed) {
  const random = mulberry32(seed);
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const lang = (i) => snippets[order[i]].language;
  for (let i = 1; i < n; i++) {
    if (lang(i) !== lang(i - 1)) continue;
    for (let j = i + 1; j < n; j++) {
      if (lang(j) !== lang(i - 1)) {
        [order[i], order[j]] = [order[j], order[i]];
        break;
      }
    }
  }
  return order;
}

export function dailySnippetIndex(day, snippets, schedule = SCHEDULE) {
  const entry = [...schedule].reverse().find((e) => e.startDay <= day) ?? schedule[0];
  const size = Math.min(entry.poolSize, snippets.length);
  const offset = day - entry.startDay;
  const cycle = Math.floor(offset / size);
  return dailyOrder(snippets, size, entry.seed + cycle)[offset % size];
}

export function linesToShow(totalLines, misses, finished) {
  if (finished) return totalLines;
  return Math.min(totalLines, START_LINES + misses * LINES_PER_MISS);
}

// "hit" | "close" | "miss" for each trait, plus an arrow for the year.
export function compare(guess, answer) {
  const same = (key) => (guess[key] === answer[key] ? "hit" : "miss");
  const diff = answer.year - guess.year;
  return {
    correct: guess.name === answer.name,
    paradigm: same("paradigm"),
    year: diff === 0 ? "hit" : Math.abs(diff) <= 5 ? "close" : "miss",
    yearArrow: diff > 0 ? "up" : diff < 0 ? "down" : "",
    typing: same("typing"),
    execution: same("execution"),
    family: same("family"),
  };
}

export const TRAIT_KEYS = ["paradigm", "year", "typing", "execution", "family"];

const EMOJI = {
  normal: { hit: "🟩", close: "🟨", miss: "⬛" },
  colorblind: { hit: "🟧", close: "🟦", miss: "⬛" },
};

export function scoreLabel(results, won, hard = false) {
  return `${won ? results.length : "X"}/${MAX_GUESSES}${hard ? "*" : ""}`;
}

export function shareText({ label, results, won, hard = false, colorblind = false, url = "" }) {
  const emoji = EMOJI[colorblind ? "colorblind" : "normal"];
  const score = scoreLabel(results, won, hard);
  const rows = results.map((r) => TRAIT_KEYS.map((k) => emoji[r[k]]).join(""));
  return [`Polyglot ${label} ${score}`, "", ...rows, ...(url ? ["", url] : [])].join("\n");
}

export function newStats() {
  return { played: 0, wins: 0, streak: 0, maxStreak: 0, lastDay: null, lastWinDay: null,
           distribution: Array(MAX_GUESSES).fill(0) };
}

// Record a finished daily puzzle. Recording the same day twice is a no-op.
export function recordResult(stats, { day, won, guesses }) {
  if (stats.lastDay === day) return stats;
  const next = { ...stats, distribution: [...stats.distribution] };
  next.played += 1;
  next.lastDay = day;
  if (won) {
    next.wins += 1;
    next.streak = stats.lastWinDay === day - 1 ? stats.streak + 1 : 1;
    next.maxStreak = Math.max(next.maxStreak, next.streak);
    next.lastWinDay = day;
    next.distribution[guesses - 1] += 1;
  } else {
    next.streak = 0;
  }
  return next;
}

// The streak shown on screen: a streak whose last win is older than
// yesterday is already broken, even if the stats haven't recorded a loss.
export function currentStreak(stats, today) {
  return stats.lastWinDay !== null && today - stats.lastWinDay <= 1 ? stats.streak : 0;
}

// Points for the leaderboard: a win in 1 guess is worth 6, in 6 guesses 1.
export function points(distribution) {
  return distribution.reduce((sum, count, i) => sum + count * (MAX_GUESSES - i), 0);
}

// ---------- hard mode ----------
// In hard mode every guess must be a language that could still be the
// answer, given all the clues so far. A candidate fits a past guess if
// comparing that guess against the candidate gives exactly the same clues.

const TRAIT_LABELS = { paradigm: "Paradigm", typing: "Typing", execution: "Runs as", family: "Looks like" };

export function hardModeViolation(candidate, history) {
  for (const { guess, result } of history) {
    const ifAnswer = compare(guess, candidate);
    for (const key of ["paradigm", "typing", "execution", "family"]) {
      if (ifAnswer[key] === result[key]) continue;
      return result[key] === "hit"
        ? `${TRAIT_LABELS[key]} must be ${guess[key]}`
        : `${TRAIT_LABELS[key]} can't be ${guess[key]}`;
    }
    if (ifAnswer.year !== result.year || ifAnswer.yearArrow !== result.yearArrow) {
      if (result.year === "hit") return `Year must be ${guess.year}`;
      const side = result.yearArrow === "up" ? "after" : "before";
      const range = result.year === "close" ? "within 5 years of" : "more than 5 years from";
      return `Year must be ${side} ${guess.year} and ${range} it`;
    }
  }
  return null;
}

// ---------- challenge links ----------
// A challenge is a snippet plus the challenger's name and score, packed into
// a URL-safe string. It's encoded rather than encrypted: it only hides the
// answer from a casual glance at the link.

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code) {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// GitHub usernames: 1-39 letters, digits or single hyphens, not at the ends.
export const GITHUB_NAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export function encodeChallenge({ index, name = "", guesses = 0, won = false, hard = false }) {
  return toBase64Url(JSON.stringify({ i: index, n: name, g: won ? guesses : 0, h: hard ? 1 : 0 }));
}

export function decodeChallenge(code, snippetCount) {
  try {
    const { i, n, g, h } = JSON.parse(fromBase64Url(code));
    if (!Number.isInteger(i) || i < 0 || i >= snippetCount) return null;
    if (!Number.isInteger(g) || g < 0 || g > MAX_GUESSES) return null;
    return { index: i, name: typeof n === "string" && GITHUB_NAME.test(n) ? n : "", guesses: g, won: g > 0, hard: h === 1 };
  } catch {
    return null;
  }
}

