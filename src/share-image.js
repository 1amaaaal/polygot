// Shareable images (1200x630, the size social networks use for link
// previews), drawn on a canvas entirely in the browser.

import { TRAIT_KEYS } from "./game.js";

const W = 1200, H = 630;
// Result cards sit on the plum of the code panel; the Wrapped card on the
// periwinkle of the Wrapped slides. The caret is always periwinkle.
const PLUM = { bg: "#342e35", text: "#f5f3f6", muted: "#b3abb6", rule: "#4a434c", empty: "#3f3840", caret: "#7778de" };
const LEAD = { bg: "#7778de", text: "#111111", muted: "#111111", rule: "rgba(17, 17, 17, 0.25)", caret: "#111111" };
const COLORS = {
  normal: { hit: "#238636", close: "#e3b341", miss: "#4a434c" },
  colorblind: { hit: "#c2410c", close: "#1f6feb", miss: "#4a434c" },
};
const SANS = "'IBM Plex Sans', system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

// Canvas text only uses a web font once it has loaded.
async function fontsReady() {
  try {
    await Promise.all([`600 40px ${SANS}`, `400 40px ${SANS}`, `600 40px ${MONO}`].map((f) => document.fonts.load(f)));
  } catch { /* fall back to system fonts */ }
}

function canvas(ink) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = ink.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  return [c, ctx];
}

function text(ctx, value, x, y, font, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  return ctx.measureText(value).width;
}

function frame(ctx, url, ink) {
  const w = text(ctx, "polyglot", 80, 112, `600 40px ${MONO}`, ink.text);
  ctx.fillStyle = ink.caret;
  ctx.fillRect(80 + w + 6, 82, 18, 36);
  ctx.fillStyle = ink.rule;
  ctx.fillRect(80, H - 112, W - 160, 2);
  text(ctx, url.replace(/^https?:\/\//, "").replace(/\/$/, ""), 80, H - 64, `400 26px ${SANS}`, ink.muted);
}

export async function drawResultCard({ title, score, results, name, colorblind, url }) {
  await fontsReady();
  const [c, ctx] = canvas(PLUM);
  const palette = COLORS[colorblind ? "colorblind" : "normal"];
  frame(ctx, url, PLUM);
  text(ctx, title, 80, 210, `400 34px ${SANS}`, PLUM.muted);
  text(ctx, score, 80, 350, `600 128px ${SANS}`, PLUM.text);
  if (name) text(ctx, `@${name}`, 80, 430, `400 32px ${SANS}`, PLUM.text);

  // The coloured grid, one row per guess.
  const cell = 52, gap = 10;
  const gridW = TRAIT_KEYS.length * cell + (TRAIT_KEYS.length - 1) * gap;
  const x0 = W - 80 - gridW, y0 = 150;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < TRAIT_KEYS.length; col++) {
      const r = results[row];
      ctx.fillStyle = r ? palette[r[TRAIT_KEYS[col]]] : PLUM.empty;
      ctx.beginPath();
      ctx.roundRect(x0 + col * (cell + gap), y0 + row * (cell + gap), cell, cell, 6);
      ctx.fill();
    }
  }
  return c;
}

// The last Wrapped slide: a few headline numbers.
export async function drawWrappedCard({ year, name, figures, personality, url }) {
  await fontsReady();
  const [c, ctx] = canvas(LEAD);
  frame(ctx, url, LEAD);
  text(ctx, `Wrapped ${year}${name ? ` · @${name}` : ""}`, 80, 196, `400 32px ${SANS}`, LEAD.muted);
  if (personality) text(ctx, personality, 80, 276, `600 64px ${SANS}`, LEAD.text);
  const colW = (W - 160) / figures.length;
  figures.forEach(([value, label], i) => {
    const x = 80 + i * colW;
    text(ctx, String(value), x, 410, `600 72px ${SANS}`, LEAD.text);
    text(ctx, label, x, 452, `400 26px ${SANS}`, LEAD.muted);
  });
  return c;
}

export function canvasToFile(canvas, filename) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(new File([blob], filename, { type: "image/png" })), "image/png"));
}
