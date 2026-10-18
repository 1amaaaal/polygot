// Draws a shareable result card (1200x630, the size social networks use for
// link previews) on a canvas, entirely in the browser.

import { TRAIT_KEYS } from "./game.js";

const COLORS = {
  normal: { hit: "#2ea043", close: "#bb8009", miss: "#3a414b" },
  colorblind: { hit: "#d4620b", close: "#1f6feb", miss: "#3a414b" },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function drawResultCard({ title, score, results, name, colorblind, url }) {
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const palette = COLORS[colorblind ? "colorblind" : "normal"];
  const mono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
  const sans = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d1117");
  bg.addColorStop(1, "#161b22");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Left: logo, title, score, name.
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 64px ${mono}`;
  ctx.fillStyle = "#e6edf3";
  ctx.fillText("Poly", 80, 140);
  const polyWidth = ctx.measureText("Poly").width;
  ctx.fillStyle = "#3fb950";
  ctx.fillText("glot", 80 + polyWidth, 140);

  ctx.font = `600 34px ${sans}`;
  ctx.fillStyle = "#8b949e";
  ctx.fillText(title, 80, 210);

  ctx.font = `800 120px ${sans}`;
  ctx.fillStyle = "#e6edf3";
  ctx.fillText(score, 80, 360);

  if (name) {
    ctx.font = `600 34px ${sans}`;
    ctx.fillStyle = "#e6edf3";
    ctx.fillText(`@${name}`, 80, 440);
  }
  ctx.font = `500 26px ${sans}`;
  ctx.fillStyle = "#8b949e";
  ctx.fillText("Guess the programming language", 80, 520);
  ctx.fillStyle = "#3fb950";
  ctx.fillText(url.replace(/^https?:\/\//, "").replace(/\/$/, ""), 80, 562);

  // Right: the coloured grid, one row per guess.
  const cell = 64, gap = 12;
  const gridW = TRAIT_KEYS.length * cell + (TRAIT_KEYS.length - 1) * gap;
  const gridH = 6 * cell + 5 * gap;
  const x0 = W - 80 - gridW, y0 = (H - gridH) / 2;
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < TRAIT_KEYS.length; col++) {
      const r = results[row];
      ctx.fillStyle = r ? palette[r[TRAIT_KEYS[col]]] : "rgba(255,255,255,0.06)";
      roundRect(ctx, x0 + col * (cell + gap), y0 + row * (cell + gap), cell, cell, 12);
    }
  }
  return canvas;
}

export function canvasToFile(canvas, filename) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(new File([blob], filename, { type: "image/png" })), "image/png"));
}
