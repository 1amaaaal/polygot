import { LANGUAGES } from "../data/languages.js";
import { MAX_GUESSES, dayNumber } from "./game.js";
import { highlightLine } from "./highlight.js";
import { initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("home");

const today = dayNumber();
const $ = (id) => document.getElementById(id);

// Today's status on the call-to-action.
const d = store.daily?.day === today ? store.daily : null;
if (d?.done) {
  $("play-cta").textContent = `See today's result (#${today + 1})`;
  $("today-status").textContent = "You've played today. Come back after midnight for a new snippet.";
} else if (d?.guesses.length) {
  $("play-cta").textContent = `Continue puzzle #${today + 1}`;
  $("today-status").textContent = `${d.guesses.length} of ${MAX_GUESSES} guesses used. Keep going!`;
} else {
  $("play-cta").textContent = `Play today's puzzle #${today + 1}`;
}

const solved = Object.keys(store.collection).length;
if (solved) $("collection-progress").textContent = `You've collected ${solved} of ${LANGUAGES.length} languages.`;

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
$("teaser-code").innerHTML = TEASER.map((line, i) =>
  `<span class="line${i > 2 ? " hidden" : ""}" data-n="${i + 1}">${i > 2 ? '<span class="bar" style="width:' + Math.max(1, line.trim().length) + 'ch"></span>' : highlightLine(line) || " "}</span>`).join("");
