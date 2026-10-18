import { MAX_GUESSES, LAUNCH, dailySnippetIndex, dayNumber, parseSnippets } from "./game.js";
import { el, initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("archive");

const today = dayNumber();
const list = document.getElementById("archive-list");

function status(day) {
  const result = store.history[day] ?? store.archive[day];
  if (result === undefined) return { text: "Not played", cls: "" };
  return result > 0 ? { text: `Solved ${result}/${MAX_GUESSES}`, cls: "won" } : { text: "Missed", cls: "lost" };
}

if (today === 0) {
  list.replaceWith(el("p", { class: "card muted", text: "The archive fills up from tomorrow: today's puzzle is #1." }));
} else {
  const res = await fetch(new URL("../data/snippets.txt", import.meta.url));
  const snippets = parseSnippets(await res.text());
  const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const rows = [];
  for (let day = today - 1; day >= 0; day--) {
    const date = new Date(LAUNCH.year, LAUNCH.month - 1, LAUNCH.day + day);
    const s = status(day);
    // Only reveal the language of puzzles the player has already finished.
    const language = s.cls ? snippets[dailySnippetIndex(day, snippets)].language : null;
    rows.push(el("li", { class: `archive-row ${s.cls}` },
      el("span", { class: "num", text: `#${day + 1}` }),
      el("span", { class: "date", text: dateFormat.format(date) }),
      el("span", { class: "state", text: language ? `${s.text} · ${language}` : s.text }),
      el("a", { class: `btn small${s.cls ? "" : " primary"}`, href: `play.html?day=${day + 1}`, text: s.cls ? "Replay" : "Play" })));
  }
  list.replaceChildren(...rows);
}
