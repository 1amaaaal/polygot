// The arcade: the extra modes, each with the player's best and weekly rank,
// and the archive of past daily puzzles.

import { weeklyBoard } from "./boards.js";
import { LAUNCH, MAX_GUESSES, dayNumber } from "./game.js";
import { weeklyBest } from "./leaderboard.js";
import { el, initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("arcade");

const today = dayNumber();
const $ = (id) => document.getElementById(id);

async function bestLine(kind, unit) {
  const runs = store[kind].runs;
  if (!runs.length) return "Not played yet";
  const best = runs.reduce((m, r) => Math.max(m, r.score), 0);
  if (weeklyBest(runs, today) === null) return `Best ${best} ${unit}`;
  const { rows } = await weeklyBoard(kind, today);
  return `Best ${best} ${unit} · #${rows.find((r) => r.me).rank} this week`;
}

const MODES = [
  { name: "Endless", href: "play.html?mode=endless", stat: () => bestLine("endless", "in a row"),
    text: "Random snippets, six guesses each, until you miss one." },
  { name: "Speed run", href: "speed.html", stat: () => bestLine("speed", "solved"),
    text: "Sixty seconds on the clock. A wrong guess costs three of them." },
  { name: "Practice", href: "play.html?mode=practice", stat: async () => "",
    text: "One random snippet with the usual clues. Nothing is recorded but your collection." },
];

$("mode-list").replaceChildren(...MODES.map((m) => {
  const stat = el("span", { class: "mode-stat mono" });
  m.stat().then((text) => { stat.textContent = text; });
  return el("li", { class: "mode" },
    el("div", {},
      el("h2", {}, el("a", { href: m.href, text: m.name })),
      el("p", { text: m.text })),
    stat,
    el("a", { class: "btn", href: m.href, text: "Play", "aria-label": `Play ${m.name}` }));
}));

// ---------- archive ----------
const SHOWN = 10;

function status(day) {
  const result = store.history[day] ?? store.archive[day];
  if (result === undefined) return null;
  return result > 0 ? `Solved ${result}/${MAX_GUESSES}` : "Missed";
}

async function renderArchive() {
  const list = $("archive-list");
  if (today === 0) {
    $("archive-summary").textContent = "Past daily puzzles appear here from tomorrow.";
    list.remove();
    return;
  }
  const played = Array.from({ length: today }, (_, day) => status(day)).filter(Boolean).length;
  $("archive-summary").textContent = `${today} past ${today === 1 ? "puzzle" : "puzzles"}, ${played} played.`;

  const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
  const rows = [];
  for (let day = today - 1; day >= 0; day--) {
    const s = status(day);
    // The answers stay on the server; this browser only knows the ones the
    // player has finished.
    const language = s ? store.dayAnswers?.[day] : null;
    rows.push(el("li", { class: "archive-row" + (s ? " played" : "") },
      el("span", { class: "num mono", text: `#${day + 1}` }),
      el("span", { class: "date", text: date.format(new Date(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day + day)) }),
      el("span", { class: "state", text: s ? [s, language].filter(Boolean).join(" · ") : "" }),
      el("a", { class: "btn small", href: `play.html?day=${day + 1}`, text: s ? "Replay" : "Play" })));
  }
  list.replaceChildren(...rows.slice(0, SHOWN));
  if (rows.length > SHOWN) {
    const more = el("button", { class: "btn ghost small", type: "button", text: `Show all ${rows.length}`,
      onclick: () => { list.replaceChildren(...rows); more.remove(); } });
    list.after(more);
  }
}

renderArchive();
