// Polyglot Wrapped: a summary of everything the player has done, turned into
// a short sequence of slides. Pure functions, so it can be tested in Node.

import { LANGUAGES } from "../data/languages.js";
import { MAX_GUESSES } from "./game.js";
import { evaluate } from "./achievements.js";

const PERSONALITY = {
  "C-like": ["Curly Brace Loyalist", "Braces, semicolons, home."],
  Indentation: ["Whitespace Purist", "You read indentation like punctuation."],
  "Ruby-like": ["End-Block Enthusiast", "do … end is your love language."],
  "Algol/Pascal": ["Begin…End Traditionalist", "You respect a well-declared block."],
  "ML-like": ["Type Theorist", "Pattern matching is just how you think."],
  Lisp: ["Parenthesis Whisperer", "Where others see brackets, you see structure."],
  Shell: ["Terminal Dweller", "Pipes, flags and dollar signs don't scare you."],
  Declarative: ["Query Thinker", "You say what you want, not how to get it."],
  Scientific: ["Number Cruncher", "Matrices before breakfast."],
  BASIC: ["Classic BASIC Fan", "Dim, Sub, End Sub. Respect."],
  Other: ["Low-Level Archaeologist", "Registers and divisions: you dig deep."],
};

const byName = Object.fromEntries(LANGUAGES.map((l) => [l.name, l]));

export function summarize(store) {
  const stats = store.stats ?? {};
  const dist = stats.distribution ?? Array(MAX_GUESSES).fill(0);
  const collection = store.collection ?? {};
  const solvedTotal = Object.values(collection).reduce((s, e) => s + e.wins, 0);
  const daily = { played: stats.played ?? 0, wins: stats.wins ?? 0, maxStreak: stats.maxStreak ?? 0 };
  daily.winRate = daily.played ? Math.round((100 * daily.wins) / daily.played) : 0;
  const winGuesses = dist.reduce((s, n, i) => s + n * (i + 1), 0);
  daily.average = daily.wins ? Math.round((10 * winGuesses) / daily.wins) / 10 : null;

  const top = Object.entries(collection).sort((a, b) => b[1].wins - a[1].wins || a[0].localeCompare(b[0]))[0];
  const families = {};
  for (const [name, e] of Object.entries(collection)) {
    const family = byName[name]?.family;
    if (family) families[family] = (families[family] ?? 0) + e.wins;
  }
  const family = Object.entries(families).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  const oldest = Object.keys(collection).map((n) => byName[n]).filter(Boolean).sort((a, b) => a.year - b.year)[0] ?? null;
  const badges = evaluate(store);
  const best = (runs = []) => runs.reduce((m, r) => Math.max(m, r.score), 0);

  return {
    hasPlayed: solvedTotal > 0 || daily.played > 0,
    daily,
    solvedTotal,
    topLanguage: top ? { name: top[0], wins: top[1].wins } : null,
    family,
    personality: family ? PERSONALITY[family] : null,
    oldest,
    collected: Object.keys(collection).length,
    totalLanguages: LANGUAGES.length,
    speedBest: best(store.speed?.runs),
    speedRuns: store.speed?.runs?.length ?? 0,
    endlessBest: best(store.endless?.runs),
    badges: { unlocked: badges.filter((b) => b.unlocked).length, total: badges.length },
  };
}

// The story, one slide per thing worth celebrating. Slides with nothing to
// say are left out, so a new player gets a short story, not a list of zeros.
export function slides(summary, year) {
  const s = summary;
  const out = [{ kicker: `Polyglot Wrapped ${year}`, big: "Your year in code", text: "Let's see what kind of polyglot you are." }];
  if (s.daily.played) {
    out.push({ kicker: "Daily puzzles", big: String(s.daily.played),
      text: `puzzles played, and you won ${s.daily.winRate}% of them${s.daily.average ? `, in ${s.daily.average} guesses on average` : ""}.` });
  }
  if (s.daily.maxStreak > 1) out.push({ kicker: "Longest streak", big: `${s.daily.maxStreak} days`, text: "in a row without missing a puzzle." });
  if (s.topLanguage) {
    out.push({ kicker: "Your language", big: s.topLanguage.name,
      text: `You solved it ${s.topLanguage.wins === 1 ? "once" : `${s.topLanguage.wins} times`}, more than any other.` });
  }
  if (s.personality) out.push({ kicker: "You are a…", big: s.personality[0], text: s.personality[1] });
  if (s.collected) {
    out.push({ kicker: "Collection", big: `${s.collected}/${s.totalLanguages}`,
      text: s.oldest ? `languages collected. The oldest: ${s.oldest.name}, from ${s.oldest.year}.` : "languages collected." });
  }
  if (s.speedBest || s.endlessBest) {
    const parts = [];
    if (s.speedBest) parts.push(`${s.speedBest} in a 60-second speed run`);
    if (s.endlessBest) parts.push(`${s.endlessBest} in a row in endless mode`);
    out.push({ kicker: "Arcade", big: String(Math.max(s.speedBest, s.endlessBest)), text: `Your best: ${parts.join(", and ")}.` });
  }
  out.push({ kicker: "That's a wrap", big: `${s.badges.unlocked} badges`, text: `unlocked out of ${s.badges.total}. See you tomorrow.`, final: true });
  return out;
}
