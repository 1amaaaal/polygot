import { LANGUAGES, TRAITS } from "../data/languages.js";
import {
  MAX_GUESSES, compare, currentStreak, dailySnippetIndex, dayNumber, decodeChallenge,
  encodeChallenge, hardModeViolation, linesToShow, parseSnippets, recordResult,
  scoreLabel, shareText,
} from "./game.js";
import { escapeHtml, highlightLine } from "./highlight.js";
import { el, initLayout, onSettingsChange, renderSidebar, toast } from "./layout.js";
import { canvasToFile, drawResultCard } from "./share-image.js";
import { collect, save, store } from "./store.js";

initLayout("play");

const byName = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l]));
const ALIASES = {
  js: "JavaScript", ts: "TypeScript", py: "Python", python3: "Python", golang: "Go",
  csharp: "C#", "c sharp": "C#", cs: "C#", cpp: "C++", "c plus plus": "C++", rb: "Ruby",
  sh: "Bash", shell: "Bash", pwsh: "PowerShell", ps: "PowerShell", asm: "x86 Assembly",
  assembly: "x86 Assembly", x86: "x86 Assembly", vb: "VB.NET", vbnet: "VB.NET",
  "visual basic": "VB.NET", hs: "Haskell", clj: "Clojure", kt: "Kotlin", rs: "Rust",
  ex: "Elixir", jl: "Julia", pl: "Perl",
};

const $ = (id) => document.getElementById(id);
const els = {
  code: $("code"), revealInfo: $("reveal-info"), board: $("board"), form: $("guess-form"),
  input: $("guess-input"), suggestions: $("suggestions"), guessBtn: $("guess-btn"),
  guessCount: $("guess-count"), result: $("result"), resultTitle: $("result-title"),
  resultText: $("result-text"), versus: $("versus"), share: $("share-btn"),
  shareImage: $("share-image-btn"), challengeBtn: $("challenge-btn"), practiceBtn: $("practice-btn"),
  next: $("next-puzzle"), dailyLabel: $("daily-label"), banner: $("challenge-banner"),
  modeDaily: $("mode-daily"), modePractice: $("mode-practice"), modeChallenge: $("mode-challenge"),
  hardBadge: $("hard-badge"), learn: $("learn"),
};

// ---------- state ----------
let snippets = [];
let today = dayNumber();
let mode = "daily";       // "daily" | "practice" | "challenge"
let game = null;          // { index, guesses: [names], hard }
let challenger = null;    // decoded challenge, shown in the banner and result
let shownLines = 0;       // for animating newly revealed lines

const languageOf = (name) => byName.get(name.toLowerCase());
const answer = () => languageOf(snippets[game.index].language);
const results = () => game.guesses.map((g) => compare(languageOf(g), answer()));
const isWon = () => results().some((r) => r.correct);
const isFinished = () => isWon() || game.guesses.length >= MAX_GUESSES;
const dailyIndex = () => dailySnippetIndex(today, snippets);

function startDaily() {
  mode = "daily";
  today = dayNumber();
  if (!store.daily || store.daily.day !== today) {
    store.daily = { day: today, guesses: [], hard: Boolean(store.settings.hard), done: false };
    save();
  }
  game = { index: dailyIndex(), guesses: store.daily.guesses, hard: store.daily.hard };
  if (challenger && challenger.index !== game.index) challenger = null;
  begin();
}

function startPractice(index) {
  mode = index === undefined ? "practice" : "challenge";
  const previous = game?.index;
  if (index === undefined) {
    challenger = null;
    do index = Math.floor(Math.random() * snippets.length);
    while (snippets.length > 1 && (index === previous || index === dailyIndex()));
  }
  game = { index, guesses: [], hard: Boolean(store.settings.hard) };
  begin();
  els.input.focus();
}

function begin() {
  shownLines = 0;
  els.modeChallenge.hidden = mode !== "challenge";
  render();
}

// ---------- rendering ----------
function renderCode() {
  const lines = snippets[game.index].lines;
  const misses = results().filter((r) => !r.correct).length;
  const visible = linesToShow(lines.length, misses, isFinished());
  const plain = game.hard && !isFinished();
  els.code.replaceChildren(...lines.map((text, i) => {
    const line = el("span", { class: "line", "data-n": i + 1 });
    if (i < visible) {
      line.innerHTML = (plain ? escapeHtml(text) : highlightLine(text)) || " ";
      if (i >= shownLines && shownLines > 0) line.classList.add("new");
    } else {
      line.classList.add("hidden");
      line.setAttribute("aria-hidden", "true");
      if (text.trim()) {
        const bar = el("span", { class: "bar" });
        bar.style.marginLeft = `${text.length - text.trimStart().length}ch`;
        bar.style.width = `${Math.min(text.trim().length, 60)}ch`;
        line.append(bar);
      }
    }
    return line;
  }));
  shownLines = visible;
  els.revealInfo.textContent = isFinished()
    ? `${answer().name} · ${lines.length} lines`
    : `Showing ${visible} of ${lines.length} lines`;
}

