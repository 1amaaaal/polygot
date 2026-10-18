// Shared page chrome: header and navigation, settings, the profile and
// leaderboard sidebar, toasts, and the offline service worker.

import { GITHUB_NAME, currentStreak, dayNumber, points } from "./game.js";
import { WEEK, playerWeek, standings } from "./leaderboard.js";
import { save, store } from "./store.js";

const PAGES = [
  { href: "index.html", label: "Home", id: "home" },
  { href: "play.html", label: "Play", id: "play" },
  { href: "archive.html", label: "Archive", id: "archive" },
  { href: "collection.html", label: "Collection", id: "collection" },
  { href: "languages.html", label: "Languages", id: "languages" },
  { href: "help.html", label: "How to play", id: "help" },
];

const ICONS = {
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>',
};

export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

// A pre-filled GitHub issue for correcting a language's facts.
export function reportUrl(lang) {
  const body = `Which detail about ${lang.name} is wrong?\n\n` +
    `- Year: ${lang.year}\n- Paradigm: ${lang.paradigm}\n- Typing: ${lang.typing}\n` +
    `- Runs as: ${lang.execution}\n- Looks like: ${lang.family}\n- Creator: ${lang.creator}\n- Fact: ${lang.fact}\n\n` +
    "What should it say? Please include a source:\n";
  const url = new URL("https://github.com/1amaaaal/polygot/issues/new");
  url.searchParams.set("title", `Fact check: ${lang.name}`);
  url.searchParams.set("body", body);
  return url.href;
}

// ---------- toast ----------
let toastEl;
let toastTimer;
export function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

// ---------- header ----------
function renderHeader(page) {
  const header = el("header", { class: "topbar" },
    el("a", { class: "logo", href: "index.html", "aria-label": "Polyglot home" }, "Poly", el("span", { text: "glot" })),
    el("nav", { class: "nav", "aria-label": "Main" }, ...PAGES.map((p) =>
      el("a", { href: p.href, text: p.label, ...(p.id === page ? { "aria-current": "page" } : {}) }))),
    el("button", { class: "icon-btn", id: "settings-btn", "aria-label": "Settings", title: "Settings",
                   onclick: () => document.getElementById("settings-dialog").showModal() }),
  );
  header.querySelector("#settings-btn").innerHTML = ICONS.settings;
  document.body.prepend(header);
}

// ---------- settings ----------
const settingsListeners = [];
export const onSettingsChange = (fn) => settingsListeners.push(fn);

export function applySettings() {
  document.body.classList.toggle("colorblind", Boolean(store.settings.colorblind));
}

function hardModeLocked() {
  const d = store.daily;
  return d && d.day === dayNumber() && d.guesses.length > 0 && !d.done;
}

function renderSettings() {
  const toggle = (id, title, detail, key) => el("label", { class: "setting" },
    el("span", {}, el("strong", { text: title }), el("br"), el("small", { text: detail })),
    el("input", { type: "checkbox", id, ...(store.settings[key] ? { checked: "" } : {}),
      onchange: (e) => {
        if (key === "hard" && hardModeLocked()) {
          e.target.checked = Boolean(store.settings.hard);
          toast("Finish today's puzzle before switching hard mode");
          return;
        }
        store.settings[key] = e.target.checked;
        save();
        applySettings();
        settingsListeners.forEach((fn) => fn(store.settings));
      } }));
  const dialog = el("dialog", { id: "settings-dialog", "aria-labelledby": "settings-title" },
    el("form", { method: "dialog" }, el("button", { class: "close", "aria-label": "Close", text: "×" })),
    el("h2", { id: "settings-title", text: "Settings" }),
    toggle("hard-toggle", "Hard mode", "No syntax colours, and every guess must fit all the clues so far. Results get a *.", "hard"),
    el("hr"),
    toggle("colorblind-toggle", "Colour-blind mode", "Orange and blue instead of green and yellow", "colorblind"),
  );
  document.body.append(dialog);
}

