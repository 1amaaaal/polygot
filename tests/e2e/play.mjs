// End-to-end test: walks through the whole site in a real browser.
//   npm install --no-save playwright && npx playwright install chromium
//   npm start            (in another terminal; serves on port 8000)
//   node tests/e2e/play.mjs [base-url] [screenshot-dir]
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "http://localhost:8000/";
const SHOTS = process.argv[3];
const browser = await chromium.launch();
const errors = [];
const step = (name) => console.log("✓", name);
const shot = async (page, name, opts = {}) => {
  if (!SHOTS) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, ...opts });
};

async function newPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    // Avatars come from github.com, which may be unreachable in a sandbox.
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return page;
}

// Helpers that read the game's own logic, so the test knows the answers.
const facts = (page) => page.evaluate(async () => {
  const g = await import(new URL("src/game.js", location.href));
  const { LANGUAGES } = await import(new URL("data/languages.js", location.href));
  const s = g.parseSnippets(await (await fetch("data/snippets.txt")).text());
  const daily = g.dailySnippetIndex(g.dayNumber(), s);
  const other = s.findIndex((x, i) => i !== daily && x.language !== s[daily].language);
  return { names: LANGUAGES.map((l) => l.name), daily, answer: s[daily].language, other, otherAnswer: s[other].language,
           challenge: g.encodeChallenge({ index: other, name: "octocat", guesses: 4, won: true }) };
});
const guess = async (page, name) => {
  await page.fill("#guess-input", name);
  await page.keyboard.press("Enter");
};
const toastText = (page, text) => page.waitForFunction(
  (t) => document.querySelector(".toast")?.textContent.startsWith(t), text);
const rows = (page) => page.locator("#board .row-cells:not([aria-hidden])").count();

