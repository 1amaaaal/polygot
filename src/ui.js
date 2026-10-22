// Building blocks shared by the game pages: the code panel, the clue board,
// the language picker, sharing helpers and the win confetti.

import { LANGUAGES, TRAITS } from "../data/languages.js";
import { LAUNCH, MAX_GUESSES } from "./game.js";
import { escapeHtml, highlightLine } from "./highlight.js";
import { el, toast } from "./layout.js";

const byName = new Map(LANGUAGES.map((l) => [l.name.toLowerCase(), l]));
export const languageOf = (name) => byName.get(name.toLowerCase());

const ALIASES = {
  js: "JavaScript", ts: "TypeScript", py: "Python", python3: "Python", golang: "Go",
  csharp: "C#", "c sharp": "C#", cs: "C#", cpp: "C++", "c plus plus": "C++", rb: "Ruby",
  sh: "Bash", shell: "Bash", pwsh: "PowerShell", ps: "PowerShell", asm: "x86 Assembly",
  assembly: "x86 Assembly", x86: "x86 Assembly", vb: "VB.NET", vbnet: "VB.NET",
  "visual basic": "VB.NET", hs: "Haskell", clj: "Clojure", kt: "Kotlin", rs: "Rust",
  ex: "Elixir", jl: "Julia", pl: "Perl",
};

// A typed name, alias or nickname to a language, or null.
export function resolveLanguage(text) {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  return languageOf(key) ?? (ALIASES[key] ? languageOf(ALIASES[key]) : null);
}

// ---------- code panel ----------
// `lines` are the lines the player may read; `hidden` is the [indent, length]
// of each line after them (see lineShape in game.js), drawn as a grey bar so
// the page never holds text the player hasn't earned. Lines from
// `animateFrom` onwards type themselves in, one after another.
export function renderCode(pre, { lines, hidden = [] }, { plain = false, animateFrom = Infinity } = {}) {
  const shown = lines.map((text, i) => {
    const line = el("span", { class: "line", "data-n": i + 1 });
    line.innerHTML = (plain ? escapeHtml(text) : highlightLine(text)) || " ";
    if (i >= animateFrom) {
      line.classList.add("new");
      line.style.setProperty("--i", i - animateFrom);
    }
    return line;
  });
  const bars = hidden.map(([indent, length], i) => {
    const line = el("span", { class: "line hidden", "data-n": lines.length + i + 1, "aria-hidden": "true" });
    if (length) {
      const bar = el("span", { class: "bar" });
      bar.style.marginLeft = `${indent}ch`;
      bar.style.width = `${Math.min(length, 60)}ch`;
      line.append(bar);
    }
    return line;
  });
  pre.replaceChildren(...shown, ...bars);
}

// ---------- clue board ----------
const VERDICT = { hit: "correct", close: "close", miss: "wrong" };
const cell = (text, cls, label) => el("span", { class: `cell ${cls}`, text, ...(label ? { "aria-label": label } : {}) });

export function boardRows(guesses, results, { animateLast = false, placeholders = true } = {}) {
  const rows = results.map((r, i) => {
    const guess = languageOf(guesses[i]);
    const row = el("div", { class: "row-cells" + (r.correct ? " win" : "") +
                                   (animateLast && i === guesses.length - 1 ? " flip" : "") });
    const arrow = { up: " ↑", down: " ↓", "": "" }[r.yearArrow];
    row.append(cell(guess.name, "name"));
    for (const { key, label } of TRAITS) {
      const value = key === "year" ? `${guess.year}${arrow}` : guess[key];
      const hint = key === "year" && r.yearArrow ? `, answer is ${r.yearArrow === "up" ? "newer" : "older"}` : "";
      row.append(cell(value, `v-${r[key]}`, `${label}: ${guess[key]}, ${VERDICT[r[key]]}${hint}`));
    }
    return el("li", {}, row);
  });
  if (placeholders) {
    for (let i = guesses.length; i < MAX_GUESSES; i++) {
      rows.push(el("li", {}, el("div", { class: "row-cells", "aria-hidden": "true" },
        cell("", "name empty"), ...TRAITS.map(() => cell("", "empty")))));
    }
  }
  return rows;
}

