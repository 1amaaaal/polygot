// Polyglot Wrapped: the player's year as a short run of slides. Tap or use
// the arrow keys to move through them; the last one can be shared.

import { el, initLayout, toast } from "./layout.js";
import { canvasToFile, drawWrappedCard } from "./share-image.js";
import { store } from "./store.js";
import { downloadFile, shareOrCopy, siteUrl } from "./ui.js";
import { slides, summarize } from "./wrapped.js";

initLayout("profile");

const $ = (id) => document.getElementById(id);
const year = new Date().getFullYear();
const summary = summarize(store);
const story = summary.hasPlayed ? slides(summary, year) : [
  { kicker: `Polyglot Wrapped ${year}`, big: "Nothing to wrap yet", text: "Play a few puzzles and come back: this fills itself in as you go.", final: true },
];
let at = 0;

$("story-progress").replaceChildren(...story.map(() => el("span")));

function show(i) {
  at = Math.max(0, Math.min(story.length - 1, i));
  const s = story[at];
  $("slide-kicker").textContent = s.kicker;
  $("slide-big").textContent = s.big;
  $("slide-text").textContent = s.text;
  $("slide").classList.remove("enter");
  void $("slide").offsetWidth;
  $("slide").classList.add("enter");
  [...$("story-progress").children].forEach((bar, n) => bar.classList.toggle("done", n <= at));
  $("slide-count").textContent = `${at + 1} / ${story.length}`;
  $("prev-btn").disabled = at === 0;
  $("next-btn").hidden = at === story.length - 1;
  $("wrapped-actions").hidden = !(s.final && summary.hasPlayed);
}

function figures() {
  const out = [];
  if (summary.daily.played) out.push([summary.daily.played, "puzzles played"]);
  out.push([`${summary.collected}/${summary.totalLanguages}`, "languages"]);
  if (summary.daily.maxStreak) out.push([summary.daily.maxStreak, "best streak"]);
  out.push([summary.badges.unlocked, "badges"]);
  return out.slice(0, 4);
}

function summaryText() {
  const lines = [`Polyglot Wrapped ${year}`];
  if (summary.personality) lines.push(summary.personality[0]);
  for (const [value, label] of figures()) lines.push(`${value} ${label}`);
  return `${lines.join("\n")}\n${siteUrl()}`;
}

$("prev-btn").addEventListener("click", () => show(at - 1));
$("next-btn").addEventListener("click", () => show(at + 1));
$("slide").addEventListener("click", (e) => {
  const { left, width } = e.currentTarget.getBoundingClientRect();
  show(e.clientX - left < width / 3 ? at - 1 : at + 1);
});
addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") show(at + 1);
  if (e.key === "ArrowLeft") show(at - 1);
});
$("copy-btn").addEventListener("click", () => shareOrCopy({ text: summaryText() }));
$("share-btn").addEventListener("click", async () => {
  const canvas = await drawWrappedCard({ year, name: store.github, figures: figures(),
                                         personality: summary.personality?.[0], url: siteUrl() });
  const file = await canvasToFile(canvas, `polyglot-wrapped-${year}.png`);
  if (!(await shareOrCopy({ text: `My Polyglot Wrapped ${year}`, files: [file] }))) {
    downloadFile(file);
    toast("Image downloaded");
  }
});

show(0);
