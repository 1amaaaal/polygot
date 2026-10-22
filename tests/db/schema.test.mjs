// Tests supabase/schema.sql on a real Postgres: who can read and write what,
// and every path through play_daily(). Needs psql and a server to connect to,
// set with the usual PGHOST, PGPORT, PGUSER and PGPASSWORD variables:
//   PGHOST=localhost PGUSER=postgres npm run test:db
// It creates and drops a database called polyglot_test.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { LANGUAGES } from "../../data/languages.js";
import { compare, dailySnippetIndex, lineShape, parseSnippets } from "../../src/game.js";
import { dailyPuzzles, dailySql, languagesSql } from "../../tools/seed.mjs";

const DB = "polyglot_test";
const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const snippets = parseSnippets(read("data/snippets.txt"));
const byName = Object.fromEntries(LANGUAGES.map((l) => [l.name, l]));
const ALICE = "aaaaaaaa-0000-0000-0000-000000000001";
const BOB = "bbbbbbbb-0000-0000-0000-000000000002";

// Runs SQL as the given API role (anon unless a user is given), like a
// request through Supabase would. Returns the output, or throws with
// Postgres's message.
function sql(text, { db = DB, role, user = "" } = {}) {
  const prefix = role ? `set role ${role};\nset request.jwt.claim.sub = '${user}';\n` : "";
  try {
    return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db],
      { input: prefix + text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    throw new Error(String(err.stderr).replace(/^.*?ERROR:\s*/s, "").split("\n")[0]);
  }
}
const quote = (s) => `'${s.replaceAll("'", "''")}'`;
const array = (items) => (items.length ? `array[${items.map(quote).join(", ")}]::text[]` : "'{}'::text[]");

function play(day, guesses = [], { user = "", hard = false } = {}) {
  return JSON.parse(sql(`select public.play_daily(${day}, ${array(guesses)}, ${hard})::text;`,
    { role: user ? "authenticated" : "anon", user }));
}

let today;
const answerOn = (day) => snippets[dailySnippetIndex(day, snippets)];
const wrongFor = (day, n = 6) => LANGUAGES.map((l) => l.name).filter((name) => name !== answerOn(day).language).slice(0, n);

before(() => {
  sql(`drop database if exists ${DB}; create database ${DB};`, { db: "postgres" });
  sql(read("tests/db/supabase-stub.sql"));
  sql(read("supabase/schema.sql"));
  sql(read("supabase/schema.sql"));     // running it twice must be harmless
  sql(languagesSql());
  today = Number(sql("select public.puzzle_day();"));
  sql(dailySql(dailyPuzzles({ publicSnippets: snippets, privateSnippets: [], start: today + 3 }), today + 3));
  sql(`insert into auth.users (id, raw_user_meta_data) values
         ('${ALICE}', '{"user_name": "alice"}'), ('${BOB}', '{"user_name": "bob"}');
       insert into auth.identities (user_id, provider, identity_data) values
         ('${ALICE}', 'github', '{"user_name": "alice", "avatar_url": null}'),
         ('${BOB}', 'github', '{"user_name": "bob"}');`);
});

test("languages.sql matches data/languages.js", () => {
  assert.equal(read("supabase/languages.sql"), languagesSql(), "run: node tools/seed.mjs languages > supabase/languages.sql");
});

test("names on the board come from GitHub, not from metadata a player can edit", () => {
  // What a signed-in player can do through the API: rewrite their own user_metadata.
  sql(`update auth.users set raw_user_meta_data = '{"user_name": "torvalds", "avatar_url": "https://evil.example/x.png"}'
       where id = '${ALICE}';`);
  assert.equal(sql(`select username || ' ' || coalesce(avatar_url, '-') from public.profiles where id = '${ALICE}';`), "alice -");
  // A new sign-in brings GitHub's current details.
  sql(`update auth.identities set identity_data = '{"user_name": "alice-renamed"}' where user_id = '${ALICE}';`);
  assert.equal(sql(`select username from public.profiles where id = '${ALICE}';`), "alice-renamed");
  sql(`update auth.identities set identity_data = '{"user_name": "alice"}' where user_id = '${ALICE}';`);
  assert.throws(() => sql(`update public.profiles set username = 'torvalds' where id = '${ALICE}';`,
    { role: "authenticated", user: ALICE }), /permission denied|row-level security/);
  assert.equal(sql(`select username from public.profiles where id = '${ALICE}';`), "alice");
});

test("visitors can't read the puzzles or write results themselves", () => {
  for (const [role, user] of [["anon", ""], ["authenticated", ALICE]]) {
    assert.throws(() => sql("select language from private.daily_puzzles;", { role, user }), /permission denied/);
    assert.throws(() => sql("select * from private.daily_plays;", { role, user }), /permission denied/);
    assert.throws(() => sql(`insert into public.daily_results (user_id, day, guesses) values ('${ALICE}', ${today}, 1);`,
      { role, user }), /permission denied/);
    assert.throws(() => sql("insert into public.languages values ('Klingon', 1990, 'Logic', 'Static', 'VM', 'Other');",
      { role, user }), /permission denied|row-level security/);
    assert.equal(Number(sql("select count(*) from public.languages;", { role, user })), LANGUAGES.length);
  }
});

