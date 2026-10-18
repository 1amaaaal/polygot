// The puzzle page. One snippet at a time, in one of five modes:
//   daily      today's puzzle, the one that counts for stats and the leaderboard
//   archive    a past daily puzzle (?day=N)
//   challenge  a friend's snippet from a challenge link (?c=...)
//   practice   a random snippet (?mode=practice)
//   endless    random snippets until you miss one (?mode=endless)

import { LANGUAGES } from "../data/languages.js";
import {
  MAX_GUESSES, compare, currentStreak, dailySnippetIndex, dayNumber, decodeChallenge,
  encodeChallenge, hardModeViolation, linesToShow, parseSnippets, recordResult,
  scoreLabel, shareText,
} from "./game.js";
import { arcadeStandings, weeklyBest } from "./leaderboard.js";
import { celebrateBadges, el, initLayout, onSettingsChange, reportUrl, toast } from "./layout.js";
import { canvasToFile, drawResultCard } from "./share-image.js";
import { collect, count, recordRun, save, store } from "./store.js";
import {
  LanguagePicker, boardRows, confetti, describe, distributionBars, downloadFile, languageOf,
  puzzleDate, renderCode, resolveLanguage, shake, shareOrCopy, siteUrl, untilMidnight,
} from "./ui.js";

const params = new URLSearchParams(location.search);
const arcadeMode = ["practice", "endless"].includes(params.get("mode")) || params.has("day");
initLayout(arcadeMode ? "arcade" : "play");

const $ = (id) => document.getElementById(id);

// ---------- state ----------
let snippets = [];
let today = dayNumber();
let mode = "daily";
let game = null;        // { index, guesses: [names], hard }
let archiveDay = null;  // archive mode: the day being replayed
let challenger = null;  // challenge mode: the decoded link
let run = null;         // endless mode: { score, seen: Set, record }
let shownLines = 0;     // lines already on screen, so new ones can type in

const answer = () => languageOf(snippets[game.index].language);
const results = () => game.guesses.map((g) => compare(languageOf(g), answer()));
const isWon = () => results().some((r) => r.correct);
const isFinished = () => isWon() || game.guesses.length >= MAX_GUESSES;
const dailyIndex = () => dailySnippetIndex(today, snippets);

function start(nextMode, index, extra = {}) {
  mode = nextMode;
  game = { index, guesses: extra.guesses ?? [], hard: extra.hard ?? Boolean(store.settings.hard) };
  shownLines = 0;
  picker.clear();
  render();
}

function startDaily() {
  today = dayNumber();
  if (!store.daily || store.daily.day !== today) {
    store.daily = { day: today, guesses: [], hard: Boolean(store.settings.hard), done: false };
    save();
  }
  start("daily", dailyIndex(), { guesses: store.daily.guesses, hard: store.daily.hard });
}

// A random snippet that isn't today's puzzle (no spoilers) or one in `avoid`.
function randomIndex(avoid = new Set()) {
  const options = snippets.map((_, i) => i).filter((i) => i !== dailyIndex() && i !== game?.index && !avoid.has(i));
  const pool = options.length ? options : snippets.map((_, i) => i).filter((i) => i !== dailyIndex());
  return pool[Math.floor(Math.random() * pool.length)];
}

function startEndless() {
  run = { score: 0, seen: new Set(), record: null };
  nextEndless();
}

function nextEndless() {
  const index = randomIndex(run.seen);
  run.seen.add(index);
  start("endless", index);
  $("guess-input").focus();
}

