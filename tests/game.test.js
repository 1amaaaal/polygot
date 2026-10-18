import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LANGUAGES } from "../data/languages.js";
import {
  GITHUB_NAME, SCHEDULE, compare, currentStreak, dailyOrder, dailySnippetIndex, dayNumber,
  decodeChallenge, encodeChallenge, hardModeViolation, linesToShow, newStats, parseSnippets,
  points, recordResult, shareText,
} from "../src/game.js";
import { BOTS, botStats, playerWeek, standings, weekStart } from "../src/leaderboard.js";
import { highlightLine } from "../src/highlight.js";

const snippets = parseSnippets(readFileSync(new URL("../data/snippets.txt", import.meta.url), "utf8"));
const byName = Object.fromEntries(LANGUAGES.map((l) => [l.name, l]));

test("every snippet names a known language and has a sensible length", () => {
  for (const s of snippets) {
    assert.ok(byName[s.language], `unknown language "${s.language}"`);
    assert.ok(s.lines.length >= 5 && s.lines.length <= 14,
      `${s.language} snippet has ${s.lines.length} lines: "${s.lines[0]}"`);
  }
});

test("every language has at least two snippets", () => {
  for (const { name } of LANGUAGES) {
    const n = snippets.filter((s) => s.language === name).length;
    assert.ok(n >= 2, `${name} has only ${n} snippet(s)`);
  }
});

test("no snippet spells out its own language", () => {
  for (const s of snippets) {
    const text = s.lines.join("\n").toLowerCase();
    const name = s.language.toLowerCase();
    if (name.length > 2) assert.ok(!text.includes(name), `${s.language} snippet contains its name`);
  }
});

test("the daily pool covers every snippet in the schedule", () => {
  assert.ok(SCHEDULE.at(-1).poolSize <= snippets.length);
});

test("language traits use only the documented values", () => {
  const allowed = {
    paradigm: ["Object-oriented", "Functional", "Procedural", "Multi-paradigm", "Logic", "Declarative"],
    typing: ["Static", "Dynamic", "Untyped"],
    execution: ["Native", "VM", "Interpreted", "JIT", "Transpiled"],
  };
  for (const lang of LANGUAGES) {
    for (const [key, values] of Object.entries(allowed)) {
      assert.ok(values.includes(lang[key]), `${lang.name}.${key} = ${lang[key]}`);
    }
    assert.ok(Number.isInteger(lang.year) && lang.year > 1940 && lang.year < 2030);
  }
  assert.equal(new Set(LANGUAGES.map((l) => l.name.toLowerCase())).size, LANGUAGES.length);
});

test("dayNumber counts local calendar days from launch", () => {
  assert.equal(dayNumber(new Date(2026, 9, 18, 0, 1)), 0);
  assert.equal(dayNumber(new Date(2026, 9, 18, 23, 59)), 0);
  assert.equal(dayNumber(new Date(2026, 9, 19, 0, 0)), 1);
  assert.equal(dayNumber(new Date(2027, 2, 30, 12)), 163); // across a DST change
  assert.equal(dayNumber(new Date(2020, 0, 1)), 0);        // clock set before launch
});

test("the daily order is a stable permutation without back-to-back languages", () => {
  const order = dailyOrder(snippets, 80, 2026);
  assert.deepEqual([...order].sort((a, b) => a - b), [...Array(80).keys()]);
  assert.deepEqual(order, dailyOrder(snippets, 80, 2026));
  for (let i = 1; i < order.length; i++) {
    assert.notEqual(snippets[order[i]].language, snippets[order[i - 1]].language, `day ${i}`);
  }
});

test("appending snippets does not change existing daily puzzles", () => {
  const extended = [...snippets, { language: "Python", lines: ["x", "x", "x", "x", "x"] }];
  for (let day = 0; day < 200; day++) {
    assert.equal(dailySnippetIndex(day, extended), dailySnippetIndex(day, snippets));
  }
});

