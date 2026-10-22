// The puzzle page. One snippet at a time, in one of five modes:
//   daily      today's puzzle, the one that counts for stats and the leaderboard
//   archive    a past daily puzzle (?day=N)
//   challenge  a friend's puzzle from a challenge link (?c=...)
//   practice   a random snippet (?mode=practice)
//   endless    random snippets until you miss one (?mode=endless)
//
// Daily puzzles (today's, the archive's and challenges on them) are played
// through the server, which keeps their answers: the page only ever has the
// lines and clues the player has earned. The arcade modes use the public
// snippets in snippets.txt and work offline.

import { LANGUAGES } from "../data/languages.js";
import {
  MAX_GUESSES, currentStreak, dayNumber, decodeChallenge, encodeChallenge, hardModeViolation,
  parseSnippets, puzzleView, recordResult, scoreLabel, shareText,
} from "./game.js";
import { rankLink } from "./boards.js";
import { celebrateBadges, el, initLayout, onSettingsChange, reportUrl, toast } from "./layout.js";
import { playDaily } from "./server.js";
import { canvasToFile, drawResultCard } from "./share-image.js";
import { collect, count, recordRun, save, store } from "./store.js";
import { pushSoon } from "./sync.js";
import {
  LanguagePicker, boardRows, confetti, describe, distributionBars, downloadFile, languageOf,
  puzzleDate, renderCode, resolveLanguage, shake, shareOrCopy, siteUrl, untilMidnight,
} from "./ui.js";

const params = new URLSearchParams(location.search);
const arcadeMode = ["practice", "endless"].includes(params.get("mode")) || params.has("day");
initLayout(arcadeMode ? "arcade" : "play");

const $ = (id) => document.getElementById(id);

// ---------- state ----------
let snippets = [];      // the arcade snippets, from snippets.txt
let today = dayNumber();
let mode = "daily";
// The puzzle on screen: `day` for a daily puzzle, played through the server,
// or `index` for an arcade snippet. `view` is what the player has earned so
// far (see puzzleView in game.js); it is null while the server is asked.
let game = null;        // { day | index, guesses: [names], hard, view }
let archiveDay = null;  // archive mode: the day being replayed
let challenger = null;  // challenge mode: the decoded link
let run = null;         // endless mode: { score, seen: Set, record }
let shownLines = 0;     // lines already on screen, so new ones can type in
let waiting = false;    // a guess is on its way to the server
let loads = 0;          // counts puzzle loads, so a late reply can't land on a newer puzzle

const onServer = () => Number.isInteger(game?.day);
const results = () => game.view.results;
const isWon = () => game.view.won;
const isFinished = () => game.view.done;
const answer = () => languageOf(game.view.answer);   // only known once the puzzle is over

const localView = (index, guesses) =>
  puzzleView(snippets[index].lines, languageOf(snippets[index].language), guesses.map(languageOf));

// Takes the server's view, including its saved guesses, which win over ours.
function adopt(view) {
  game.view = view;
  game.guesses = view.guesses;
  game.hard = view.hard;
  if (mode === "daily") {
    store.daily.guesses = view.guesses;
    store.daily.hard = view.hard;
    save();
  }
}

async function start(nextMode, puzzle, extra = {}) {
  mode = nextMode;
  const load = ++loads;
  game = { ...puzzle, guesses: extra.guesses ?? [], hard: extra.hard ?? Boolean(store.settings.hard), view: null };
  shownLines = 0;
  picker.clear();
  showError("");
  if (!onServer()) {
    game.view = localView(game.index, game.guesses);
    render();
    return;
  }
  renderLoading();
  let view;
  try {
    view = await playDaily({ day: game.day, guesses: game.guesses, hard: game.hard });
  } catch (err) {
    if (load !== loads) return;
    // Saved guesses the server won't take (say, from before the puzzles moved
    // to the server): start this puzzle afresh. Only for a refusal (400), not
    // when the server itself is failing, which mustn't cost the player anything.
    if (err.status === 400 && game.guesses.length) {
      if (mode === "daily") Object.assign(store.daily, { guesses: [], done: false });
      return start(nextMode, puzzle, { ...extra, guesses: [] });
    }
    renderLoadError(err, () => start(nextMode, puzzle, extra));
    return;
  }
  if (load !== loads) return;
  adopt(view);
  render();
  // Finished on another device: record it here too, without the fanfare.
  const recorded = mode === "daily" ? store.daily.done : mode === "archive" ? store.archive[archiveDay] !== undefined : true;
  if (isFinished() && !recorded) finish({ quiet: true });
}

