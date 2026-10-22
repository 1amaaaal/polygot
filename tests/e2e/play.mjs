// End-to-end test: walks through the whole site in a real browser.
//   npm install --no-save playwright && npx playwright install chromium
//   npm start            (in another terminal; serves on port 8000)
//   node tests/e2e/play.mjs [base-url] [screenshot-dir]
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { chromium } from "playwright";
import { fakeServer } from "./fake-server.mjs";

const BASE = process.argv[2] ?? "http://localhost:8000/";
const SHOTS = process.argv[3];
const PAGES = ["index.html", "play.html", "arcade.html", "speed.html", "leaderboard.html", "profile.html",
               "wrapped.html", "languages.html", "help.html"];
const browser = await chromium.launch();
const server = fakeServer();
const errors = [];
const step = (name) => console.log("ok -", name);
const url = (path) => new URL(path, BASE).href;
const shot = async (page, name, opts = {}) => {
  if (!SHOTS) return;
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, ...opts });
};

async function newPage({ reachable = true, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await server.attach(context, { reachable });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(BASE).origin });
  // Lets a test move the speed-run clock forward.
  await context.addInitScript(() => {
    const now = performance.now.bind(performance);
    globalThis.__skew = 0;
    performance.now = () => now() + globalThis.__skew;
  });
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
// The language of whatever snippet is on screen, found by its first line.
const onScreen = (page) => page.evaluate(async () => {
  const g = await import(new URL("src/game.js", location.href));
  const s = g.parseSnippets(await (await fetch("data/snippets.txt")).text());
  const lines = [...document.querySelectorAll("#code .line")];
  return s.find((x) => x.lines.length === lines.length && x.lines[0] === lines[0].textContent)?.language;
});
const guess = async (page, name) => {
  await page.fill("#guess-input", name);
  await page.keyboard.press("Enter");
};
const toastText = (page, text) => page.waitForFunction(
  (t) => document.querySelector(".toast")?.textContent.startsWith(t), text);
// A rejected guess is explained under the field, and what was typed stays.
const fieldError = (page, text) => page.waitForFunction(
  (t) => document.querySelector("#guess-error")?.textContent.startsWith(t) &&
         document.querySelector("#guess-input").getAttribute("aria-invalid") === "true", text);
const rows = (page) => page.locator("#board .row-cells:not([aria-hidden])").count();
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("polyglot-v1")));
const action = (page, text) => page.click(`#result-actions button:has-text("${text}")`);
const until = async (check, what) => {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(check(), what);
};