// ---------- rendering ----------
function renderHead() {
  const [kicker, title] = {
    daily: ["Daily puzzle", `#${today + 1} · ${puzzleDate(today)}`],
    archive: ["From the archive", `#${archiveDay + 1} · ${puzzleDate(archiveDay)}`],
    challenge: ["Challenge", challenger?.name ? `From @${challenger.name}` : "From a friend"],
    practice: ["Practice", "Random snippet"],
    endless: ["Endless", `Snippet ${run?.seen.size ?? 1}`],
  }[mode];
  $("mode-kicker").textContent = kicker;
  $("mode-title").textContent = title;
  document.title = `${mode === "daily" ? "Today" : kicker} · Polyglot`;
  $("hard-badge").hidden = !game.hard;
  $("run-pill").hidden = mode !== "endless";
  if (run) $("run-pill").textContent = `${run.score} in a row`;
  $("stats-btn").hidden = mode !== "daily";

  const banner = $("challenge-banner");
  banner.hidden = mode !== "challenge" && !(mode === "daily" && challenger);
  if (!banner.hidden) {
    const who = challenger.name ? `@${challenger.name}` : "Your friend";
    banner.textContent = challenger.won
      ? `${who} solved this in ${challenger.guesses}/${MAX_GUESSES}${challenger.hard ? " on hard mode" : ""}. Can you beat that?`
      : `${who} couldn't solve this one. Can you?`;
  }
}

function renderCodePanel() {
  const lines = snippets[game.index].lines;
  const misses = results().filter((r) => !r.correct).length;
  const visible = linesToShow(lines.length, misses, isFinished());
  renderCode($("code"), lines, { visible, plain: game.hard && !isFinished(),
                                 animateFrom: shownLines > 0 ? shownLines : Infinity });
  shownLines = visible;
  $("reveal-info").textContent = isFinished()
    ? `${answer().name} · ${lines.length} lines`
    : `${visible} of ${lines.length} lines`;
}

const guessCount = (n) => (n === Infinity ? "no solve" : `${n} ${n === 1 ? "guess" : "guesses"}`);

function versusText() {
  const who = challenger.name ? `@${challenger.name}` : "your friend";
  const mine = isWon() ? game.guesses.length : Infinity;
  const theirs = challenger.won ? challenger.guesses : Infinity;
  if (mine === Infinity && theirs === Infinity) return `Neither you nor ${who} got this one.`;
  if (mine === theirs) return `A tie with ${who}: ${guessCount(mine)} each.`;
  return mine < theirs
    ? `You beat ${who}: ${guessCount(mine)} to their ${guessCount(theirs)}.`
    : `${who} wins this one: ${guessCount(theirs)} to your ${guessCount(mine)}.`;
}

const button = (text, onclick, primary = false) =>
  el("button", { class: primary ? "btn primary" : "btn", type: "button", text, onclick });

function resultActions() {
  if (mode === "endless" && isWon()) return [button("Next snippet", nextEndless, true)];
  if (mode === "endless") return [button("Try again", startEndless, true), button("Copy result", shareEndless)];
  if (mode === "practice") {
    return [button("Next snippet", () => { start("practice", randomIndex()); $("guess-input").focus(); }, true),
            button("Challenge a friend", challengeFriend)];
  }
  return [button("Copy result", shareResult, true), button("Share image", shareImage),
          button("Challenge a friend", challengeFriend)];
}

function renderResult() {
  const done = isFinished();
  $("result").hidden = !done;
  $("guess-input").disabled = done;
  $("guess-btn").disabled = done;
  $("guess-count").textContent = done ? "" : `Guess ${game.guesses.length + 1} of ${MAX_GUESSES}`;
  if (!done) return;

  const a = answer();
  const n = game.guesses.length;
  $("result-title").textContent = isWon()
    ? `${["First try.", "Two guesses.", "Three guesses.", "Four guesses.", "Five guesses.", "Just in time."][n - 1]} It's ${a.name}.`
    : `It was ${a.name}.`;
  const line = $("result-line");
  line.hidden = true;
  if (mode === "challenge" || (mode === "daily" && challenger)) {
    line.hidden = false;
    line.textContent = versusText();
  } else if (mode === "endless" && !isWon()) {
    showRank("endless", run.score, `Run over: ${run.score} in a row.`);
  }
  $("result-actions").replaceChildren(...resultActions());

  $("about-title").textContent = `About ${a.name}`;
  $("about-text").textContent = `${describe(a)} Created by ${a.creator}.`;
  $("about-fact").textContent = a.fact;
  $("about-wiki").href = a.wiki;
  $("about-report").href = reportUrl(a);
  updateCountdown();
}

