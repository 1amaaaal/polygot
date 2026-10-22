// This week's boards: daily puzzle points, speed run and endless mode.

import { weeklyBoard } from "./boards.js";
import { LAUNCH, dayNumber } from "./game.js";
import { weekStart } from "./leaderboard.js";
import { avatar, el, initLayout } from "./layout.js";
import { currentUser } from "./server.js";

initLayout("leaderboard");

const today = dayNumber();
const $ = (id) => document.getElementById(id);

const BOARDS = {
  daily: {
    rule: "Points for daily puzzles solved in the last seven days: 6 for one guess, down to 1 for six.",
    columns: ["Points", "Wins"],
    cells: (r) => [r.points, r.wins],
  },
  speed: {
    rule: "Best speed run of the last seven days.",
    columns: ["Best", ""],
    cells: (r) => [r.score ?? "–", ""],
    empty: () => el("a", { href: "speed.html", text: "Play a speed run" }),
  },
  endless: {
    rule: "Longest endless run of the last seven days.",
    columns: ["Best", ""],
    cells: (r) => [r.score ?? "–", ""],
    empty: () => el("a", { href: "play.html?mode=endless", text: "Start an endless run" }),
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
  if (row.bot) {
    // Only real players have a picture; the empty slot keeps the names on one edge.
    who.append(el("span", { class: "avatar-slot" }), row.name, el("span", { class: "tag", text: "bot" }));
  } else if (row.guest) {
    who.append(el("span", { class: "avatar-slot" }), "you");
  } else {
    who.append(avatar(row.name, 24, row.avatar || undefined),
               el("a", { href: `https://github.com/${encodeURIComponent(row.name)}`, target: "_blank", rel: "noopener", text: `@${row.name}` }));
  }
  return who;
}

let shown = null;

async function show(id) {
  const board = BOARDS[id] ? id : "daily";
  shown = board;
  for (const tab of document.querySelectorAll("[role=tab]")) tab.setAttribute("aria-selected", tab.dataset.board === board);
  const b = BOARDS[board];
  $("board-rule").textContent = b.rule;
  $("col-a").textContent = b.columns[0];
  $("col-b").textContent = b.columns[1];
  $("board-panel").setAttribute("aria-busy", "true");
  const { rows, live } = await weeklyBoard(board, today);
  if (shown !== board) return;   // another tab was picked meanwhile
  $("board-panel").removeAttribute("aria-busy");
  $("standings").replaceChildren(...rows.map((r) => {
    const [a, c] = b.cells(r);
    const empty = r.me && b.empty && !r.score;
    return el("tr", { class: r.me ? "me" : "" },
      el("td", { text: r.rank }),
      el("td", {}, playerCell(r)),
      el("td", {}, empty ? b.empty() : String(a)),
      el("td", { text: c }));
  }));
  $("name-note").hidden = Boolean(currentUser());
  $("offline-note").hidden = live;
  $("bot-note").hidden = !rows.some((r) => r.bot);
}

for (const tab of document.querySelectorAll("[role=tab]")) {
  tab.addEventListener("click", () => {
    history.replaceState(null, "", `#${tab.dataset.board}`);
    show(tab.dataset.board);
  });
}
addEventListener("hashchange", () => show(location.hash.slice(1)));
show(location.hash.slice(1));
