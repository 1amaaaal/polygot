import { LANGUAGES } from "../data/languages.js";
import { el, initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("languages");

const grid = document.getElementById("lang-grid");
const search = document.getElementById("lang-search");
const sorted = [...LANGUAGES].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));

function card(l) {
  const got = store.collection[l.name];
  return el("article", { class: "card lang" + (got ? " got" : "") },
    el("header", {}, el("h2", { text: l.name }), el("span", { class: "year", text: l.year })),
    el("div", { class: "chips" }, ...[l.paradigm, l.typing, l.execution, l.family].map((t) => el("span", { class: "chip", text: t }))),
    el("p", { class: "small", text: `Created by ${l.creator}.` }),
    el("p", { text: l.fact }),
    el("footer", {},
      el("a", { href: l.wiki, target: "_blank", rel: "noopener", text: "Wikipedia →" }),
      got ? el("span", { class: "collected", text: "✓ Collected" }) : null));
}

function render() {
  const q = search.value.trim().toLowerCase();
  const shown = sorted.filter((l) => !q || [l.name, l.creator, l.fact, l.paradigm, l.typing, l.execution, l.family, String(l.year)]
    .some((text) => text.toLowerCase().includes(q)));
  grid.replaceChildren(...(shown.length ? shown.map(card) : [el("p", { class: "muted", text: "No languages match that search." })]));
}

search.addEventListener("input", render);
render();