// Where a finished arcade run puts the player on this week's board.
function showRank(kind, score, prefix) {
  const runs = store[kind].runs;
  const best = weeklyBest(runs, today);
  const rows = arcadeStandings(kind, { name: store.github || "you", score: best }, today, new Date().getHours());
  const me = rows.find((r) => !r.bot);
  const earlier = runs.filter((r) => r !== run?.record).reduce((m, r) => Math.max(m, r.score), 0);
  const line = $("result-line");
  line.hidden = false;
  line.replaceChildren(
    `${prefix} `,
    score > 0 && score > earlier ? "A new personal best. " : "",
    best ? el("a", { href: `leaderboard.html#${kind}`, text: `You're #${me.rank} of ${rows.length} on this week's board.` }) : "",
  );
}

function render(animateLast = false) {
  renderHead();
  renderCodePanel();
  $("board").replaceChildren(...boardRows(game.guesses, results(), { animateLast, placeholders: !isFinished() }));
  renderResult();
}

function updateCountdown() {
  $("next-puzzle").textContent = mode === "daily"
    ? `Next puzzle in ${untilMidnight()}`
    : "This one doesn't count towards your daily stats.";
}

// ---------- guessing ----------
function finish() {
  const won = isWon();
  const n = game.guesses.length;
  if (mode === "daily") {
    store.daily.done = true;
    store.stats = recordResult(store.stats, { day: today, won, guesses: n });
    store.history[today] ??= won ? n : 0;
  } else if (mode === "archive") {
    store.archive[archiveDay] ??= won ? n : 0;
  }
  if (won) {
    if (n === 1) count("genius");
    if (n === MAX_GUESSES) count("clutch");
    if (game.hard) count("hardWins");
    if (challenger && (mode === "challenge" || mode === "daily") && (!challenger.won || n < challenger.guesses)) count("challengesWon");
    if (mode === "endless") {
      run.score += 1;
      // Saved as it grows, so leaving mid-run still keeps the score.
      if (run.record) run.record.score = run.score;
      else recordRun("endless", run.record = { day: today, score: run.score });
    } else {
      confetti();
    }
    if (collect(answer().name)) {
      const total = Object.keys(store.collection).length;
      setTimeout(() => toast(`New language collected: ${answer().name} (${total}/${LANGUAGES.length})`), 900);
    }
  }
  save();
  render(true);
  celebrateBadges(won ? 2600 : 1200);
  setTimeout(() => $("result").scrollIntoView({ behavior: "smooth", block: "nearest" }), 450);
  if (mode === "endless" && won) setTimeout(() => $("result-actions").firstChild?.focus({ preventScroll: true }), 50);
  if (mode === "daily") setTimeout(openStats, 1800);
}

function submitGuess(text) {
  if (isFinished()) return;
  const form = $("guess-form");
  const lang = resolveLanguage(text);
  const problem = !lang ? (text.trim() ? "Not in the language list" : "Type a language first")
    : game.guesses.includes(lang.name) ? `You already guessed ${lang.name}`
    : game.hard ? hardModeViolation(lang, game.guesses.map((g, i) => ({ guess: languageOf(g), result: results()[i] })))
    : null;
  if (problem) {
    shake(form);
    toast(game.hard && lang && !game.guesses.includes(lang.name) ? `Hard mode: ${problem}` : problem);
    return;
  }
  game.guesses.push(lang.name);
  picker.clear();
  if (mode === "daily") {
    store.daily.guesses = game.guesses;
    save();
  }
  render(true);
  if (isFinished()) finish();
  else $("guess-input").focus();
}

const picker = new LanguagePicker($("guess-form"), $("guess-input"), $("suggestions"), {
  exclude: () => new Set(game?.guesses ?? []),
  onPick: submitGuess,
});

// ---------- sharing ----------
const label = () => ({ daily: `#${today + 1}`, archive: `#${archiveDay + 1} (archive)`,
                       challenge: "(challenge)", practice: "(practice)" }[mode]);