// ---------- language picker ----------
// A small accessible combobox over the language list. `exclude()` returns the
// names not to suggest (already guessed); `onPick(name)` receives a choice.
export class LanguagePicker {
  constructor(form, input, list, { exclude = () => new Set(), onPick }) {
    Object.assign(this, { input, list, exclude, onPick, matches: [], active: -1 });
    input.addEventListener("input", () => this.update());
    input.addEventListener("blur", () => this.close());
    input.addEventListener("keydown", (e) => this.keydown(e));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const typed = input.value;
      // Prefer an exact name; otherwise take the highlighted suggestion.
      this.onPick(!resolveLanguage(typed) && this.matches[this.active] ? this.matches[this.active].name : typed);
    });
  }

  update() {
    const q = this.input.value.trim().toLowerCase();
    if (!q) return this.close();
    const skip = this.exclude();
    const pool = LANGUAGES.filter((l) => !skip.has(l.name));
    const starts = pool.filter((l) => l.name.toLowerCase().startsWith(q));
    const contains = pool.filter((l) => !starts.includes(l) && l.name.toLowerCase().includes(q));
    const alias = ALIASES[q] && pool.find((l) => l.name === ALIASES[q]);
    this.matches = [...new Set([alias, ...starts, ...contains].filter(Boolean))].slice(0, 8);
    if (!this.matches.length) return this.close();
    this.active = 0;
    this.list.replaceChildren(...this.matches.map((l, i) => {
      const li = el("li", { id: `opt-${i}`, role: "option" }, l.name, el("small", { text: l.year }));
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.onPick(l.name);
      });
      return li;
    }));
    this.list.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
    this.highlight();
  }

  highlight() {
    [...this.list.children].forEach((li, i) => li.setAttribute("aria-selected", i === this.active));
    this.input.setAttribute("aria-activedescendant", this.active >= 0 ? `opt-${this.active}` : "");
    this.list.children[this.active]?.scrollIntoView({ block: "nearest" });
  }

  keydown(e) {
    if (this.list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : -1) + this.matches.length) % this.matches.length;
      this.highlight();
    } else if (e.key === "Escape") {
      this.close();
    }
  }

  close() {
    this.list.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
    this.matches = [];
    this.active = -1;
  }

  clear() {
    this.input.value = "";
    this.close();
  }
}

export function shake(node) {
  node.classList.remove("shake");
  void node.offsetWidth;
  node.classList.add("shake");
}

// ---------- describing a language ----------
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

export function describe(a) {
  return `${a.name} (${a.year}) is ${PHRASES.paradigm[a.paradigm]} and ${PHRASES.typing[a.typing]}. ` +
    `It ${PHRASES.execution[a.execution]} and has ${PHRASES.family[a.family]}.`;
}

// ---------- sharing ----------
export async function copyText(text, done = "Copied to clipboard") {
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

// On phones, open the share sheet; elsewhere, copy to the clipboard.
export async function shareOrCopy({ text, url, files }, done) {
  const data = { text, ...(url ? { url } : {}), ...(files ? { files } : {}) };
  const touch = matchMedia("(pointer: coarse)").matches;
  if ((touch || files) && navigator.share && (!files || navigator.canShare?.(data))) {
    try { await navigator.share(data); return true; } catch (err) { if (err?.name === "AbortError") return true; }
  }
  if (files) return false;
  await copyText(url ? `${text}\n${url}` : text, done);
  return true;
}

export function downloadFile(file) {
  const link = el("a", { href: URL.createObjectURL(file), download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

export const siteUrl = () => new URL(".", location.href).href;

export function untilMidnight() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const s = Math.max(0, Math.floor((midnight - now) / 1000));
  const pad = (v) => String(v).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// A short burst of brackets on a win, skipped for people who prefer less motion.
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const glyphs = ["{", "}", "(", ")", "<", ">", "[", "]"];
  const layer = el("div", { class: "confetti", "aria-hidden": "true" });
  for (let i = 0; i < 28; i++) {
    const piece = el("span", { text: glyphs[i % glyphs.length] });
    const vars = { "--x": `${Math.random() * 100}vw`, "--dx": `${(Math.random() - 0.5) * 24}vw`,
                   "--r": `${(Math.random() - 0.5) * 540}deg`, "--t": `${1.6 + Math.random() * 1.2}s`,
                   "--d": `${Math.random() * 0.3}s`, "--size": `${16 + Math.random() * 14}px` };
    for (const [k, v] of Object.entries(vars)) piece.style.setProperty(k, v);
    if (i % 3 === 0) piece.classList.add("accent");
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

// Horizontal bars for the guess distribution; `mark` highlights one row.
export function distributionBars(distribution, mark = 0) {
  const most = Math.max(1, ...distribution);
  return distribution.map((count, i) => {
    const bar = el("span", { class: "dist-bar" + (mark === i + 1 ? " mark" : ""), text: count });
    bar.style.width = `${Math.max(8, (100 * count) / most)}%`;
    return el("div", { class: "dist-row" }, el("span", { text: i + 1 }), bar);
  });
}

// The date a puzzle was the daily puzzle, e.g. "18 October".
export function puzzleDate(day) {
  return new Date(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day + day)
    .toLocaleDateString(undefined, { day: "numeric", month: "long" });
}