test("each 80-day cycle uses every pooled snippet exactly once", () => {
  const seen = new Set();
  for (let day = 0; day < 80; day++) seen.add(dailySnippetIndex(day, snippets));
  assert.equal(seen.size, 80);
});

test("compare gives hit/close/miss feedback and a year arrow", () => {
  const r = compare(byName.Java, byName.Kotlin);
  assert.equal(r.correct, false);
  assert.equal(r.typing, "hit");
  assert.equal(r.execution, "hit");
  assert.equal(r.family, "hit");
  assert.equal(r.paradigm, "miss");
  assert.equal(r.year, "miss");
  assert.equal(r.yearArrow, "up");
  assert.equal(compare(byName.Ruby, byName.Lua).year, "close");
  assert.equal(compare(byName.Lua, byName.Ruby).yearArrow, "up");
  assert.equal(compare(byName.Go, byName.Go).correct, true);
});

test("lines are revealed as the player misses", () => {
  assert.equal(linesToShow(10, 0, false), 3);
  assert.equal(linesToShow(10, 2, false), 7);
  assert.equal(linesToShow(10, 5, false), 10);
  assert.equal(linesToShow(10, 0, true), 10);
});

test("share text is spoiler-free emoji rows", () => {
  const results = [compare(byName.Java, byName.Go), compare(byName.Go, byName.Go)];
  const text = shareText({ label: "#3", results, won: true, url: "https://x.test/" });
  assert.equal(text, "Polyglot #3 2/6\n\n⬛⬛🟩⬛🟩\n🟩🟩🟩🟩🟩\n\nhttps://x.test/");
  assert.ok(!text.includes("Go"));
  assert.match(shareText({ label: "#3", results, won: false, colorblind: true }), /X\/6\n\n⬛⬛🟧⬛🟧/);
});

test("stats track streaks and ignore a day recorded twice", () => {
  let s = newStats();
  s = recordResult(s, { day: 1, won: true, guesses: 3 });
  s = recordResult(s, { day: 1, won: true, guesses: 3 });
  s = recordResult(s, { day: 2, won: true, guesses: 1 });
  assert.equal(s.played, 2);
  assert.equal(s.streak, 2);
  assert.deepEqual(s.distribution, [1, 0, 1, 0, 0, 0]);
  assert.equal(currentStreak(s, 3), 2);
  assert.equal(currentStreak(s, 4), 0);
  s = recordResult(s, { day: 4, won: true, guesses: 2 });
  assert.equal(s.streak, 1);
  assert.equal(s.maxStreak, 2);
  s = recordResult(s, { day: 5, won: false, guesses: 6 });
  assert.equal(s.streak, 0);
  assert.equal(s.wins, 3);
});