function shareResult() {
  shareOrCopy({ text: shareText({ label: label(), results: results(), won: isWon(), hard: game.hard,
                                  colorblind: Boolean(store.settings.colorblind), url: siteUrl() }) });
}

function shareEndless() {
  shareOrCopy({ text: `Polyglot endless: ${run.score} in a row\n${siteUrl()}` });
}

async function shareImage() {
  const canvas = await drawResultCard({
    title: { daily: `Daily puzzle #${today + 1}`, archive: `Puzzle #${archiveDay + 1}`, challenge: "Challenge" }[mode],
    score: scoreLabel(results(), isWon(), game.hard), results: results(), name: store.github,
    colorblind: Boolean(store.settings.colorblind), url: siteUrl(),
  });
  const file = await canvasToFile(canvas, `polyglot-${mode === "daily" ? today + 1 : mode}.png`);
  if (!(await shareOrCopy({ text: "Can you beat my Polyglot score?", files: [file] }))) {
    downloadFile(file);
    toast("Image downloaded");
  }
}

function challengeFriend() {
  const code = encodeChallenge({ index: game.index, name: store.github, guesses: game.guesses.length,
                                 won: isWon(), hard: game.hard });
  const url = new URL("play.html", siteUrl());
  url.searchParams.set("c", code);
  const text = `Can you beat my ${scoreLabel(results(), isWon(), game.hard)} on this Polyglot snippet?`;
  shareOrCopy({ text, url: url.href }, "Challenge link copied");
}

// ---------- stats dialog ----------
function openStats() {
  const s = store.stats;
  const stat = (value, text) => el("div", {}, el("b", { text: String(value) }), el("span", { text }));
  $("stat-grid").replaceChildren(
    stat(s.played, "Played"),
    stat(s.played ? Math.round((100 * s.wins) / s.played) : 0, "Win %"),
    stat(currentStreak(s, today), "Streak"),
    stat(s.maxStreak, "Best streak"),
  );
  const wonToday = mode === "daily" && isFinished() && isWon() ? game.guesses.length : 0;
  $("dist").replaceChildren(...distributionBars(s.distribution, wonToday));
  $("stats-dialog").showModal();
}

// ---------- wiring ----------
$("stats-btn").addEventListener("click", openStats);
onSettingsChange((settings) => {
  if (game && game.guesses.length === 0) {
    game.hard = Boolean(settings.hard);
    if (mode === "daily") { store.daily.hard = game.hard; save(); }
    render();
  }
});
setInterval(() => { if (!$("result").hidden && mode === "daily") updateCountdown(); }, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && mode === "daily" && dayNumber() !== today) startDaily();
});

// ---------- start ----------
try {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  if (!res.ok) throw new Error(res.status);
  snippets = parseSnippets(await res.text());

  const code = params.get("c");
  challenger = code ? decodeChallenge(code, snippets.length) : null;
  if (code && !challenger) toast("That challenge link looks broken");

  const puzzle = params.has("day") ? Number(params.get("day")) : null;
  const pastPuzzle = Number.isInteger(puzzle) && puzzle >= 1 && puzzle <= today;
  if (puzzle !== null && !pastPuzzle && puzzle !== today + 1) toast("That puzzle isn't available yet");

  if (challenger && challenger.index !== dailyIndex()) start("challenge", challenger.index);
  else if (!challenger && pastPuzzle) { archiveDay = puzzle - 1; start("archive", dailySnippetIndex(archiveDay, snippets)); }
  else if (!challenger && params.get("mode") === "practice") start("practice", randomIndex());
  else if (!challenger && params.get("mode") === "endless") startEndless();
  else startDaily();   // a challenge on today's snippet is played as the daily puzzle

  if (!store.seenHelp) {
    store.seenHelp = true;
    save();
    $("help-dialog").showModal();
  }
} catch (err) {
  $("reveal-info").textContent = "Couldn't load the snippet. Try refreshing.";
  console.error(err);
}
