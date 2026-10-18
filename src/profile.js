// The profile: who you are, your stats, badges and language collection.

import { LANGUAGES } from "../data/languages.js";
import { evaluate } from "./achievements.js";
import { GITHUB_NAME, currentStreak, dayNumber } from "./game.js";
import { avatar, celebrateBadges, el, initLayout, toast } from "./layout.js";
import { save, store } from "./store.js";
import { distributionBars } from "./ui.js";

initLayout("profile");

const $ = (id) => document.getElementById(id);
const today = dayNumber();

// ---------- identity ----------
function renderIdentity() {
  const head = $("identity");
  if (store.github && !head.dataset.editing) {
    head.replaceChildren(
      avatar(store.github, 64),
      el("div", {},
        el("h1", {}, el("a", { href: `https://github.com/${encodeURIComponent(store.github)}`, target: "_blank",
                                rel: "noopener", text: `@${store.github}` })),
        el("p", { class: "muted", text: "Shown on the leaderboard and on challenges you send." })),
      el("button", { class: "btn ghost small", type: "button", text: "Change",
        onclick: () => { head.dataset.editing = "1"; renderIdentity(); } }));
    return;
  }
  const input = el("input", { type: "text", id: "github-input", placeholder: "your-github-username", value: store.github,
                              "aria-label": "GitHub username", spellcheck: "false", autocapitalize: "off" });
  const form = el("form", { class: "name-form", onsubmit: (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/^@/, "");
    if (name && !GITHUB_NAME.test(name)) {
      toast("That isn't a valid GitHub username");
      return;
    }
    store.github = name;
    save();
    delete head.dataset.editing;
    renderIdentity();
    if (name) toast(`Saved as @${name}`);
  } }, input, el("button", { class: "btn primary", type: "submit", text: "Save" }));
  head.replaceChildren(el("div", {},
    el("h1", { text: "Your profile" }),
    el("p", { class: "muted", text: "Add your GitHub username to appear by name on the leaderboard. It's only stored in this browser." }),
    form));
}

// ---------- stats ----------
function renderStats() {
  const s = store.stats;
  const stat = (value, text) => el("div", {}, el("b", { text: String(value) }), el("span", { text }));
  $("stats").replaceChildren(
    stat(s.played, "Played"),
    stat(s.played ? Math.round((100 * s.wins) / s.played) : 0, "Win %"),
    stat(currentStreak(s, today), "Streak"),
    stat(s.maxStreak, "Best streak"),
  );
  const best = (runs) => runs.reduce((m, r) => Math.max(m, r.score), 0);
  const parts = [];
  if (store.speed.runs.length) parts.push(`Speed run best: ${best(store.speed.runs)}`);
  if (store.endless.runs.length) parts.push(`Endless best: ${best(store.endless.runs)} in a row`);
  $("arcade-stats").textContent = parts.join(" · ");
  $("dist").replaceChildren(...distributionBars(s.distribution));
  $("distribution").hidden = s.wins === 0;
}

// ---------- badges ----------
const BADGES_SHOWN = 8;

function renderBadges() {
  const badges = evaluate(store);
  const unlocked = badges.filter((b) => b.unlocked);
  $("badge-summary").textContent = `${unlocked.length} of ${badges.length} unlocked`;
  // Unlocked first, then the ones closest to unlocking. Only the first few
  // are shown until the player asks for the rest.
  const order = [...badges].sort((a, b) => b.unlocked - a.unlocked || b.current / b.target - a.current / a.target);
  const grid = $("badge-grid");
  const tiles = order.map((b) =>
    el("li", { class: "badge" + (b.unlocked ? " unlocked" : ""), title: b.unlocked && b.date ? `Unlocked ${b.date}` : "" },
      el("span", { class: "badge-mark mono", "aria-hidden": "true", text: b.glyph }),
      el("span", { class: "badge-body" },
        el("b", { text: b.name }),
        el("span", { text: b.text }),
        b.unlocked ? null : el("span", { class: "badge-progress mono", text: `${b.current}/${b.target}` }))));
  const shown = Math.max(BADGES_SHOWN, unlocked.length);
  grid.replaceChildren(...tiles.slice(0, shown));
  if (tiles.length > shown) {
    const more = el("button", { class: "btn ghost small more", type: "button", text: `Show all ${tiles.length}`,
      onclick: () => { grid.replaceChildren(...tiles); more.remove(); } });
    grid.after(more);
  }
}

// ---------- collection ----------
function renderCollection() {
  const solved = store.collection;
  const count = LANGUAGES.filter((l) => solved[l.name]).length;
  $("collection-summary").textContent = `${count} of ${LANGUAGES.length} languages`;
  $("collection-bar").style.width = `${(100 * count) / LANGUAGES.length}%`;
  const sorted = [...LANGUAGES].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  $("tiles").replaceChildren(...sorted.map((l) => {
    const entry = solved[l.name];
    return el("li", { class: "tile" + (entry ? " got" : ""),
                      title: entry ? `Solved ${entry.wins} ${entry.wins === 1 ? "time" : "times"}, first on ${entry.firstSolved}` : "Not collected yet" },
      el("b", { text: l.name }),
      el("span", { class: "mono", text: entry ? `×${entry.wins}` : l.year }));
  }));
}

const played = store.stats.played || Object.keys(store.collection).length;
if (!played) $("wrapped-text").textContent = "Play a few puzzles and it fills itself in.";

renderIdentity();
renderStats();
renderBadges();
renderCollection();
celebrateBadges(400);
