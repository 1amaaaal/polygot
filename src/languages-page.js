import { LANGUAGES } from "../data/languages.js";
import { el, initLayout, reportUrl } from "./layout.js";
import { store } from "./store.js";

initLayout("languages");

const grid = document.getElementById("lang-grid");
const search = document.getElementById("lang-search");
const sorted = [...LANGUAGES].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));

function card(l) {
  const got = store.collection[l.name];
  return el("article", { class: "lang" + (got ? " got" : "") },
    el("header", {},
      el("h2", { text: l.name }),
      el("span", { class: "year mono", text: l.year }),
      got ? el("span", { class: "tag", text: "collected" }) : null),
    el("p", { class: "traits mono", text: [l.paradigm, l.typing, l.execution, l.family].join(" · ") }),
    el("p", { text: `${l.fact} Created by ${l.creator}.` }),
    el("p", { class: "links" },
      el("a", { href: l.wiki, target: "_blank", rel: "noopener", text: "Wikipedia" }),
      el("a", { href: reportUrl(l), target: "_blank", rel: "noopener", text: "Report a mistake",
                title: `Report a mistake about ${l.name}` })));
}

function render() {
  const q = search.value.trim().toLowerCase();
  const shown = sorted.filter((l) => !q || [l.name, l.creator, l.fact, l.paradigm, l.typing, l.execution, l.family, String(l.year)]
    .some((text) => text.toLowerCase().includes(q)));
  grid.replaceChildren(...(shown.length ? shown.map(card) : [el("p", { class: "muted", text: "No languages match that search." })]));
}

search.addEventListener("input", render);
render();