function startDaily() {
  today = dayNumber();
  if (!store.daily || store.daily.day !== today) {
    store.daily = { day: today, guesses: [], hard: Boolean(store.settings.hard), done: false };
    save();
  }
  start("daily", { day: today }, { guesses: store.daily.guesses, hard: store.daily.hard });
}

// A random arcade snippet other than the one on screen or any in `avoid`.
function randomIndex(avoid = new Set()) {
  const options = snippets.map((_, i) => i).filter((i) => i !== game?.index && !avoid.has(i));
  const pool = options.length ? options : snippets.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
}

function startEndless() {
  run = { score: 0, seen: new Set(), record: null };
  nextEndless();
}

function nextEndless() {
  const index = randomIndex(run.seen);
  run.seen.add(index);
  start("endless", { index });
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
  const { lines, hidden, total } = game.view;
  renderCode($("code"), { lines, hidden }, { plain: game.hard && !isFinished(),
                                            animateFrom: shownLines > 0 ? shownLines : Infinity });
  shownLines = lines.length;
  $("load-error").hidden = true;
  $("code").hidden = false;
  $("reveal-info").textContent = isFinished()
    ? `${answer().name} · ${total} lines`
    : `${lines.length} of ${total} lines`;
}

// While the server is asked for a puzzle, and if it can't be reached.
function renderLoading() {
  renderHead();
  $("code").replaceChildren();
  $("reveal-info").textContent = "Loading the puzzle…";
  $("load-error").hidden = true;
  $("board").replaceChildren(...boardRows([], []));
  $("result").hidden = true;
  $("guess-input").disabled = true;
  $("guess-btn").disabled = true;
  $("guess-count").textContent = "";
}

function renderLoadError(err, retry) {
  $("reveal-info").textContent = "";
  $("load-error-text").textContent = err.offline
    ? "Couldn't reach the server. Daily puzzles need a connection, because their answers are kept there. The arcade works offline."
    : `Couldn't load the puzzle: ${err.message}`;
  $("retry-btn").onclick = retry;
  $("code").hidden = true;
  $("load-error").hidden = false;
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
  $("guess-btn").disabled = done || waiting;
  $("guess-count").textContent = done ? "" : `Guess ${game.guesses.length + 1} of ${MAX_GUESSES}`;
  if (done) showError("");
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

// Where a finished arcade run puts the player on this week's board. The rank
// arrives later, so a newer render of the result line wins.
let rankRequest = 0;
async function showRank(kind, score, prefix) {
  const earlier = store[kind].runs.filter((r) => r !== run?.record).reduce((m, r) => Math.max(m, r.score), 0);
  const line = $("result-line");
  const request = ++rankRequest;
  line.hidden = false;
  line.replaceChildren(`${prefix} `, score > 0 && score > earlier ? "A new personal best. " : "");
  const link = await rankLink(kind, today);
  if (link && request === rankRequest) line.append(link);
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
// Records a finished puzzle. `quiet` is for one finished on another device:
// it is recorded here too, without the celebration.
function finish({ quiet = false } = {}) {
  const won = isWon();
  const n = game.guesses.length;
  // The archive shows the language of puzzles the player has finished.
  if (onServer()) store.dayAnswers = { ...store.dayAnswers, [game.day]: answer().name };
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
    } else if (!quiet) {
      confetti();
    }
    if (collect(answer().name) && !quiet) {
      const total = Object.keys(store.collection).length;
      setTimeout(() => toast(`New language collected: ${answer().name} (${total}/${LANGUAGES.length})`), 900);
    }
  }
  save();
  pushSoon();
  if (quiet) return;
  render(true);
  celebrateBadges(won ? 2600 : 1200);
  setTimeout(() => $("result").scrollIntoView({ behavior: "smooth", block: "nearest" }), 450);
  if (mode === "endless" && won) setTimeout(() => $("result-actions").firstChild?.focus({ preventScroll: true }), 50);
  if (mode === "daily") setTimeout(openStats, 1800);
}

