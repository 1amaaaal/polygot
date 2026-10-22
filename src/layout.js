// Shared page chrome: header and navigation, footer, settings, toasts, badge
// announcements and the offline service worker. Every page imports this
// first, so it is also where a signed-in player's progress is fetched before
// the page renders.

import { claimNew } from "./achievements.js";
import { dayNumber } from "./game.js";
import { save, store } from "./store.js";
import { pullOnLoad, pushSoon } from "./sync.js";

const loadMessage = await pullOnLoad();

// The four main sections. Other pages belong to one of them for the
// purposes of highlighting the navigation.
const NAV = [
  { href: "play.html", label: "Today", id: "play" },
  { href: "arcade.html", label: "Arcade", id: "arcade" },
  { href: "leaderboard.html", label: "Leaderboard", id: "leaderboard" },
  { href: "profile.html", label: "Profile", id: "profile" },
];

const ICON = {
  help: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.4v.6"/><path d="M12 16.8v.2"/></svg>',
  settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
};

export const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
};

// A GitHub avatar, falling back to the first letter if it can't load. Only
// GitHub's own picture addresses are used: an image from anywhere else would
// tell that server who looked at the leaderboard.
const AVATAR_HOSTS = new Set(["github.com", "avatars.githubusercontent.com"]);
export function avatar(name, size, src) {
  let url = null;
  try { url = new URL(src); } catch { /* none given, or not a URL */ }
  if (url?.protocol !== "https:" || !AVATAR_HOSTS.has(url.hostname)) {
    url = new URL(`https://github.com/${encodeURIComponent(name)}.png`);
  }
  url.searchParams.set(url.hostname === "github.com" ? "size" : "s", size * 2);
  const img = el("img", { class: "avatar", alt: "", width: size, height: size, loading: "lazy", src: url.href });
  img.addEventListener("error", () => img.replaceWith(el("span", { class: "avatar placeholder", text: name[0].toUpperCase() })));
  return img;
}

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
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

// Save any badges earned since last time and tell the player about them.
export function celebrateBadges(delay = 1200) {
  const fresh = claimNew(store);
  if (!fresh.length) return;
  save();
  pushSoon();
  setTimeout(() => toast(fresh.length === 1 ? `Badge unlocked: ${fresh[0].name}` : `${fresh.length} badges unlocked`), delay);
}

// ---------- header and footer ----------
function renderHeader(section) {
  const header = el("header", { class: "topbar" },
    el("a", { class: "logo", href: "index.html", "aria-label": "Polyglot home" }, "polyglot", el("span", { class: "caret", "aria-hidden": "true" })),
    el("nav", { class: "nav", "aria-label": "Main" }, ...NAV.map((p) =>
      el("a", { href: p.href, text: p.label, ...(p.id === section ? { "aria-current": "page" } : {}) }))),
    el("div", { class: "topbar-tools" },
      el("a", { class: "icon-btn", href: "help.html", "aria-label": "How to play", title: "How to play", html: ICON.help }),
      el("button", { class: "icon-btn", id: "settings-btn", "aria-label": "Settings", title: "Settings", html: ICON.settings,
                     onclick: () => document.getElementById("settings-dialog").showModal() })),
  );
  document.body.prepend(header);
}

function renderFooter() {
  document.body.append(el("footer", { class: "footer" },
    el("span", { class: "mono", text: `polyglot · puzzle #${dayNumber() + 1}` }),
    el("nav", { "aria-label": "More" },
      el("a", { href: "languages.html", text: "Languages" }),
      el("a", { href: "help.html", text: "How to play" }),
      el("a", { href: "https://github.com/1amaaaal/polygot", text: "Source" }))));
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
    el("span", {}, el("strong", { text: title }), el("small", { text: detail })),
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
  document.body.append(el("dialog", { id: "settings-dialog", "aria-labelledby": "settings-title" },
    el("form", { method: "dialog" }, el("button", { class: "close", "aria-label": "Close", text: "×" })),
    el("h2", { id: "settings-title", text: "Settings" }),
    toggle("hard-toggle", "Hard mode", "No syntax colours, and every guess must fit the clues so far.", "hard"),
    toggle("colorblind-toggle", "Colour-blind mode", "Orange and blue instead of green and yellow.", "colorblind"),
  ));
}

// ---------- setup ----------
export function initLayout(section) {
  renderHeader(section);
  renderSettings();
  renderFooter();
  toastEl = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  document.body.append(toastEl);
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  }
  applySettings();
  if (loadMessage) setTimeout(() => toast(loadMessage), 300);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