const VERDICT = { hit: "correct", close: "close", miss: "wrong" };

function cell(text, cls, label) {
  return el("span", { class: `cell ${cls}`, text, ...(label ? { "aria-label": label } : {}) });
}

function renderBoard(animateLast) {
  const rows = results().map((r, i) => {
    const guess = languageOf(game.guesses[i]);
    const row = el("div", { class: "row-cells" + (r.correct ? " win" : "") +
                                   (animateLast && i === game.guesses.length - 1 ? " flip" : "") });
    const arrow = { up: " ↑", down: " ↓", "": "" }[r.yearArrow];
    row.append(cell(guess.name, "name"));
    for (const { key, label } of TRAITS) {
      const value = key === "year" ? `${guess.year}${arrow}` : guess[key];
      const hint = key === "year" && r.yearArrow ? `, answer is ${r.yearArrow === "up" ? "newer" : "older"}` : "";
      row.append(cell(value, `v-${r[key]}`, `${label}: ${guess[key]}, ${VERDICT[r[key]]}${hint}`));
    }
    return el("li", {}, row);
  });
  if (!isFinished()) {
    for (let i = game.guesses.length; i < MAX_GUESSES; i++) {
      rows.push(el("li", {}, el("div", { class: "row-cells", "aria-hidden": "true" },
        cell("", "name empty"), ...TRAITS.map(() => cell("", "empty")))));
    }
  }
  els.board.replaceChildren(...rows);
}

const PHRASES = {
  paradigm: { "Object-oriented": "object-oriented", Functional: "functional", Procedural: "procedural",
              "Multi-paradigm": "multi-paradigm", Logic: "a logic language", Declarative: "declarative" },
  typing: { Static: "statically typed", Dynamic: "dynamically typed", Untyped: "untyped" },
  execution: { Native: "compiles to native code", VM: "runs on a virtual machine",
               Interpreted: "is usually interpreted", JIT: "is JIT-compiled",
               Transpiled: "is transpiled to another language" },
  family: { "C-like": "C-like syntax", Indentation: "indentation-based syntax",
            "Ruby-like": "Ruby-style syntax", "Algol/Pascal": "Pascal-style syntax",
            "ML-like": "ML-style syntax", Lisp: "Lisp-style parentheses", Shell: "shell syntax",
            Declarative: "declarative syntax", Scientific: "scientific-computing syntax",
            BASIC: "BASIC-style syntax", Other: "a syntax all of its own" },
};

function describe(a) {
  return `${a.name} (${a.year}) is ${PHRASES.paradigm[a.paradigm]} and ${PHRASES.typing[a.typing]}. ` +
    `It ${PHRASES.execution[a.execution]} and has ${PHRASES.family[a.family]}.`;
}

function versusText() {
  if (!challenger) return "";
  const who = challenger.name ? `@${challenger.name}` : "your friend";
  const mine = isWon() ? game.guesses.length : Infinity;
  const theirs = challenger.won ? challenger.guesses : Infinity;
  if (mine === Infinity && theirs === Infinity) return `Neither you nor ${who} got this one.`;
  if (mine < theirs) return `🏆 You beat ${who}: ${scoreLabel(results(), isWon())} vs ${challenger.won ? challenger.guesses : "X"}/6.`;
  if (mine === theirs) return `🤝 A tie with ${who}, both on ${mine}/6.`;
  return `${who} wins this one: ${challenger.guesses}/6 vs your ${scoreLabel(results(), isWon())}.`;
}

function renderResult() {
  const done = isFinished();
  els.result.hidden = !done;
  els.learn.hidden = !done;
  els.input.disabled = done;
  els.guessBtn.disabled = done;
  els.guessCount.textContent = done ? "" : `Guess ${game.guesses.length + 1} of ${MAX_GUESSES}`;
  if (!done) return;
  const a = answer();
  const n = game.guesses.length;
  els.resultTitle.textContent = isWon()
    ? `${["Genius!", "Brilliant!", "Impressive!", "Nice!", "Good job!", "Phew!"][n - 1]} It's ${a.name}.`
    : `It was ${a.name}.`;
  els.resultText.textContent = describe(a);
  els.versus.hidden = !challenger;
  els.versus.textContent = versusText();
  els.practiceBtn.textContent = mode === "practice" ? "Another snippet" : "Practice round";
  $("learn-title").textContent = `About ${a.name}`;
  $("learn-creator").textContent = `Created by ${a.creator} in ${a.year}.`;
  $("learn-fact").textContent = a.fact;
  $("learn-link").href = a.wiki;
  updateCountdown();
}

