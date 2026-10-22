// Speed run: name as many languages as possible in 60 seconds. Snippets show
// in full, a wrong guess costs three seconds and skipping is free.

import { dailySnippetIndex, dayNumber, parseSnippets } from "./game.js";
import { rankLink } from "./boards.js";
import { celebrateBadges, el, initLayout } from "./layout.js";
import { collect, recordRun, store } from "./store.js";
import { pushSoon } from "./sync.js";
import { LanguagePicker, renderCode, resolveLanguage, shake, shareOrCopy, siteUrl } from "./ui.js";

initLayout("arcade");

const DURATION = 60_000;
const PENALTY = 3_000;
const $ = (id) => document.getElementById(id);
const today = dayNumber();
const bestEver = () => store.speed.runs.reduce((m, r) => Math.max(m, r.score), 0);

let snippets = [];
let queue = [];      // snippet indexes for this run, in random order
let current = null;  // { index, wrong: [names] }
let log = [];        // [{ language, solved }]
let score = 0;
let deadline = 0;
let playing = false;

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function showIntro() {
  const best = bestEver();
  $("intro-best").textContent = best ? `Your best: ${best}.` : "";
}

function begin() {
  // Today's daily snippet is left out so a speed run can't spoil it.
  const daily = dailySnippetIndex(today, snippets);
  queue = shuffle(snippets.map((_, i) => i).filter((i) => i !== daily));
  log = [];
  score = 0;
  deadline = performance.now() + DURATION;
  playing = true;
  $("intro").hidden = true;
  $("done").hidden = true;
  $("game").hidden = false;
  $("score-pill").hidden = false;
  next();
  $("guess-input").focus();
  requestAnimationFrame(tick);
}

function next() {
  // A long run can use every snippet; then they come round again.
  if (!queue.length) queue = shuffle(snippets.map((_, i) => i));
  current = { index: queue.pop(), wrong: [] };
  const lines = snippets[current.index].lines;
  renderCode($("code"), lines, { animateFrom: 0 });
  $("snippet-info").textContent = `Snippet ${log.length + 1} · ${lines.length} lines`;
  $("score-pill").textContent = `${score} solved`;
  picker.clear();
}

function tick() {
  if (!playing) return;
  const left = Math.max(0, deadline - performance.now());
  $("timer-bar").style.transform = `scaleX(${left / DURATION})`;
  $("timer-bar").classList.toggle("low", left < 10_000);
  $("timer-text").textContent = Math.ceil(left / 1000);
  if (left <= 0) finish();
  else requestAnimationFrame(tick);
}

function showError(message) {
  $("guess-error").textContent = message;
  if (message) $("guess-input").setAttribute("aria-invalid", "true");
  else $("guess-input").removeAttribute("aria-invalid");
}

function guess(text) {
  if (!playing) return;
  const lang = resolveLanguage(text);
  if (!lang) {
    shake($("guess-form"));
    showError(text.trim() ? "Not in the language list. Pick one of the suggestions as you type." : "Type a language first");
    return;
  }
  if (lang.name === snippets[current.index].language) {
    showError("");
    score += 1;
    log.push({ language: lang.name, solved: true });
    collect(lang.name);
    next();
  } else {
    current.wrong.push(lang.name);
    deadline -= PENALTY;
    picker.clear();
    shake($("guess-form"));
    showError(`Not ${lang.name}. That cost 3 seconds.`);
    $("timer-text").parentElement.classList.remove("penalty");
    void $("timer-text").offsetWidth;
    $("timer-text").parentElement.classList.add("penalty");
  }
}

function skip() {
  if (!playing) return;
  showError("");
  log.push({ language: snippets[current.index].language, solved: false });
  next();
  $("guess-input").focus();
}

async function finish() {
  playing = false;
  showError("");
  // The snippet on screen when time ran out counts as missed.
  log.push({ language: snippets[current.index].language, solved: false });
  const previousBest = bestEver();
  recordRun("speed", { day: today, score });
  pushSoon();

  $("game").hidden = true;
  $("done").hidden = false;
  $("done-title").textContent = `${score} ${score === 1 ? "language" : "languages"} in 60 seconds.`;
  $("done-line").replaceChildren(score > previousBest ? "A new personal best. " : previousBest ? `Your best is ${previousBest}. ` : "");
  $("run-log").replaceChildren(...log.map((entry) =>
    el("li", { class: entry.solved ? "solved" : "missed" },
      el("span", { text: entry.language }),
      el("span", { class: "state", text: entry.solved ? "Solved" : "Missed" }))));
  $("again-btn").focus();
  celebrateBadges(800);
  const link = await rankLink("speed", today);
  if (link) $("done-line").append(link);
}

$("guess-input").addEventListener("input", () => showError(""));

const picker = new LanguagePicker($("guess-form"), $("guess-input"), $("suggestions"), {
  exclude: () => new Set(current?.wrong ?? []),
  onPick: guess,
});

$("start-btn").addEventListener("click", begin);
$("again-btn").addEventListener("click", begin);
$("skip-btn").addEventListener("click", skip);
$("share-btn").addEventListener("click", () =>
  shareOrCopy({ text: `Polyglot speed run: ${score} languages in 60 seconds\n${siteUrl()}speed.html` }));

try {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  if (!res.ok) throw new Error(res.status);
  snippets = parseSnippets(await res.text());
  showIntro();
} catch (err) {
  $("intro-best").textContent = "Couldn't load the snippets. Try refreshing.";
  $("start-btn").disabled = true;
  console.error(err);
}
