import { LANGUAGES } from "../data/languages.js";
import { MAX_GUESSES, dayNumber } from "./game.js";
import { el, initLayout } from "./layout.js";
import { store } from "./store.js";
import { puzzleDate, renderCode } from "./ui.js";

initLayout("home");

const today = dayNumber();
const $ = (id) => document.getElementById(id);

const dated = `Puzzle #${today + 1}, ${puzzleDate(today)}.`;

// The call to action reflects how far the player got today.
const d = store.daily?.day === today ? store.daily : null;
if (d?.done) {
  $("play-cta").textContent = "See today's result";
  $("today-status").textContent = `${dated} You've played it; a new snippet arrives at midnight.`;
} else if (d?.guesses.length) {
  $("play-cta").textContent = `Continue puzzle #${today + 1}`;
  $("today-status").textContent = `${dated} ${d.guesses.length} of ${MAX_GUESSES} guesses used.`;
} else {
  $("play-cta").textContent = `Play puzzle #${today + 1}`;
  $("today-status").textContent = `${dated} The same snippet for everyone, until midnight.`;
}

// A decorative example round. This snippet isn't in the daily pool, so it
// can't spoil a puzzle.
const TEASER = [
  "#include <stdio.h>",
  "",
  "int main(void) {",
  '    printf("Hello from 1972\\n");',
  "    return 0;",
  "}",
];
renderCode($("teaser-code"), TEASER, { visible: 3, animateFrom: 0 });

// Every possible answer, oldest first.
const byYear = [...LANGUAGES].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
$("lang-wall").replaceChildren(...byYear.map((l) => el("li", {}, l.name, el("span", { text: l.year }))));
