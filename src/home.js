import { MAX_GUESSES, dayNumber, lineShape } from "./game.js";
import { initLayout } from "./layout.js";
import { store } from "./store.js";
import { puzzleDate, renderCode } from "./ui.js";

initLayout("home");

const today = dayNumber();
const $ = (id) => document.getElementById(id);

$("today-kicker").textContent = `Puzzle #${today + 1} · ${puzzleDate(today)}`;

// The call to action reflects how far the player got today.
const d = store.daily?.day === today ? store.daily : null;
if (d?.done) {
  $("play-cta").textContent = "See today's result";
  $("today-status").textContent = "You've played today. A new snippet arrives at midnight.";
} else if (d?.guesses.length) {
  $("play-cta").textContent = `Continue puzzle #${today + 1}`;
  $("today-status").textContent = `${d.guesses.length} of ${MAX_GUESSES} guesses used.`;
} else {
  $("play-cta").textContent = `Play puzzle #${today + 1}`;
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
renderCode($("teaser-code"), { lines: TEASER.slice(0, 3), hidden: TEASER.slice(3).map(lineShape) }, { animateFrom: 0 });
