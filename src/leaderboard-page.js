// This week's boards: daily puzzle points, speed run and endless mode.

import { LAUNCH, dayNumber } from "./game.js";
import { arcadeStandings, playerWeek, standings, weekStart, weeklyBest } from "./leaderboard.js";
import { avatar, el, initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("leaderboard");

const today = dayNumber();
const hour = new Date().getHours();
const $ = (id) => document.getElementById(id);
const name = store.github || "you";

const BOARDS = {
  daily: {
    rule: "Points for daily puzzles solved in the last seven days: 6 for one guess, down to 1 for six.",
    columns: ["Points", "Wins"],
    rows: () => standings({ name, ...playerWeek(store.history, today) }, today, hour),
    cells: (r) => [r.points, r.wins],
  },
  speed: {
    rule: "Best speed run of the last seven days.",
    columns: ["Best", ""],
    rows: () => arcadeStandings("speed", { name, score: weeklyBest(store.speed.runs, today) }, today, hour),
    cells: (r) => [r.score ?? "–", ""],
    empty: el("a", { href: "speed.html", text: "Play a speed run" }),
  },
  endless: {
    rule: "Longest endless run of the last seven days.",
    columns: ["Best", ""],
    rows: () => arcadeStandings("endless", { name, score: weeklyBest(store.endless.runs, today) }, today, hour),
    cells: (r) => [r.score ?? "–", ""],
    empty: el("a", { href: "play.html?mode=endless", text: "Start an endless run" }),
  },
};

const date = (day) => new Date(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day + day)
  .toLocaleDateString(undefined, { day: "numeric", month: "short" });
const from = weekStart(today);
$("board-range").textContent = from === today
  ? `The week so far: ${date(today)}.`
  : `This week: ${date(from)} to ${date(today)}. Older results drop off each day.`;

function playerCell(row) {
  const who = el("span", { class: "who" });
  if (row.bot) who.append(el("span", { class: "avatar placeholder", text: row.name[0].toUpperCase() }), row.name, el("span", { class: "tag", text: "bot" }));
  else who.append(store.github ? avatar(store.github, 24) : el("span", { class: "avatar placeholder", text: "?" }),
                  store.github ? `@${store.github}` : "you");
  return who;
}

function show(id) {
  const board = BOARDS[id] ? id : "daily";
  for (const tab of document.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", tab.dataset.board === board);
  const b = BOARDS[board];
  $("board-rule").textContent = b.rule;
  $("col-a").textContent = b.columns[0];
  $("col-b").textContent = b.columns[1];
  $("standings").replaceChildren(...b.rows().map((r) => {
    const [a, c] = b.cells(r);
    const empty = !r.bot && b.empty && r.score === null;
    return el("tr", { class: r.bot ? "" : "me" },
      el("td", { class: "mono", text: r.rank }),
      el("td", {}, playerCell(r)),
      el("td", { class: "mono" }, empty ? b.empty : String(a)),
      el("td", { class: "mono", text: c }));
  }));
  $("name-note").hidden = Boolean(store.github);
}

for (const tab of document.querySelectorAll("[role=tab]")) {
  tab.addEventListener("click", () => {
    history.replaceState(null, "", `#${tab.dataset.board}`);
    show(tab.dataset.board);
  });
}
addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1));