function renderBanner() {
  els.banner.hidden = !challenger;
  if (!challenger) return;
  const who = challenger.name ? `@${challenger.name}` : "A friend";
  els.banner.textContent = challenger.won
    ? `⚔️ ${who} solved this one in ${challenger.guesses}/6${challenger.hard ? " on hard mode" : ""}. Can you beat that?`
    : `⚔️ ${who} couldn't solve this one. Can you?`;
}

function render(animateLast = false) {
  els.dailyLabel.textContent = `#${today + 1}`;
  for (const [btn, m] of [[els.modeDaily, "daily"], [els.modePractice, "practice"], [els.modeChallenge, "challenge"]]) {
    btn.classList.toggle("active", mode === m);
    btn.setAttribute("aria-pressed", mode === m);
  }
  els.hardBadge.hidden = !game.hard;
  renderBanner();
  renderCode();
  renderBoard(animateLast);
  renderResult();
}

function updateCountdown() {
  if (mode !== "daily") {
    els.next.textContent = mode === "practice"
      ? "Practice rounds don't count towards your daily stats."
      : "Challenges don't count towards your daily stats.";
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  const pad = (v) => String(v).padStart(2, "0");
  els.next.textContent = `Next snippet in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// ---------- guessing ----------
function shake() {
  els.form.classList.remove("shake");
  void els.form.offsetWidth;
  els.form.classList.add("shake");
}

function resolve(text) {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  return languageOf(key) ?? (ALIASES[key] ? languageOf(ALIASES[key]) : null);
}

function finish() {
  const won = isWon();
  if (mode === "daily") {
    store.daily.done = true;
    store.stats = recordResult(store.stats, { day: today, won, guesses: game.guesses.length });
    store.history[today] ??= won ? game.guesses.length : 0;
    save();
    renderSidebar();
  }
  if (won) {
    const isNew = collect(answer().name);
    const total = Object.keys(store.collection).length;
    if (isNew) setTimeout(() => toast(`New language collected: ${answer().name} (${total}/${LANGUAGES.length})`), 900);
  }
  setTimeout(() => els.result.scrollIntoView({ behavior: "smooth", block: "nearest" }), 450);
  if (mode === "daily") setTimeout(openStats, 1600);
}

function submitGuess(text) {
  if (isFinished()) return;
  const lang = resolve(text);
  if (!lang) {
    shake();
    toast(text.trim() ? "Not in the language list" : "Type a language first");
    return;
  }
  if (game.guesses.includes(lang.name)) {
    shake();
    toast(`You already guessed ${lang.name}`);
    return;
  }
  if (game.hard) {
    const history = game.guesses.map((g, i) => ({ guess: languageOf(g), result: results()[i] }));
    const problem = hardModeViolation(lang, history);
    if (problem) {
      shake();
      toast(`Hard mode: ${problem}`);
      return;
    }
  }
  game.guesses.push(lang.name);
  els.input.value = "";
  closeSuggestions();
  if (mode === "daily") {
    store.daily.guesses = game.guesses;
    save();
  }
  render(true);
  if (isFinished()) finish();
  else els.input.focus();
}

// ---------- suggestions (a small accessible combobox) ----------
let active = -1;
let matches = [];

function updateSuggestions() {
  const q = els.input.value.trim().toLowerCase();
  if (!q) return closeSuggestions();
  const guessed = new Set(game.guesses);
  const pool = LANGUAGES.filter((l) => !guessed.has(l.name));
  const starts = pool.filter((l) => l.name.toLowerCase().startsWith(q));
  const contains = pool.filter((l) => !starts.includes(l) && l.name.toLowerCase().includes(q));
  const alias = ALIASES[q] && pool.find((l) => l.name === ALIASES[q]);
  matches = [...new Set([alias, ...starts, ...contains].filter(Boolean))].slice(0, 8);
  if (!matches.length) return closeSuggestions();
  active = 0;
  els.suggestions.replaceChildren(...matches.map((l, i) => {
    const li = el("li", { id: `opt-${i}`, role: "option" }, l.name, el("small", { text: l.year }));
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      submitGuess(l.name);
    });
    return li;
  }));
  els.suggestions.hidden = false;
  els.input.setAttribute("aria-expanded", "true");
  highlightActive();
}

function highlightActive() {
  [...els.suggestions.children].forEach((li, i) => li.setAttribute("aria-selected", i === active));
  els.input.setAttribute("aria-activedescendant", active >= 0 ? `opt-${active}` : "");
  els.suggestions.children[active]?.scrollIntoView({ block: "nearest" });
}

function closeSuggestions() {
  els.suggestions.hidden = true;
  els.input.setAttribute("aria-expanded", "false");
  els.input.removeAttribute("aria-activedescendant");
  matches = [];
  active = -1;
}

els.input.addEventListener("input", updateSuggestions);
els.input.addEventListener("blur", closeSuggestions);
els.input.addEventListener("keydown", (e) => {
  if (els.suggestions.hidden) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    active = (active + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
    highlightActive();
  } else if (e.key === "Escape") {
    closeSuggestions();
  }
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const typed = els.input.value;
  // Prefer an exact name; otherwise take the highlighted suggestion.
  submitGuess(!resolve(typed) && active >= 0 && matches[active] ? matches[active].name : typed);
});

// ---------- sharing ----------
const siteUrl = () => new URL(".", location.href).href;
const label = () => (mode === "daily" ? `#${today + 1}` : mode === "practice" ? "(practice)" : "(challenge)");

async function copyText(text, done = "Copied to clipboard") {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    const area = el("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    toast(ok ? done : "Couldn't copy, sorry");
  }
}

async function shareResult() {
  const text = shareText({ label: label(), results: results(), won: isWon(), hard: game.hard,
                           colorblind: Boolean(store.settings.colorblind), url: siteUrl() });
  if (matchMedia("(pointer: coarse)").matches && navigator.share) {
    try { await navigator.share({ text }); return; } catch (err) { if (err?.name === "AbortError") return; }
  }
  copyText(text);
}

async function shareImage() {
  const canvas = drawResultCard({
    title: mode === "daily" ? `Daily puzzle #${today + 1}` : mode === "practice" ? "Practice round" : "Challenge",
    score: scoreLabel(results(), isWon(), game.hard), results: results(), name: store.github,
    colorblind: Boolean(store.settings.colorblind), url: siteUrl(),
  });
  const file = await canvasToFile(canvas, `polyglot-${mode === "daily" ? today + 1 : mode}.png`);
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], text: "Can you beat my Polyglot score?" }); return; }
    catch (err) { if (err?.name === "AbortError") return; }
  }
  const link = el("a", { href: URL.createObjectURL(file), download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  toast("Image downloaded");
}

async function challengeFriend() {
  const code = encodeChallenge({ index: game.index, name: store.github, guesses: game.guesses.length,
                                 won: isWon(), hard: game.hard });
  const url = new URL("play.html", siteUrl());
  url.searchParams.set("c", code);
  const text = `Can you beat my ${scoreLabel(results(), isWon(), game.hard)} on this Polyglot snippet?`;
  if (matchMedia("(pointer: coarse)").matches && navigator.share) {
    try { await navigator.share({ text, url: url.href }); return; } catch (err) { if (err?.name === "AbortError") return; }
  }
  copyText(`${text}\n${url.href}`, "Challenge link copied");
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
  const most = Math.max(1, ...s.distribution);
  const wonToday = mode === "daily" && store.daily?.day === today && isWon() ? game.guesses.length : 0;
  $("dist").replaceChildren(...s.distribution.map((count, i) => {
    const bar = el("span", { class: "dist-bar" + (wonToday === i + 1 ? " today" : ""), text: count });
    bar.style.width = `${Math.max(8, (100 * count) / most)}%`;
    return el("div", { class: "dist-row" }, el("span", { text: i + 1 }), bar);
  }));
  $("stats-dialog").showModal();
}

// ---------- wiring ----------
els.share.addEventListener("click", shareResult);
els.shareImage.addEventListener("click", shareImage);
els.challengeBtn.addEventListener("click", challengeFriend);
els.practiceBtn.addEventListener("click", () => startPractice());
els.modeDaily.addEventListener("click", () => mode !== "daily" && startDaily());
els.modePractice.addEventListener("click", () => mode !== "practice" && startPractice());
$("stats-btn").addEventListener("click", openStats);
onSettingsChange((settings) => {
  if (game && game.guesses.length === 0) {
    game.hard = Boolean(settings.hard);
    if (mode === "daily") { store.daily.hard = game.hard; save(); }
    render();
  }
});

setInterval(() => { if (!els.result.hidden) updateCountdown(); }, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && mode === "daily" && dayNumber() !== today) startDaily();
});

// ---------- start ----------
try {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  if (!res.ok) throw new Error(res.status);
  snippets = parseSnippets(await res.text());

  const code = new URLSearchParams(location.search).get("c");
  challenger = code ? decodeChallenge(code, snippets.length) : null;
  if (code && !challenger) toast("That challenge link looks broken");

  if (challenger && challenger.index !== dailyIndex()) startPractice(challenger.index);
  else if (!challenger && new URLSearchParams(location.search).get("mode") === "practice") startPractice();
  else startDaily();   // a challenge on today's snippet is played as the daily puzzle

  if (!store.seenHelp) {
    store.seenHelp = true;
    save();
    $("help-dialog").showModal();
  }
} catch (err) {
  els.revealInfo.textContent = "Couldn't load the snippet. Try refreshing.";
  console.error(err);
}