test("the highlighter escapes HTML and only colours shared syntax", () => {
  assert.equal(highlightLine('<script>alert("x")</script>'),
    '&lt;script&gt;alert(<span class="tok-string">&quot;x&quot;</span>)&lt;/script&gt;');
  assert.match(highlightLine("x = n % 2  # even?"), /tok-comment">#/);
  assert.doesNotMatch(highlightLine("for (i = 0; i < n; i++)"), /tok-comment/);
  assert.match(highlightLine("; a comment"), /^<span class="tok-comment">/);
  assert.doesNotMatch(highlightLine("#include <stdio.h>"), /tok-comment/);
  assert.doesNotMatch(highlightLine("(defn in-stock [inv])"), /tok-keyword/);
  assert.match(highlightLine("for x in xs"), /tok-keyword">in</);
});

test("the home page's example row (Java guessed, answer C) matches the real clues", () => {
  const r = compare(byName.Java, byName.C);
  assert.deepEqual([r.paradigm, r.year, r.yearArrow, r.typing, r.execution, r.family],
    ["miss", "miss", "down", "hit", "miss", "hit"]);
});

test("every language has a creator, a fact and a Wikipedia link", () => {
  for (const l of LANGUAGES) {
    assert.ok(l.creator && l.fact.length > 20, l.name);
    assert.match(l.wiki, /^https:\/\/en\.wikipedia\.org\/wiki\/\S+$/, l.name);
    assert.ok(!l.fact.includes("\n"));
  }
});

test("hard mode only accepts guesses that fit every clue so far", () => {
  const answer = byName.Kotlin;
  const history = [{ guess: byName.Java, result: compare(byName.Java, answer) }];
  assert.equal(hardModeViolation(byName.Kotlin, history), null);
  assert.equal(hardModeViolation(byName.Scala, history), null);
  assert.match(hardModeViolation(byName.Python, history), /Typing must be Static/);
  assert.match(hardModeViolation(byName.Java, history) ?? "", /Paradigm can't be Object-oriented/);
  const yearHistory = [{ guess: byName.Ruby, result: compare(byName.Ruby, byName.Lua) }];
  assert.equal(hardModeViolation(byName.Python, yearHistory), null); // 1991 is within 5 years of 1995
  assert.equal(hardModeViolation(byName.Bash, yearHistory), "Year must be before 1995 and within 5 years of it");
  for (const cand of LANGUAGES) {
    // The real answer can never be rejected.
    assert.equal(hardModeViolation(answer, [{ guess: cand, result: compare(cand, answer) }]), null, cand.name);
  }
});

test("challenge links round-trip and reject garbage", () => {
  const code = encodeChallenge({ index: 7, name: "octo-cat", guesses: 3, won: true, hard: true });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeChallenge(code, 80), { index: 7, name: "octo-cat", guesses: 3, won: true, hard: true });
  assert.deepEqual(decodeChallenge(encodeChallenge({ index: 2, guesses: 6, won: false }), 80),
    { index: 2, name: "", guesses: 0, won: false, hard: false });
  assert.equal(decodeChallenge(code, 5), null);           // snippet index out of range
  assert.equal(decodeChallenge("%%%not-base64", 80), null);
  assert.equal(decodeChallenge(encodeChallenge({ index: 1, guesses: 9, won: true }), 80), null);
});

test("GitHub usernames are validated", () => {
  for (const ok of ["octocat", "a", "octo-cat", "x".repeat(39), "A1b2"]) assert.ok(GITHUB_NAME.test(ok), ok);
  for (const bad of ["", "-x", "x-", "a--b", "x".repeat(40), "has space", "<script>"]) assert.ok(!GITHUB_NAME.test(bad), bad);
});

test("points reward fewer guesses", () => {
  assert.equal(points([1, 0, 0, 0, 0, 1]), 7);
  assert.equal(points([0, 0, 0, 0, 0, 0]), 0);
});

test("bots are deterministic, labelled and ranked with the player", () => {
  assert.deepEqual(botStats(BOTS[0], 30), botStats(BOTS[0], 30));
  const rows = standings({ name: "me", wins: 0, points: 0 }, 30, 24);
  assert.equal(rows.length, BOTS.length + 1);
  assert.equal(rows.filter((r) => !r.bot).length, 1);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].points >= rows[i].points);
  assert.ok(botStats(BOTS[0], 60).points > botStats(BOTS.at(-1), 60).points, "skill matters");
  assert.ok(botStats(BOTS[0], 5, 0).played <= botStats(BOTS[0], 5, 24).played, "bots play later in the day");
});

test("every file the service worker caches exists, and every page's scripts exist", async () => {
  const { existsSync, readdirSync } = await import("node:fs");
  const root = new URL("../", import.meta.url);
  const sw = readFileSync(new URL("sw.js", root), "utf8");
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  for (const asset of assets.filter((a) => a !== "./")) {
    assert.ok(existsSync(new URL(asset, root)), `sw.js caches missing file ${asset}`);
  }
  for (const script of readdirSync(new URL("src/", root))) {
    assert.ok(assets.includes(`src/${script}`), `src/${script} is not cached for offline use`);
  }
  for (const page of readdirSync(root).filter((f) => f.endsWith(".html"))) {
    assert.ok(assets.includes(page), `${page} is not cached for offline use`);
    const html = readFileSync(new URL(page, root), "utf8");
    for (const [, src] of html.matchAll(/(?:src|href)="((?:src|data|icons|fonts)\/[^"]+|[\w.-]+\.(?:css|webmanifest|png))"/g)) {
      assert.ok(existsSync(new URL(src, root)), `${page} references missing ${src}`);
      assert.ok(assets.includes(src) || src.endsWith("og.png"), `${page} uses ${src}, which isn't cached`);
    }
  }
});

