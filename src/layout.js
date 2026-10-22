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

// Icons are Phosphor (regular weight, MIT licence), copied in so the site
// needs nothing from outside.
export const ICON = {
  help: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z"/></svg>',
  settings: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z"/></svg>',
  close: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg>',
  arrow: '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/></svg>',
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

// A GitHub avatar, falling back to the first letter if it can't load.
export function avatar(name, size, src = `https://github.com/${encodeURIComponent(name)}.png`) {
  const url = new URL(src);
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
    el("span", { text: `Polyglot · puzzle #${dayNumber() + 1}` }),
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
  document.body.append(el("dialog", { id: "settings-dialog", "aria-labelledby": "settings-title", autofocus: "" },
    el("form", { method: "dialog" }, el("button", { class: "close", "aria-label": "Close", title: "Close", html: ICON.close })),
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
