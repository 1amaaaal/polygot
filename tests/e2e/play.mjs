// End-to-end test: plays a full daily game in a real browser.
//   npm install --no-save playwright && npx playwright install chromium
//   npm start            (in another terminal; serves on port 8000)
//   node tests/e2e/play.mjs [base-url] [screenshot-dir]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:8000/";
const SHOTS = process.argv[3];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const step = (name) => console.log("✓", name);
const visibleLines = () => page.locator("#code .line:not(.hidden)").count();
const rows = () => page.locator("#board .row-cells:not([aria-hidden])").count();

await page.goto(BASE);
await page.waitForSelector("#code .line");
assert.ok(await page.locator("#help-dialog").evaluate((d) => d.open), "help opens on first visit");
if (SHOTS) await page.screenshot({ path: `${SHOTS}/help.png` });
await page.keyboard.press("Escape");
step("first visit shows the help dialog");

assert.equal(await visibleLines(), 3);
step("starts with 3 visible lines");

const { answer, names } = await page.evaluate(async () => {
  const g = await import(new URL("src/game.js", location.href));
  const { LANGUAGES } = await import(new URL("data/languages.js", location.href));
  const s = g.parseSnippets(await (await fetch("data/snippets.txt")).text());
  return { answer: s[g.dailySnippetIndex(g.dayNumber(), s)].language, names: LANGUAGES.map((l) => l.name) };
});
const wrong = names.filter((n) => n !== answer && n.length > 3)[0];

await page.fill("#guess-input", wrong.slice(0, 3));
await page.waitForSelector("#suggestions:not([hidden]) li");
const first = await page.locator("#suggestions li").first().textContent();
await page.keyboard.press("Enter");
assert.equal(await rows(), 1);
assert.ok(first.startsWith(await page.locator("#board .cell.name").first().textContent()));
assert.equal(await visibleLines(), 5);
step(`a wrong guess (${wrong}) adds a row and reveals 2 more lines`);

await page.fill("#guess-input", "Klingon");
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#toast").textContent === "Not in the language list");
await page.fill("#guess-input", wrong);
await page.keyboard.press("Enter");
await page.waitForFunction(() => document.querySelector("#toast").textContent.startsWith("You already guessed"));
assert.equal(await rows(), 1);
step("unknown and repeated guesses are rejected");

if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/playing.png`, fullPage: true }); }
await page.fill("#guess-input", answer);
await page.keyboard.press("Enter");
await page.waitForSelector("#result:not([hidden])");
assert.match(await page.textContent("#result-title"), new RegExp(answer.replace(/[+#.]/g, "\\$&")));
assert.equal(await page.locator("#code .line.hidden").count(), 0);
await page.waitForFunction(() => document.querySelector("#stats-dialog").open);
assert.match(await page.textContent("#stat-grid"), /^1Played100Win %1Streak1Best streak$/);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/stats.png` });
await page.keyboard.press("Escape");
step(`the right guess (${answer}) wins, reveals everything and records stats`);

await page.click("#share-btn");
const shared = await page.evaluate(() => navigator.clipboard.readText());
assert.match(shared, /^Polyglot #\d+ 2\/6\n\n[⬛🟨🟩]{5}\n🟩{5}\n\nhttp/u);
assert.ok(!shared.includes(answer), "share text is spoiler-free");
step("share copies a spoiler-free result");
if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/won.png`, fullPage: true }); }

await page.reload();
await page.waitForSelector("#result:not([hidden])");
assert.equal(await rows(), 2);
assert.equal(await page.locator("#help-dialog").evaluate((d) => d.open), false);
step("progress survives a reload, and help isn't shown again");

await page.click("#mode-practice");
assert.equal(await rows(), 0);
assert.equal(await page.locator("#guess-input").isDisabled(), false);
await page.click("#mode-daily");
assert.equal(await rows(), 2);
step("practice mode is separate from the daily game");

await page.click("#settings-btn");
await page.check("#colorblind-toggle");
assert.ok(await page.evaluate(() => document.body.classList.contains("colorblind")));
await page.keyboard.press("Escape");
step("colour-blind mode can be switched on");

const mobile = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
mobile.on("pageerror", (e) => errors.push(e.message));
await mobile.goto(BASE);
await mobile.waitForSelector("#code .line");
await mobile.keyboard.press("Escape");
await mobile.fill("#guess-input", wrong);
await mobile.keyboard.press("Enter");
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px on mobile`);
if (SHOTS) { await mobile.waitForTimeout(800); await mobile.screenshot({ path: `${SHOTS}/mobile.png`, fullPage: true }); }
step("mobile layout has no sideways scrolling");

if (SHOTS) {
  const dark = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  await dark.goto(BASE);
  await dark.waitForSelector("#code .line");
  await dark.waitForTimeout(300);
  await dark.screenshot({ path: `${SHOTS}/dark-help.png` });
  await dark.keyboard.press("Escape");
  await dark.fill("#guess-input", wrong);
  await dark.keyboard.press("Enter");
  await dark.waitForTimeout(800);
  await dark.screenshot({ path: `${SHOTS}/dark.png`, fullPage: true });
}

assert.deepEqual(errors, [], "no console errors");
step("no console errors");
await browser.close();
console.log("\nAll end-to-end checks passed.");
