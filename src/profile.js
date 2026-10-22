// The profile: who you are, your stats, badges and language collection.

import { LANGUAGES } from "../data/languages.js";
import { evaluate } from "./achievements.js";
import { currentStreak, dayNumber } from "./game.js";
import { ICON, avatar, celebrateBadges, el, initLayout, toast } from "./layout.js";
import { currentUser, signIn, signOut } from "./server.js";
import { save, store } from "./store.js";
import { flush } from "./sync.js";
import { distributionBars } from "./ui.js";

initLayout("profile");

const $ = (id) => document.getElementById(id);
const today = dayNumber();

// ---------- identity ----------
const GITHUB_MARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"/></svg>';

function renderIdentity() {
  const user = currentUser();
  const head = $("identity");
  if (user) {
    head.replaceChildren(
      avatar(user.username, 64, user.avatar || undefined),
      el("div", {},
        el("h1", {}, el("a", { href: `https://github.com/${encodeURIComponent(user.username)}`, target: "_blank",
                                rel: "noopener", text: `@${user.username}` })),
        el("p", { class: "muted", text: "Signed in with GitHub. Your progress is saved to your account." })),
      el("button", { class: "btn ghost small", type: "button", text: "Sign out", onclick: async (e) => {
        e.target.disabled = true;
        await flush();
        await signOut();
        store.github = "";
        save();
        renderIdentity();
        toast("Signed out. Your progress stays in this browser.");
      } }));
    return;
  }
  // If GitHub can't be reached, say so under the button and let it be pressed again.
  const error = el("p", { class: "signin-error", role: "alert" });
  head.replaceChildren(el("div", {},
    el("h1", { text: "Your profile" }),
    el("p", { class: "muted", text: "Sign in to join the leaderboard and keep your streak, badges and collection on every device. Polyglot only sees your public GitHub name and picture." }),
    el("button", { class: "btn primary signin", type: "button", html: `${GITHUB_MARK} Sign in with GitHub`,
                   onclick: (e) => {
                     const button = e.currentTarget;
                     button.disabled = true;
                     error.textContent = "";
                     signIn().catch(() => {
                       button.disabled = false;
                       error.textContent = "Couldn't reach GitHub. Check your connection and try again.";
                     });
                   } }),
    error));
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
        b.unlocked ? null : el("span", { class: "badge-progress", text: `${b.current} of ${b.target}` }))));
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
      el("span", { class: "num", text: entry ? `×${entry.wins}` : l.year }));
  }));
}

$("wrapped-link").insertAdjacentHTML("beforeend", ICON.arrow);

const played = store.stats.played || Object.keys(store.collection).length;
if (!played) $("wrapped-text").textContent = "Play a few puzzles and it fills itself in.";

renderIdentity();
renderStats();
renderBadges();
renderCollection();
celebrateBadges(400);