async function submitGuess(text) {
  if (!game?.view || isFinished() || waiting) return;
  const form = $("guess-form");
  const lang = resolveLanguage(text);
  const problem = !lang ? (text.trim() ? "Not in the language list. Pick one of the suggestions as you type." : "Type a language first")
    : game.guesses.includes(lang.name) ? `You already guessed ${lang.name}`
    : game.hard ? hardModeViolation(lang, game.guesses.map((g, i) => ({ guess: languageOf(g), result: results()[i] })))
    : null;
  if (problem) {
    shake(form);
    showError(game.hard && lang && !game.guesses.includes(lang.name) ? `Hard mode: ${problem}` : problem);
    return;
  }
  showError("");
  const guesses = [...game.guesses, lang.name];
  if (onServer()) {
    const load = loads;
    let view;
    setWaiting(true);
    try {
      view = await playDaily({ day: game.day, guesses, hard: game.hard });
    } catch (err) {
      if (load === loads) {
        shake(form);
        showError(err.offline ? "Couldn't reach the server, so that guess wasn't counted. Check your connection and try again." : err.message);
      }
      return;
    } finally {
      setWaiting(false);
    }
    if (load !== loads) return;
    adopt(view);
  } else {
    game.guesses = guesses;
    game.view = localView(game.index, guesses);
  }
  picker.clear();
  render(true);
  if (isFinished()) finish();
  else $("guess-input").focus();
}

// The Guess button says so while the server checks a guess.
function setWaiting(on) {
  waiting = on;
  $("guess-btn").textContent = on ? "Checking…" : "Guess";
  $("guess-btn").disabled = on || Boolean(game?.view?.done);
}

// A rejected guess is explained under the field and the typing is kept, so
// it can be fixed; the message clears as soon as the player edits it.
function showError(message) {
  $("guess-error").textContent = message;
  if (message) $("guess-input").setAttribute("aria-invalid", "true");
  else $("guess-input").removeAttribute("aria-invalid");
}
$("guess-input").addEventListener("input", () => showError(""));

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
  const code = encodeChallenge({ ...(onServer() ? { day: game.day } : { index: game.index }), name: store.github,
                                 guesses: game.guesses.length, won: isWon(), hard: game.hard });
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
    if (game.view) render();
  }
});
setInterval(() => { if (!$("result").hidden && mode === "daily") updateCountdown(); }, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && mode === "daily" && dayNumber() !== today) startDaily();
});

// ---------- start ----------
// The arcade snippets. Daily puzzles don't need them, so they still work if
// this file can't be loaded.
try {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  if (!res.ok) throw new Error(res.status);
  snippets = parseSnippets(await res.text());
} catch (err) {
  console.warn("Couldn't load the arcade snippets:", err.message);
}

const code = params.get("c");
challenger = code ? decodeChallenge(code, snippets.length, today) : null;
if (code && !challenger) toast("That challenge link looks broken");

const puzzle = params.has("day") ? Number(params.get("day")) : null;
const pastPuzzle = Number.isInteger(puzzle) && puzzle >= 1 && puzzle <= today;
if (puzzle !== null && !pastPuzzle && puzzle !== today + 1) toast("That puzzle isn't available yet");
const arcadeReady = snippets.length > 0;

if (challenger?.day === today) startDaily();   // a challenge on today's puzzle is played as the daily puzzle
else if (challenger && challenger.day !== undefined) start("challenge", { day: challenger.day });
else if (challenger) start("challenge", { index: challenger.index });
else if (pastPuzzle) { archiveDay = puzzle - 1; start("archive", { day: archiveDay }); }
else if (arcadeReady && params.get("mode") === "practice") start("practice", { index: randomIndex() });
else if (arcadeReady && params.get("mode") === "endless") startEndless();
else startDaily();

if (!store.seenHelp) {
  store.seenHelp = true;
  save();
  $("help-dialog").showModal();
}
