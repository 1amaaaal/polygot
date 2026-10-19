// A stand-in for the Supabase project, so the end-to-end test can sign in,
// send results and read boards without a network. It answers the same
// requests src/server.js makes, from an in-memory database.

export const SERVER = "https://inpqowhhemfggcdudvsi.supabase.co";

const USERS = {
  octocat: { id: "11111111-1111-1111-1111-111111111111", user_metadata: { user_name: "octocat", avatar_url: `${SERVER}/avatar.png` } },
};

export function fakeServer() {
  const db = {
    daily: [{ user: "torvalds", day: 0, guesses: 1 }],   // another real player
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
      case "/rest/v1/daily_results": {
        const user = userOf(request);
        if (!user) return json(route, 401, { message: "not signed in" });
        if (!db.daily.some((r) => r.user === user && r.day === body.day)) db.daily.push({ user, day: body.day, guesses: body.guesses });
        return json(route, 201);
      }
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