// ---------- sidebar: profile + leaderboard ----------
function avatar(name, size) {
  const img = el("img", { class: "avatar", alt: "", width: size, height: size, loading: "lazy",
    src: `https://github.com/${encodeURIComponent(name)}.png?size=${size * 2}` });
  img.addEventListener("error", () => img.replaceWith(el("span", { class: "avatar placeholder", text: name[0].toUpperCase() })));
  return img;
}

function profileCard() {
  const s = store.stats;
  const today = dayNumber();
  if (!store.github) {
    const input = el("input", { type: "text", placeholder: "your-github-username", "aria-label": "GitHub username",
                                autocomplete: "off", spellcheck: "false", autocapitalize: "off", maxlength: "39" });
    const form = el("form", { class: "profile-form", onsubmit: (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/^@/, "");
      if (!GITHUB_NAME.test(name)) {
        toast("That doesn't look like a GitHub username");
        return;
      }
      store.github = name;
      save();
      renderSidebar();
      toast(`Welcome, @${name}!`);
    } }, input, el("button", { class: "btn primary small", text: "Save" }));
    return el("section", { class: "card profile" },
      el("h2", { text: "Your profile" }),
      el("p", { class: "muted", text: "Add your GitHub username to put your name and avatar on the leaderboard, share images and challenge links." }),
      form,
      el("p", { class: "tiny", text: "Saved only in this browser. Polyglot never asks for a password." }));
  }
  return el("section", { class: "card profile" },
    el("div", { class: "profile-head" },
      avatar(store.github, 48),
      el("div", {},
        el("a", { class: "handle", href: `https://github.com/${encodeURIComponent(store.github)}`, target: "_blank",
                  rel: "noopener", text: `@${store.github}` }),
        el("button", { class: "link-btn", text: "change", onclick: () => {
          store.github = "";
          save();
          renderSidebar();
        } }))),
    el("div", { class: "mini-stats" },
      ...[[s.played, "Played"], [s.played ? Math.round((100 * s.wins) / s.played) + "%" : "–", "Wins"],
          [currentStreak(s, today), "Streak"], [points(s.distribution), "Points"]]
        .map(([v, l]) => el("div", {}, el("b", { text: String(v) }), el("span", { text: l })))));
}

function leaderboardCard() {
  const s = store.stats;
  const today = dayNumber();
  const me = { name: store.github || "you", ...playerWeek(store.history, today) };
  const rows = standings(me, today, new Date().getHours());
  const list = el("ol", { class: "board-list" }, ...rows.map((r) => el("li", { class: r.bot ? "" : "me" },
    r.rank <= 3 && r.points > 0
      ? el("span", { class: "rank medal", text: ["🥇", "🥈", "🥉"][r.rank - 1], "aria-label": `Rank ${r.rank}` })
      : el("span", { class: "rank", text: r.rank }),
    r.bot ? el("span", { class: "avatar placeholder bot", text: "🤖" }) : (store.github ? avatar(store.github, 24) : el("span", { class: "avatar placeholder", text: "★" })),
    el("span", { class: "who" }, r.bot ? r.name : (store.github ? `@${store.github}` : "You"),
       r.bot ? el("small", { class: "tag", text: "BOT" }) : null),
    el("span", { class: "pts", text: `${r.points}` }))));
  return el("section", { class: "card leaderboard" },
    el("h2", { text: "Leaderboard" }),
    el("p", { class: "muted small", text: `You vs the bots · points from the last ${WEEK} days` }),
    list,
    el("p", { class: "tiny", text: "Daily wins score 6 points for 1 guess, down to 1 point for 6. Bots are simulated rivals: a real global leaderboard needs a server." }));
}

export function renderSidebar() {
  const aside = document.getElementById("sidebar");
  if (aside) aside.replaceChildren(profileCard(), leaderboardCard());
}

// ---------- setup ----------
export function initLayout(page) {
  renderHeader(page);
  renderSettings();
  toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  document.body.append(toastEl);
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  }
  applySettings();
  renderSidebar();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