test("the leaderboard only counts the last 7 days", () => {
  assert.equal(weekStart(3), 0);
  assert.equal(weekStart(200), 194);
  assert.deepEqual(playerWeek({ 190: 1, 194: 2, 199: 0, 200: 6 }, 200), { wins: 2, points: 6 });
  const weekly = standings({ name: "me", wins: 0, points: 0 }, 200, 24);
  assert.ok(weekly.every((r) => r.points <= 7 * 6), "nobody can have more than a week of points");
});

test("arcade boards rank weekly bests and place the player correctly", async () => {
  const { arcadeStandings, weeklyBest, botArcadeScore } = await import("../src/leaderboard.js");
  assert.equal(weeklyBest([{ day: 1, score: 30 }, { day: 9, score: 4 }, { day: 10, score: 7 }], 10), 7);
  assert.equal(weeklyBest([], 10), null);
  assert.equal(botArcadeScore(BOTS[0], 3, "speed"), botArcadeScore(BOTS[0], 3, "speed"));
  const rows = arcadeStandings("speed", { name: "me", score: 99 }, 10);
  assert.equal(rows[0].name, "me");
  assert.equal(rows.length, BOTS.length + 1);
  const last = arcadeStandings("endless", { name: "me", score: null }, 10);
  assert.equal(last.at(-1).name, "me", "no score this week sorts last");
});

test("badges unlock from saved progress and are claimed once", async () => {
  const { ACHIEVEMENTS, claimNew, evaluate } = await import("../src/achievements.js");
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  const store = {
    stats: { maxStreak: 4 }, collection: { COBOL: { wins: 1 }, Fortran: { wins: 2 }, Clojure: { wins: 1 } },
    counters: { genius: 1 }, speed: { runs: [{ day: 0, score: 12 }] }, endless: { runs: [] }, archive: {},
  };
  const byId = Object.fromEntries(evaluate(store).map((b) => [b.id, b]));
  assert.equal(byId["hello-world"].unlocked, true);
  assert.equal(byId["streak-3"].unlocked, true);
  assert.equal(byId["streak-7"].unlocked, false);
  assert.equal(byId["streak-7"].current, 4);
  assert.equal(byId.legacy.unlocked, true);
  assert.equal(byId.parens.current, 1);
  assert.equal(byId["speed-10"].unlocked, true);
  const first = claimNew(store, "2026-10-18");
  assert.ok(first.some((b) => b.id === "first-try"));
  assert.equal(store.badges["first-try"], "2026-10-18");
  assert.deepEqual(claimNew(store, "2026-10-19"), [], "already-claimed badges aren't announced again");
});

test("Wrapped summarizes play and skips empty slides", async () => {
  const { summarize, slides } = await import("../src/wrapped.js");
  const empty = summarize({});
  assert.equal(empty.hasPlayed, false);
  assert.equal(slides(empty, 2026).length, 2, "intro and outro only");
  const s = summarize({
    stats: { played: 4, wins: 3, maxStreak: 3, distribution: [1, 0, 2, 0, 0, 0] },
    collection: { Clojure: { wins: 3 }, Scheme: { wins: 1 }, C: { wins: 1 } },
    speed: { runs: [{ day: 1, score: 14 }] },
  });
  assert.equal(s.daily.winRate, 75);
  assert.equal(s.daily.average, 2.3);
  assert.equal(s.topLanguage.name, "Clojure");
  assert.equal(s.family, "Lisp");
  assert.equal(s.oldest.name, "C");
  const story = slides(s, 2026);
  assert.ok(story.some((x) => x.big === "Parenthesis Whisperer"));
  assert.ok(story.at(-1).final);
});
