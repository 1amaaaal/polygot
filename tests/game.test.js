import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LANGUAGES } from "../data/languages.js";
import {
  SCHEDULE, compare, currentStreak, dailyOrder, dailySnippetIndex, dayNumber,
  linesToShow, newStats, parseSnippets, recordResult, shareText,
} from "../src/game.js";
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