// ---------- home ----------
const page = await newPage();
await page.goto(BASE);
await page.waitForSelector(".board-list li");
assert.equal(await page.locator(".nav a").count(), 5);
assert.match(await page.textContent("#play-cta"), /Play today's puzzle #\d+/);
assert.equal(await page.locator(".board-list li").count(), 9);
assert.equal(await page.locator(".board-list .tag").count(), 8, "every bot is labelled");
step("home page has navigation, a play button and a leaderboard of 8 labelled bots + you");

await page.fill(".profile-form input", "not a name!");
await page.keyboard.press("Enter");
await toastText(page, "That doesn't look like a GitHub username");
await page.fill(".profile-form input", "@octocat");
await page.keyboard.press("Enter");
await page.waitForSelector(".handle");
assert.equal(await page.textContent(".handle"), "@octocat");
assert.match(await page.textContent(".board-list li.me"), /@octocat/);
step("a GitHub username is validated, saved and shown on the leaderboard");
await shot(page, "home");

// ---------- daily game ----------
await page.click('.nav a[href="play.html"]');
await page.waitForSelector("#code .line");
assert.ok(await page.locator("#help-dialog").evaluate((d) => d.open), "help opens on first visit");
await page.keyboard.press("Escape");
const f = await facts(page);
const wrong = f.names.find((n) => n !== f.answer && n.length > 3);

assert.equal(await page.locator("#code .line:not(.hidden)").count(), 3);
await page.fill("#guess-input", wrong.slice(0, 3));
await page.waitForSelector("#suggestions:not([hidden]) li");
await page.keyboard.press("Enter");
assert.equal(await rows(page), 1);
assert.equal(await page.locator("#code .line:not(.hidden)").count(), 5);
await guess(page, "Klingon");
await toastText(page, "Not in the language list");
await guess(page, wrong);
await toastText(page, "You already guessed");
step("guesses reveal lines; unknown and repeated guesses are rejected");

await page.click("#settings-btn");
await page.click("#hard-toggle");
await toastText(page, "Finish today's puzzle before switching hard mode");
assert.equal(await page.isChecked("#hard-toggle"), false);
await page.keyboard.press("Escape");
step("hard mode can't be switched on halfway through a daily puzzle");

await guess(page, f.answer);
await page.waitForSelector("#result:not([hidden])");
await page.waitForSelector("#learn:not([hidden])");
assert.equal(await page.textContent("#learn-title"), `About ${f.answer}`);
await page.waitForFunction(() => document.querySelector("#stats-dialog").open);
await page.keyboard.press("Escape");
assert.match(await page.textContent(".board-list li.me .pts"), /^[1-6]$/);
step(`winning (${f.answer}) shows facts, stats, and updates the leaderboard`);
await shot(page, "play-won");

await page.click("#share-btn");
const text = await page.evaluate(() => navigator.clipboard.readText());
assert.match(text, /^Polyglot #\d+ 2\/6\n\n[⬛🟨🟩]{5}\n🟩{5}\n\nhttp/u);
assert.ok(!text.includes(f.answer));
const download = page.waitForEvent("download");
await page.click("#share-image-btn");
const file = await download;
assert.match(file.suggestedFilename(), /^polyglot-\d+\.png$/);
const imgPath = await file.path();
const { statSync } = await import("node:fs");
assert.ok(statSync(imgPath).size > 10_000, "share image has content");
if (SHOTS) await file.saveAs(`${SHOTS}/share-card.png`);
await page.click("#challenge-btn");
const link = await page.evaluate(() => navigator.clipboard.readText());
assert.match(link, /beat my 2\/6[\s\S]*play\.html\?c=[A-Za-z0-9_-]+$/);
step("sharing: text result, image card and a challenge link");

// ---------- pages ----------
await page.click('.nav a[href="collection.html"]');
await page.waitForSelector(".tile");
assert.equal(await page.locator(".tile").count(), 35);
assert.equal(await page.locator(".tile.got").count(), 1);
step("collection page shows 1 of 35 languages collected");
await shot(page, "collection");

await page.click('.nav a[href="languages.html"]');
await page.waitForSelector(".lang");
assert.equal(await page.locator(".lang").count(), 35);
await page.fill("#lang-search", "monty python");
assert.equal(await page.locator(".lang").count(), 1);
assert.equal(await page.textContent(".lang h2"), "Python");
step("languages page lists all 35 and search works");
await page.fill("#lang-search", "");
await shot(page, "languages");

await page.click('.nav a[href="help.html"]');
await page.waitForSelector("#hard");
await page.click('.nav a[href="index.html"]');
await page.waitForSelector("#play-cta");
assert.match(await page.textContent("#play-cta"), /See today's result/);
step("help page loads, and home knows today's puzzle is done");

// ---------- challenge from a friend (fresh visitor) ----------
const friend = await newPage({ colorScheme: "dark" });
await friend.goto(new URL(`play.html?c=${f.challenge}`, BASE).href);
await friend.waitForSelector("#challenge-banner:not([hidden])");
await friend.keyboard.press("Escape");
assert.match(await friend.textContent("#challenge-banner"), /@octocat solved this one in 4\/6/);
assert.equal(await friend.isVisible("#mode-challenge"), true);
await guess(friend, f.otherAnswer);
await friend.waitForSelector("#versus:not([hidden])");
assert.match(await friend.textContent("#versus"), /You beat @octocat: 1\/6 vs 4\/6/);
assert.match(await friend.textContent(".board-list li.me .pts"), /^0$/, "challenges don't score daily points");
step(`a challenge link plays the friend's snippet (${f.otherAnswer}) and compares scores`);
await shot(friend, "challenge-dark");

await friend.goto(new URL("play.html?c=broken!!", BASE).href);
await toastText(friend, "That challenge link looks broken");
step("broken challenge links fall back to the daily puzzle");

// ---------- hard mode (fresh visitor) ----------
const hard = await newPage();
await hard.goto(new URL("play.html", BASE).href);
await hard.waitForSelector("#code .line");
await hard.keyboard.press("Escape");
await hard.click("#settings-btn");
await hard.check("#hard-toggle");
await hard.keyboard.press("Escape");
await hard.waitForSelector("#hard-badge:not([hidden])");
assert.equal(await hard.locator("#code [class^=tok-]").count(), 0, "no syntax colours in hard mode");
await guess(hard, wrong);
const banned = await hard.evaluate(async ([wrongName, answer]) => {
  const g = await import(new URL("src/game.js", location.href));
  const { LANGUAGES } = await import(new URL("data/languages.js", location.href));
  const by = Object.fromEntries(LANGUAGES.map((l) => [l.name, l]));
  const history = [{ guess: by[wrongName], result: g.compare(by[wrongName], by[answer]) }];
  return LANGUAGES.find((l) => l.name !== wrongName && g.hardModeViolation(l, history))?.name;
}, [wrong, f.answer]);
await guess(hard, banned);
await toastText(hard, "Hard mode:");
assert.equal(await rows(hard), 1);
await guess(hard, f.answer);
await hard.waitForSelector("#result:not([hidden])");
await hard.keyboard.press("Escape");
await hard.click("#share-btn");
assert.match(await hard.evaluate(() => navigator.clipboard.readText()), /2\/6\*/);
step(`hard mode removes colours, rejects ${banned} and marks the score with *`);

// ---------- mobile ----------
const mobile = await newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
for (const p of ["index.html", "play.html", "collection.html", "languages.html", "help.html"]) {
  await mobile.goto(new URL(p, BASE).href);
  await mobile.waitForLoadState("networkidle");
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `${p} scrolls sideways by ${overflow}px on mobile`);
}
await mobile.goto(new URL("index.html", BASE).href);
await shot(mobile, "mobile-home");
step("no page scrolls sideways on mobile");

// ---------- offline ----------
const off = await newPage();
await off.goto(new URL("index.html", BASE).href);
await off.evaluate(() => navigator.serviceWorker.ready);
await off.reload();
await off.context().setOffline(true);
await off.goto(new URL("play.html", BASE).href);
await off.waitForSelector("#code .line");
step("the site works offline after the first visit");

assert.deepEqual(errors, [], "no console errors");
step("no console errors");
await browser.close();
console.log("\nAll end-to-end checks passed.");
