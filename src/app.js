import { LANGUAGES, TRAITS } from "../data/languages.js";
import {
  MAX_GUESSES, compare, currentStreak, dailySnippetIndex, dayNumber, linesToShow,
  newStats, parseSnippets, recordResult, shareText,
} from "./game.js";
import { highlightLine } from "./highlight.js";

const STORE_KEY = "polyglot-v1";
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
  resultText: $("result-text"), share: $("share-btn"), practiceBtn: $("practice-btn"),
  next: $("next-puzzle"), dailyLabel: $("daily-label"), toast: $("toast"),
  modeDaily: $("mode-daily"), modePractice: $("mode-practice"),
  colorblind: $("colorblind-toggle"),
};

// ---------- storage (best effort: private windows may block it) ----------
function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {};
  } catch {
    return {};
  }
}
const store = { settings: {}, stats: newStats(), daily: null, seenHelp: false, ...loadStore() };
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* storage unavailable: the game still works for this visit */ }
}

// ---------- state ----------
let snippets = [];
let today = dayNumber();
let mode = "daily";
let game = null;          // { index, guesses: [names] }
let shownLines = 0;       // for animating newly revealed lines

const languageOf = (name) => byName.get(name.toLowerCase());
const answer = () => languageOf(snippets[game.index].language);
const results = () => game.guesses.map((g) => compare(languageOf(g), answer()));
const isWon = () => results().some((r) => r.correct);
const isFinished = () => isWon() || game.guesses.length >= MAX_GUESSES;

function startDaily() {
  mode = "daily";
  today = dayNumber();
  if (!store.daily || store.daily.day !== today) {
    store.daily = { day: today, guesses: [] };
    save();
  }
  game = { index: dailySnippetIndex(today, snippets), guesses: store.daily.guesses };
  shownLines = 0;
  render();
}

function startPractice() {
  mode = "practice";
  const previous = game?.index;
  let index;
  do index = Math.floor(Math.random() * snippets.length);
  while (snippets.length > 1 && index === previous);
  game = { index, guesses: [] };
  shownLines = 0;
  render();
  els.input.focus();
}