test("a new puzzle shows three lines and the shape of the rest, and no answer", () => {
  const view = play(today);
  const { lines } = answerOn(today);
  assert.deepEqual(view.lines, lines.slice(0, 3));
  assert.deepEqual(view.hidden, lines.slice(3).map(lineShape));
  assert.equal(view.total, lines.length);
  assert.deepEqual([view.done, view.won, view.answer, view.results], [false, false, null, []]);
  assert.deepEqual(Object.keys(view).sort(), ["answer", "done", "guesses", "hard", "hidden", "lines", "results", "total", "won"]);
});

test("the server's clues match the site's for every language", () => {
  const answer = byName[answerOn(today).language];
  for (const lang of LANGUAGES) {
    const [result] = play(today, [lang.name]).results;
    assert.deepEqual(result, compare(lang, answer), lang.name);
  }
});

test("each miss earns two more lines; a win or six guesses reveals everything", () => {
  const { lines, language } = answerOn(today);
  const wrong = wrongFor(today);
  assert.equal(play(today, wrong.slice(0, 1)).lines.length, Math.min(lines.length, 5));
  assert.equal(play(today, wrong.slice(0, 2)).lines.length, Math.min(lines.length, 7));
  const won = play(today, [wrong[0], language]);
  assert.deepEqual([won.done, won.won, won.answer, won.lines, won.hidden], [true, true, language, lines, []]);
  const lost = play(today, wrong);
  assert.deepEqual([lost.done, lost.won, lost.answer, lost.lines.length], [true, false, language, lines.length]);
});

test("bad guesses and unavailable days are refused", () => {
  const { language } = answerOn(today);
  const wrong = wrongFor(today);
  assert.throws(() => play(today, ["Klingon"]), /Not in the language list: Klingon/);
  assert.throws(() => play(today, [wrong[0], wrong[0]]), /You already guessed/);
  assert.throws(() => play(today, [language, wrong[0]]), /already solved/);
  assert.throws(() => play(today, [...wrong, language]), /at most 6 guesses/);
  assert.throws(() => play(today + 2), /isn't available yet/);
  assert.throws(() => play(-1), /isn't available yet/);
});

test("a signed-in player's guesses are saved and can only be added to", () => {
  const { language } = answerOn(today);
  const [w1, w2] = wrongFor(today);
  assert.deepEqual(play(today, [w1], { user: ALICE }).guesses, [w1]);
  assert.deepEqual(play(today, [], { user: ALICE }).guesses, [w1], "a fresh device gets the saved guesses");
  assert.deepEqual(play(today, [w2], { user: ALICE }).guesses, [w1], "a different history can't replace them");
  assert.deepEqual(play(today, [language], { user: ALICE }).guesses, [w1], "nor can a perfect one");
  const done = play(today, [w1, language], { user: ALICE });
  assert.deepEqual([done.guesses, done.won], [[w1, language], true]);
  play(today, [w1, language], { user: ALICE });
  assert.equal(sql(`select guesses from public.daily_results where user_id = '${ALICE}' and day = ${today};`), "2");
  assert.equal(Number(sql(`select count(*) from public.daily_results where user_id = '${ALICE}';`)), 1);
  const board = JSON.parse(sql(`select json_agg(b)::text from public.daily_board(${today}) b;`, { role: "anon" }));
  assert.deepEqual(board, [{ username: "alice", avatar_url: null, points: 5, wins: 1 }]);
});

test("hard mode is fixed by the first guess, and a loss is recorded as 0", () => {
  const wrong = wrongFor(today);
  assert.equal(play(today, [], { user: BOB, hard: true }).hard, true);
  assert.equal(play(today, [wrong[0]], { user: BOB, hard: false }).hard, false, "not fixed until a guess is made");
  assert.equal(play(today, wrong.slice(0, 2), { user: BOB, hard: true }).hard, false);
  play(today, wrong, { user: BOB });
  assert.equal(sql(`select guesses || ' ' || hard from public.daily_results where user_id = '${BOB}' and day = ${today};`), "0 false");
});

test("old puzzles are checked but not saved or put on the board", () => {
  const day = today - 3;
  const { language } = answerOn(day);
  assert.equal(play(day, [language], { user: BOB }).won, true);
  assert.equal(Number(sql(`select count(*) from private.daily_plays where day = ${day};`)), 0);
  assert.equal(Number(sql(`select count(*) from public.daily_results where day = ${day};`)), 0);
});

test("anonymous players are never saved", () => {
  play(today + 1, wrongFor(today + 1, 2));
  assert.equal(Number(sql(`select count(*) from private.daily_plays where day = ${today + 1};`)), 0);
});

test("when the puzzles run out, they start again from the first", () => {
  sql(`create table saved as select * from private.daily_puzzles where day >= ${today};
       delete from private.daily_puzzles where day >= ${today};`);
  try {
    assert.deepEqual(play(today).lines, answerOn(today % today).lines.slice(0, 3));
  } finally {
    sql("insert into private.daily_puzzles select * from saved; drop table saved;");
  }
});
