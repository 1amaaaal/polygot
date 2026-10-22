// A stand-in for the Supabase project, so the end-to-end test can sign in,
// send results and read boards without a network. It answers the same
// requests src/server.js makes, from an in-memory database.

import { readFileSync } from "node:fs";
import { LANGUAGES } from "../../data/languages.js";
import { MAX_GUESSES, dailySnippetIndex, dayNumber, parseSnippets, puzzleView } from "../../src/game.js";

export const SERVER = "https://inpqowhhemfggcdudvsi.supabase.co";

// The stand-in's daily puzzles are the ones the site used to pick from
// snippets.txt, so the test can work out each day's answer for itself.
const SNIPPETS = parseSnippets(readFileSync(new URL("../../data/snippets.txt", import.meta.url), "utf8"));
const byName = new Map(LANGUAGES.map((l) => [l.name, l]));

// The same rules as play_daily() in supabase/schema.sql (tested on a real
// Postgres by tests/db/schema.test.mjs). Returns [status, body].
function playDaily(db, user, { for_day: day, guessed = [], hard_mode: hard = false }) {
  const today = dayNumber();
  if (!Number.isInteger(day) || day < 0 || day > today + 1) return [400, { message: "That puzzle isn't available yet" }];
  const snippet = SNIPPETS[dailySnippetIndex(day, SNIPPETS)];
  if (guessed.length > MAX_GUESSES) return [400, { message: "A puzzle has at most 6 guesses" }];
  for (const [i, name] of guessed.entries()) {
    if (!byName.has(name)) return [400, { message: `Not in the language list: ${name}` }];
    if (guessed.slice(0, i).includes(name)) return [400, { message: `You already guessed ${name}` }];
    if (i > 0 && guessed[i - 1] === snippet.language) return [400, { message: "That puzzle is already solved" }];
  }
  let guesses = guessed;
  const tracked = Boolean(user) && day >= today - 1 && day <= today + 1;
  if (tracked) {
    const key = `${user}:${day}`;
    if (!db.plays[key] && guessed.length) db.plays[key] = { guesses: [], hard };
    const played = db.plays[key];
    if (played) {
      if (guessed.length > played.guesses.length && played.guesses.every((g, i) => guessed[i] === g)) {
        if (!played.guesses.length) played.hard = hard;
        played.guesses = guessed;
      }
      ({ guesses, hard } = played);
    }
  }
  const view = puzzleView(snippet.lines, byName.get(snippet.language), guesses.map((g) => byName.get(g)));
  if (tracked && view.done && !db.daily.some((r) => r.user === user && r.day === day)) {
    db.daily.push({ user, day, guesses: view.won ? guesses.length : 0 });
  }
  db.dailyCalls.push({ user, day, answer: view.answer });
  return [200, { ...view, hard }];
}

const USERS = {
  octocat: { id: "11111111-1111-1111-1111-111111111111", user_metadata: { user_name: "octocat", avatar_url: `${SERVER}/avatar.png` } },
};

export function fakeServer() {
  const db = {
    daily: [{ user: "torvalds", day: 0, guesses: 1 }],   // another real player
    plays: {},        // signed-in players' saved guesses, by "user:day"
    dailyCalls: [],   // every play_daily reply's answer, to check it stays hidden
    runs: [],
    saves: {},
    signIns: 0,
  };

  const json = (route, status, body) => route.fulfill({
    status, contentType: "application/json", body: body === undefined ? "" : JSON.stringify(body),
    headers: { "Access-Control-Allow-Origin": "*" },
  });
  const userOf = (request) => request.headers().authorization?.replace("Bearer tok-", "");

  async function handle(route) {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: {
        "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "apikey, authorization, content-type, prefer" } });
    }
    switch (url.pathname) {
      case "/avatar.png":
        return route.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
      case "/auth/v1/authorize": {
        // GitHub approves straight away and sends the player back with a code.
        const back = new URL(url.searchParams.get("redirect_to"));
        back.searchParams.set("code", `code-octocat-${url.searchParams.get("code_challenge")}`);
        return route.fulfill({ status: 302, headers: { Location: back.href } });
      }
      case "/auth/v1/token": {
        if (url.searchParams.get("grant_type") !== "pkce" || !body.code_verifier) return json(route, 400, { msg: "bad request" });
        db.signIns += 1;
        return json(route, 200, { access_token: "tok-octocat", refresh_token: "r", expires_in: 3600, user: USERS.octocat });
      }
      case "/auth/v1/logout":
        return json(route, 204);
      case "/rest/v1/daily_results":
        // Only play_daily() writes results now.
        return json(route, 403, { message: "permission denied for table daily_results" });
      case "/rest/v1/rpc/play_daily":
        return json(route, ...playDaily(db, userOf(request), body));
      case "/rest/v1/arcade_runs": {
        const user = userOf(request);
        if (!user) return json(route, 401, { message: "not signed in" });
        db.runs.push({ user, kind: body.kind, day: body.day, score: body.score });
        return json(route, 201);
      }
      case "/rest/v1/saves": {
        const user = userOf(request);
        if (!user) return json(route, 401, { message: "not signed in" });
        if (request.method() === "GET") return json(route, 200, db.saves[user] ? [{ data: db.saves[user] }] : []);
        db.saves[user] = body.data;
        return json(route, 201);
      }
      case "/rest/v1/rpc/daily_board": {
        const players = {};
        for (const r of db.daily.filter((r) => r.day <= body.today && r.day >= body.today - 6)) {
          players[r.user] ??= { username: r.user, avatar_url: null, points: 0, wins: 0 };
          if (r.guesses > 0) { players[r.user].points += 7 - r.guesses; players[r.user].wins += 1; }
        }
        return json(route, 200, Object.values(players));
      }
      case "/rest/v1/rpc/arcade_board": {
        const best = {};
        for (const r of db.runs.filter((r) => r.kind === body.board && r.day <= body.today && r.day >= body.today - 6)) {
          best[r.user] = Math.max(best[r.user] ?? 0, r.score);
        }
        return json(route, 200, Object.entries(best).map(([username, score]) => ({ username, avatar_url: null, score })));
      }
      default:
        return json(route, 404, { message: `no route for ${url.pathname}` });
    }
  }

  // `reachable: false` makes the server look down, to test the fallback.
  const attach = (context, { reachable = true } = {}) =>
    context.route(`${SERVER}/**`, (route) => (reachable ? handle(route) : route.abort("internetdisconnected")));

  return { db, attach };
}
