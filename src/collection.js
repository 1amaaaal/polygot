import { LANGUAGES } from "../data/languages.js";
import { el, initLayout } from "./layout.js";
import { store } from "./store.js";

initLayout("collection");

const solved = store.collection;
const count = LANGUAGES.filter((l) => solved[l.name]).length;
document.getElementById("collection-summary").textContent = count === LANGUAGES.length
  ? `You've collected all ${count} languages. You're a true polyglot! 🎉`
  : count
    ? `${count} of ${LANGUAGES.length} languages collected. Solve a puzzle in any mode to add its language.`
    : `Nothing collected yet. Solve a puzzle in any mode to add its language here.`;
document.getElementById("collection-bar").style.width = `${(100 * count) / LANGUAGES.length}%`;

const families = [...new Set(LANGUAGES.map((l) => l.family))];
document.getElementById("collection-groups").replaceChildren(...families.map((family) => {
  const langs = LANGUAGES.filter((l) => l.family === family).sort((a, b) => a.year - b.year);
  const got = langs.filter((l) => solved[l.name]).length;
  return el("section", { class: "family" },
    el("h2", {}, family, el("small", { text: ` ${got}/${langs.length}` })),
    el("div", { class: "tiles" }, ...langs.map((l) => {
      const entry = solved[l.name];
      return el("div", { class: "tile" + (entry ? " got" : ""),
                         title: entry ? `Solved ${entry.wins}× · first on ${entry.firstSolved}` : "Not collected yet" },
        el("b", { text: l.name }),
        el("span", { text: entry ? `✓ ${entry.wins}×` : l.year }));
    })));
}));