// ---------- home and profile ----------
const page = await newPage();
await page.goto(BASE);
await page.waitForSelector("#teaser-code .line");
assert.deepEqual(await page.locator(".nav a").allTextContents(), ["Today", "Arcade", "Leaderboard", "Profile"]);
assert.match(await page.textContent("#play-cta"), /^Play puzzle #\d+$/);
step("home page has four sections and a play button");
await shot(page, "home");

await page.click('.nav a[href="profile.html"]');
await page.click(".signin");
await page.waitForSelector(".profile-head h1 a");
await toastText(page, "Signed in as @octocat");
assert.equal(await page.textContent(".profile-head h1"), "@octocat");
assert.equal(new URL(page.url()).search, "", "the sign-in code is removed from the address");
assert.equal(await page.locator(".badge.unlocked").count(), 0);
step("signing in with GitHub shows the player's name");

// ---------- daily game ----------
await page.click('.nav a[href="play.html"]');
await page.waitForSelector("#code .line");
assert.ok(await page.locator("#help-dialog").evaluate((d) => d.open), "help opens on first visit");
await page.keyboard.press("Escape");
const f = await facts(page);
const wrong = f.names.find((n) => n !== f.answer && n.length > 3);

assert.equal(await page.textContent("#mode-kicker"), "Daily puzzle");
assert.equal(await page.locator("#code .line:not(.hidden)").count(), 3);
await page.fill("#guess-input", wrong.slice(0, 3));
await page.waitForSelector("#suggestions:not([hidden]) li");
await page.keyboard.press("Enter");
assert.equal(await rows(page), 1);
assert.equal(await page.locator("#code .line:not(.hidden)").count(), 5);
await guess(page, "Klingon");
await fieldError(page, "Not in the language list");
assert.equal(await page.inputValue("#guess-input"), "Klingon", "the typing is kept so it can be fixed");
await page.type("#guess-input", "s");
assert.equal(await page.textContent("#guess-error"), "", "editing clears the error");
await guess(page, wrong);
await fieldError(page, "You already guessed");
step("guesses reveal lines; unknown and repeated guesses are rejected");

await page.click("#settings-btn");
await page.click("#hard-toggle");
await toastText(page, "Finish today's puzzle before switching hard mode");
assert.equal(await page.isChecked("#hard-toggle"), false);
await page.keyboard.press("Escape");
step("hard mode can't be switched on halfway through a daily puzzle");

await guess(page, f.answer);
await page.waitForSelector("#result:not([hidden])");
assert.equal(await page.textContent("#about-title"), `About ${f.answer}`);
assert.match(await page.getAttribute("#about-report", "href"), /^https:\/\/github\.com\/1amaaaal\/polygot\/issues\/new\?title=Fact\+check/);
assert.equal(await page.locator(".confetti span").count(), 28, "confetti on a win");
await page.waitForFunction(() => document.querySelector("#stats-dialog").open);
await page.keyboard.press("Escape");
await toastText(page, "Badge unlocked: Hello, World");
step(`winning (${f.answer}) shows confetti, facts, stats and the first badge`);
await shot(page, "play-won");

await action(page, "Copy result");
const text = await page.evaluate(() => navigator.clipboard.readText());
assert.match(text, /^Polyglot #\d+ 2\/6\n\n[⬛🟨🟩]{5}\n🟩{5}\n\nhttp/u);
assert.ok(!text.includes(f.answer));
const download = page.waitForEvent("download");
await action(page, "Share image");
const file = await download;
assert.match(file.suggestedFilename(), /^polyglot-\d+\.png$/);
assert.ok(statSync(await file.path()).size > 10_000, "share image has content");
if (SHOTS) await file.saveAs(`${SHOTS}/share-card.png`);
await action(page, "Challenge a friend");
assert.match(await page.evaluate(() => navigator.clipboard.readText()), /beat my 2\/6[\s\S]*play\.html\?c=[A-Za-z0-9_-]+$/);
step("sharing: text result, image card and a challenge link");

await page.click('.nav a[href="leaderboard.html"]');
await page.waitForSelector("#standings tr");
assert.equal(await page.locator("#standings tr").count(), 10);
assert.equal(await page.locator("#standings .tag").count(), 8, "every bot is labelled");
assert.match(await page.textContent("#standings tr.me"), /@octocat\s*5\s*1/);
assert.match(await page.textContent("#standings tr:has-text('@torvalds')"), /^\d+@torvalds61$/, "a real player, not a bot");
assert.ok(await page.isHidden("#name-note"));
assert.ok(await page.isHidden("#offline-note"));
await until(() => server.db.daily.some((r) => r.user === "octocat" && r.guesses === 2), "the result reached the server");
step("the result is sent to the server; the board has real players, labelled bots and @octocat with 5 points");

// ---------- endless ----------
await page.goto(url("arcade.html"));
await page.click('.mode a.btn[href="play.html?mode=endless"]');
await page.waitForSelector("#code .line");
assert.equal(await page.textContent("#mode-kicker"), "Endless");
assert.equal(await page.textContent("#run-pill"), "0 in a row");
for (let i = 1; i <= 2; i++) {
  const answer = await onScreen(page);
  assert.ok(answer, "the snippet on screen is a known snippet");
  await guess(page, answer);
  await page.waitForSelector("#result:not([hidden])");
  assert.equal(await page.textContent("#run-pill"), `${i} in a row`);
  await action(page, "Next snippet");
  await page.waitForSelector("#result[hidden]", { state: "attached" });
}
const miss = await onScreen(page);
for (const name of f.names.filter((n) => n !== miss).slice(0, 6)) await guess(page, name);
await page.waitForSelector("#result:not([hidden])");
assert.match(await page.textContent("#result-line"), /^Run over: 2 in a row\. A new personal best\. You're #\d of 9 on this week's board\.$/);
assert.deepEqual((await saved(page)).endless.runs.map((r) => r.score), [2]);
step("endless mode counts a run of 2, ends on a miss and shows the weekly rank");
await shot(page, "endless-over");

// ---------- speed run ----------
await page.goto(url("speed.html"));
await page.click("#start-btn");
await page.waitForSelector("#code .line");
for (let i = 0; i < 3; i++) await guess(page, await onScreen(page));
assert.equal(await page.textContent("#score-pill"), "3 solved");
const current = await onScreen(page);
const before = Number(await page.textContent("#timer-text"));
await guess(page, f.names.find((n) => n !== current));
await page.waitForFunction((t) => Number(document.querySelector("#timer-text").textContent) <= t - 3, before);
await page.click("#skip-btn");
await page.evaluate(() => { globalThis.__skew = 61_000; });
await page.waitForSelector("#done:not([hidden])");
assert.equal(await page.textContent("#done-title"), "3 languages in 60 seconds.");
assert.match(await page.textContent("#done-line"), /^A new personal best\. You're #\d of 9 on this week's board\.$/);
assert.equal(await page.locator("#run-log li.solved").count(), 3);
step("a speed run scores 3, takes 3 seconds off for a wrong guess and shows the weekly rank");
await shot(page, "speed-done");

await page.click('#done a[href="leaderboard.html#speed"]');
await page.waitForSelector("#standings tr.me");
assert.equal(await page.getAttribute("#tab-speed", "aria-selected"), "true");
assert.match(await page.textContent("#standings tr.me"), /@octocat\s*3/);
await page.click("#tab-endless");
await page.waitForSelector("#board-panel:not([aria-busy])");
assert.match(await page.textContent("#standings tr.me"), /@octocat\s*2/);
await until(() => server.db.runs.some((r) => r.kind === "speed" && r.score === 3), "the speed run reached the server");
await until(() => server.db.runs.some((r) => r.kind === "endless" && r.score === 2), "the endless run reached the server");
step("the speed run and endless boards list the player's weekly best, and both runs reach the server");

await page.goto(url("arcade.html"));
assert.match(await page.textContent(".mode:has-text('Speed run') .mode-stat"), /^Best 3 solved · #\d this week$/);
await shot(page, "arcade");

// ---------- profile, badges, wrapped ----------
await page.goto(url("profile.html"));
await page.waitForSelector(".badge");
assert.ok(await page.locator(".badge.unlocked").count() >= 1);
assert.match(await page.textContent("#badge-summary"), /^\d+ of 18 unlocked$/);
assert.ok(await page.locator(".tile.got").count() >= 4, "solved languages are collected");
assert.equal(await page.textContent("#arcade-stats"), "Speed run best: 3 · Endless best: 2 in a row");
await page.click(".more");
assert.equal(await page.locator(".badge").count(), 18);
step("the profile shows stats, unlocked badges and the collection");
await shot(page, "profile");

await page.click("#wrapped-link");
await page.waitForSelector("#slide-big");
assert.match(await page.textContent("#slide-kicker"), /^Polyglot Wrapped \d{4}$/);
while (await page.isVisible("#next-btn")) await page.click("#next-btn");
assert.match(await page.textContent("#slide-big"), /^\d+ badges$/);
await page.waitForSelector("#wrapped-actions:not([hidden])");
const wrapped = page.waitForEvent("download");
await page.click("#share-btn");
assert.match((await wrapped).suggestedFilename(), /^polyglot-wrapped-\d{4}\.png$/);
step("Wrapped steps through its slides and makes a share image");
await shot(page, "wrapped");

// ---------- a second device ----------
await until(() => server.db.saves.octocat?.endless?.runs.length, "progress is saved to the server");
const laptop = await newPage();
await laptop.goto(url("profile.html"));
await laptop.click(".signin");
await laptop.waitForSelector(".profile-head h1 a");
assert.ok(await laptop.locator(".tile.got").count() >= 4, "the collection came from the other device");
assert.equal(await laptop.textContent("#arcade-stats"), "Speed run best: 3 · Endless best: 2 in a row");
assert.equal(await laptop.textContent("#stats div:first-child b"), "1", "daily stats came too");
await laptop.click(".profile-head button:has-text('Sign out')");
await toastText(laptop, "Signed out");
await laptop.waitForSelector(".signin");
step("signing in on a second device brings the progress across, and signing out works");

// ---------- server down ----------
const down = await newPage({ reachable: false });
await down.goto(url("leaderboard.html"));
await down.waitForSelector("#standings tr");
assert.equal(await down.locator("#standings tr").count(), 9);
assert.ok(await down.isVisible("#offline-note"));
assert.ok(await down.isVisible("#name-note"));
assert.match(await down.textContent("#standings tr.me"), /you/);
step("without the server, the board falls back to you and the bots");

// ---------- other pages ----------
await page.goto(url("languages.html"));
await page.waitForSelector(".lang");
assert.equal(await page.locator(".lang").count(), 35);
await page.fill("#lang-search", "monty python");
assert.equal(await page.locator(".lang").count(), 1);
assert.equal(await page.textContent(".lang h2"), "Python");
step("languages page lists all 35 and search works");

await page.goto(url("collection.html"));
await page.waitForURL(/profile\.html#collection$/);
await page.goto(url("index.html"));
assert.equal(await page.textContent("#play-cta"), "See today's result");
step("old links redirect, and home knows today's puzzle is done");

// ---------- challenge from a friend (fresh visitor) ----------
const friend = await newPage({ colorScheme: "dark" });
await friend.goto(url(`play.html?c=${f.challenge}`));
await friend.waitForSelector("#challenge-banner:not([hidden])");
await friend.keyboard.press("Escape");
assert.match(await friend.textContent("#challenge-banner"), /@octocat solved this in 4\/6/);
assert.equal(await friend.textContent("#mode-title"), "From @octocat");
await guess(friend, f.otherAnswer);
await friend.waitForSelector("#result-line:not([hidden])");
assert.match(await friend.textContent("#result-line"), /You beat @octocat: 1 guess to their 4 guesses\./);
const friendData = await saved(friend);
assert.equal(friendData.stats.played, 0, "challenges don't count as daily plays");
assert.ok(friendData.badges.rival, "beating a challenge unlocks Rival");
step(`a challenge link plays the friend's snippet (${f.otherAnswer}) and compares scores`);
await shot(friend, "challenge-dark");

await friend.goto(url("play.html?c=broken!!"));
await toastText(friend, "That challenge link looks broken");
step("broken challenge links fall back to the daily puzzle");

// ---------- hard mode (fresh visitor) ----------
const hard = await newPage();
await hard.goto(url("play.html"));
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
await fieldError(hard, "Hard mode:");
assert.equal(await rows(hard), 1);
await guess(hard, f.answer);
await hard.waitForSelector("#result:not([hidden])");
await hard.keyboard.press("Escape");
await action(hard, "Copy result");
assert.match(await hard.evaluate(() => navigator.clipboard.readText()), /2\/6\*/);
step(`hard mode removes colours, rejects ${banned} and marks the score with *`);

// ---------- archive (a visitor five days after launch) ----------
const later = await newPage();
await later.addInitScript(() => {
  const realNow = Date.now();
  const target = new Date(2026, 9, 23, 12).getTime();    // puzzle #6
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [RealDate.now() - realNow + target])); }
    static now() { return RealDate.now() - realNow + target; }
  };
});
await later.goto(url("archive.html"));
await later.waitForURL(/arcade\.html#archive$/);
await later.waitForSelector(".archive-row");
assert.equal(await later.locator(".archive-row").count(), 5);
assert.match(await later.textContent(".archive-row"), /#5/);
await later.click('.archive-row:has-text("#3") a');
await later.waitForSelector("#code .line");
await later.keyboard.press("Escape");
assert.equal(await later.textContent("#mode-kicker"), "From the archive");
assert.match(await later.textContent("#mode-title"), /^#3 · /);
const archiveAnswer = await later.evaluate(async () => {
  const g = await import(new URL("src/game.js", location.href));
  const s = g.parseSnippets(await (await fetch("data/snippets.txt")).text());
  return s[g.dailySnippetIndex(2, s)].language;
});
await guess(later, archiveAnswer);
await later.waitForSelector("#result:not([hidden])");
assert.match(await later.textContent("#next-puzzle"), /doesn't count towards your daily stats/);
await later.goto(url("arcade.html"));
await later.waitForSelector(".archive-row.played");
assert.match(await later.textContent(".archive-row.played"),
             new RegExp(`#3.*Solved 1/6 · ${archiveAnswer.replace(/[+#.]/g, "\\$&")}.*Replay`));
const archived = await saved(later);
assert.equal(archived.stats.played, 0, "archive games don't count as daily plays");
assert.deepEqual(archived.archive, { 2: 1 });
await later.goto(url("play.html?day=99"));
await toastText(later, "That puzzle isn't available yet");
step(`the archive lists past puzzles, replays #3 (${archiveAnswer}) and leaves daily stats alone`);

// ---------- mobile ----------
const mobile = await newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
for (const p of [...PAGES, "play.html?mode=endless"]) {
  await mobile.goto(url(p));
  await mobile.waitForLoadState("networkidle");
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 0, `${p} scrolls sideways by ${overflow}px on mobile`);
}
await mobile.goto(url("play.html"));
await mobile.keyboard.press("Escape");
await shot(mobile, "mobile-play");
step("no page scrolls sideways on mobile");

// ---------- offline ----------
const off = await newPage();
await off.goto(url("index.html"));
await off.evaluate(() => navigator.serviceWorker.ready);
await off.reload();
await off.context().setOffline(true);
for (const p of ["play.html", "speed.html", "profile.html"]) {
  await off.goto(url(p));
  await off.waitForSelector(".topbar");
}
step("the site works offline after the first visit");

assert.deepEqual(errors, [], "no console errors");
step("no console errors");
await browser.close();
console.log("\nAll end-to-end checks passed.");