// ---------- rendering ----------
function renderCode() {
  const lines = snippets[game.index].lines;
  const misses = results().filter((r) => !r.correct).length;
  const visible = linesToShow(lines.length, misses, isFinished());
  els.code.replaceChildren(...lines.map((text, i) => {
    const line = document.createElement("span");
    line.className = "line";
    line.dataset.n = i + 1;
    if (i < visible) {
      line.innerHTML = highlightLine(text) || " ";
      if (i >= shownLines && shownLines > 0) line.classList.add("new");
    } else {
      line.classList.add("hidden");
      line.setAttribute("aria-hidden", "true");
      if (text.trim()) {
        const bar = document.createElement("span");
        bar.className = "bar";
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

function cell(text, cls, label) {
  const span = document.createElement("span");
  span.className = `cell ${cls}`;
  span.textContent = text;
  if (label) span.setAttribute("aria-label", label);
  return span;
}

const VERDICT = { hit: "correct", close: "close", miss: "wrong" };

function renderBoard(animateLast) {
  const rows = results().map((r, i) => {
    const guess = languageOf(game.guesses[i]);
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "row-cells";
    if (r.correct) row.classList.add("win");
    if (animateLast && i === game.guesses.length - 1) row.classList.add("flip");
    const arrow = { up: " ↑", down: " ↓", "": "" }[r.yearArrow];
    row.append(cell(guess.name, "name"));
    for (const { key, label } of TRAITS) {
      const value = key === "year" ? `${guess.year}${arrow}` : guess[key];
      const hint = key === "year" && r.yearArrow ? `, answer is ${r.yearArrow === "up" ? "newer" : "older"}` : "";
      row.append(cell(value, `v-${r[key]}`, `${label}: ${guess[key]}, ${VERDICT[r[key]]}${hint}`));
    }
    li.append(row);
    return li;
  });
  if (!isFinished()) {
    for (let i = game.guesses.length; i < MAX_GUESSES; i++) {
      const li = document.createElement("li");
      const row = document.createElement("div");
      row.className = "row-cells";
      row.setAttribute("aria-hidden", "true");
      row.append(cell("", "name empty"), ...TRAITS.map(() => cell("", "empty")));
      li.append(row);
      rows.push(li);
    }
  }
  els.board.replaceChildren(...rows);
}

function renderResult() {
  const done = isFinished();
  els.result.hidden = !done;
  els.input.disabled = done;
  els.guessBtn.disabled = done;
  els.guessCount.textContent = done ? "" : `Guess ${game.guesses.length + 1} of ${MAX_GUESSES}`;
  if (!done) return;
  const a = answer();
  const n = game.guesses.length;
  if (isWon()) {
    const praise = ["Genius!", "Brilliant!", "Impressive!", "Nice!", "Good job!", "Phew!"][n - 1];
    els.resultTitle.textContent = `${praise} It's ${a.name}.`;
  } else {
    els.resultTitle.textContent = `It was ${a.name}.`;
  }
  els.resultText.textContent = describe(a);
  els.practiceBtn.textContent = mode === "daily" ? "Practice round" : "Another snippet";
  updateCountdown();
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

function render(animateLast = false) {
  els.dailyLabel.textContent = `#${today + 1}`;
  els.modeDaily.classList.toggle("active", mode === "daily");
  els.modePractice.classList.toggle("active", mode === "practice");
  els.modeDaily.setAttribute("aria-pressed", mode === "daily");
  els.modePractice.setAttribute("aria-pressed", mode === "practice");
  renderCode();
  renderBoard(animateLast);
  renderResult();
}

function updateCountdown() {
  if (mode !== "daily") {
    els.next.textContent = "Practice rounds don't count towards your stats.";
    return;
  }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  const pad = (v) => String(v).padStart(2, "0");
  els.next.textContent = `Next snippet in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// ---------- guessing ----------
let toastTimer;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

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
  game.guesses.push(lang.name);
  els.input.value = "";
  closeSuggestions();
  if (mode === "daily") {
    store.daily.guesses = game.guesses;
    if (isFinished()) {
      store.stats = recordResult(store.stats, { day: today, won: isWon(), guesses: game.guesses.length });
    }
    save();
  }
  render(true);
  if (isFinished()) {
    setTimeout(() => els.result.scrollIntoView({ behavior: "smooth", block: "nearest" }), 450);
    if (mode === "daily") setTimeout(openStats, 1400);
  } else {
    els.input.focus();
  }
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
    const li = document.createElement("li");
    li.id = `opt-${i}`;
    li.setAttribute("role", "option");
    li.append(l.name);
    const year = document.createElement("small");
    year.textContent = l.year;
    li.append(year);
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
    const step = e.key === "ArrowDown" ? 1 : -1;
    active = (active + step + matches.length) % matches.length;
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

// ---------- share ----------
async function share() {
  const text = shareText({
    label: mode === "daily" ? `#${today + 1}` : "(practice)",
    results: results(),
    won: isWon(),
    colorblind: Boolean(store.settings.colorblind),
    url: location.origin + location.pathname,
  });
  const mobile = matchMedia("(pointer: coarse)").matches;
  try {
    if (mobile && navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard");
  } catch (err) {
    if (err?.name === "AbortError") return;
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    toast(ok ? "Copied to clipboard" : "Couldn't copy, sorry");
  }
}

// ---------- dialogs ----------
function openStats() {
  const s = store.stats;
  const stat = (value, label) => {
    const div = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    div.append(b, span);
    return div;
  };
  $("stat-grid").replaceChildren(
    stat(s.played, "Played"),
    stat(s.played ? Math.round((100 * s.wins) / s.played) : 0, "Win %"),
    stat(currentStreak(s, today), "Streak"),
    stat(s.maxStreak, "Best streak"),
  );
  const most = Math.max(1, ...s.distribution);
  const wonToday = store.daily?.day === today && mode === "daily" && isWon() ? game.guesses.length : 0;
  $("dist").replaceChildren(...s.distribution.map((count, i) => {
    const row = document.createElement("div");
    row.className = "dist-row";
    const n = document.createElement("span");
    n.textContent = i + 1;
    const bar = document.createElement("span");
    bar.className = "dist-bar" + (wonToday === i + 1 ? " today" : "");
    bar.style.width = `${Math.max(8, (100 * count) / most)}%`;
    bar.textContent = count;
    row.append(n, bar);
    return row;
  }));
  $("stats-dialog").showModal();
}

function applySettings() {
  document.body.classList.toggle("colorblind", Boolean(store.settings.colorblind));
  els.colorblind.checked = Boolean(store.settings.colorblind);
}

$("help-btn").addEventListener("click", () => $("help-dialog").showModal());
$("stats-btn").addEventListener("click", openStats);
$("settings-btn").addEventListener("click", () => $("settings-dialog").showModal());
els.colorblind.addEventListener("change", () => {
  store.settings.colorblind = els.colorblind.checked;
  save();
  applySettings();
});
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
}
els.share.addEventListener("click", share);
els.practiceBtn.addEventListener("click", startPractice);
els.modeDaily.addEventListener("click", () => mode !== "daily" && startDaily());
els.modePractice.addEventListener("click", () => mode !== "practice" && startPractice());

setInterval(() => { if (!els.result.hidden) updateCountdown(); }, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && mode === "daily" && dayNumber() !== today) startDaily();
});

// ---------- start ----------
applySettings();
try {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  if (!res.ok) throw new Error(res.status);
  snippets = parseSnippets(await res.text());
  startDaily();
  if (!store.seenHelp) {
    store.seenHelp = true;
    save();
    $("help-dialog").showModal();
  }
} catch (err) {
  els.revealInfo.textContent = "Couldn't load today's snippet. Try refreshing.";
  console.error(err);
}
