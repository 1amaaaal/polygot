// The connection to the Polyglot server (a Supabase project): signing in
// with GitHub, sending results and reading the boards. Plain fetch calls,
// no library, so the site keeps working without a build step, and every call
// fails quietly when the player is offline.
//
// The publishable key is meant to be public: what each visitor may read and
// write is enforced by the database itself (see supabase/schema.sql).

export const SERVER_URL = "https://inpqowhhemfggcdudvsi.supabase.co";
const KEY = "sb_publishable_6-v8Hc5pVJzYgNGiOmxYTg_ia1GhPsQ";
const SESSION_KEY = "polyglot-session";
const VERIFIER_KEY = "polyglot-pkce";
const TIMEOUT = 8000;

// ---------- session ----------
function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function writeSession(session) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
}

// Keep only what the site needs from Supabase's token response.
function toSession(data) {
  const meta = data.user?.user_metadata ?? {};
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: { id: data.user.id, username: meta.user_name ?? meta.preferred_username ?? "", avatar: meta.avatar_url ?? "" },
  };
}

// The signed-in player ({ id, username, avatar }), or null.
export const currentUser = () => readSession()?.user ?? null;

async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = { apikey: KEY };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(SERVER_URL + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw Object.assign(new Error(data?.message ?? data?.msg ?? `HTTP ${res.status}`), { status: res.status });
  return data;
}

// A fresh access token, refreshing the session if it is about to expire.
// Signs the player out if the refresh token is no longer valid.
async function accessToken() {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt - 60 > Date.now() / 1000) return session.accessToken;
  try {
    const data = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: session.refreshToken } });
    const next = toSession(data);
    writeSession(next);
    return next.accessToken;
  } catch (err) {
    if (err.status === 400 || err.status === 401) writeSession(null);
    throw err;
  }
}

// ---------- signing in (OAuth with PKCE) ----------
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function signIn(returnTo = location.href) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const url = new URL(`${SERVER_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "github");
  url.searchParams.set("redirect_to", returnTo.split("#")[0]);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "s256");
  location.assign(url.href);
}

// Finishes a sign-in when GitHub sends the player back with ?code=...
// Returns the user, null if this page load isn't a sign-in, and throws if
// the sign-in failed.
export async function completeSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const error = params.get("error_description") ?? params.get("error");
  if (!code && !error) return null;
  for (const key of ["code", "error", "error_code", "error_description"]) params.delete(key);
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
  if (error) throw new Error(error);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!verifier) throw new Error("Sign-in expired, please try again");
  const data = await call("/auth/v1/token?grant_type=pkce", { method: "POST", body: { auth_code: code, code_verifier: verifier } });
  const session = toSession(data);
  writeSession(session);
  return session.user;
}

export async function signOut() {
  const token = readSession()?.accessToken;
  writeSession(null);
  if (token) await call("/auth/v1/logout", { method: "POST", token }).catch(() => {});
}

// ---------- results ----------
// Sending the same daily result twice is harmless: the first one stays.
export async function sendDaily({ day, guesses, hard }) {
  const token = await accessToken();
  await call("/rest/v1/daily_results", { method: "POST", token, prefer: "resolution=ignore-duplicates,return=minimal",
                                         body: { user_id: currentUser().id, day, guesses, hard } });
}

export async function sendRun({ kind, day, score }) {
  const token = await accessToken();
  await call("/rest/v1/arcade_runs", { method: "POST", token, prefer: "return=minimal",
                                       body: { user_id: currentUser().id, kind, day, score } });
}

// ---------- saved progress ----------
export async function loadSave() {
  const token = await accessToken();
  const rows = await call(`/rest/v1/saves?select=data&user_id=eq.${currentUser().id}`, { token });
  return rows[0]?.data ?? null;
}

export async function writeSave(data) {
  const token = await accessToken();
  await call("/rest/v1/saves", { method: "POST", token, prefer: "resolution=merge-duplicates,return=minimal",
                                 body: { user_id: currentUser().id, data, updated_at: new Date().toISOString() } });
}

// ---------- boards ----------
// This week's real players: [{ name, avatar, points, wins }] or [{ name, avatar, score }].
export async function fetchBoard(kind, today) {
  const rows = kind === "daily"
    ? await call("/rest/v1/rpc/daily_board", { method: "POST", body: { today } })
    : await call("/rest/v1/rpc/arcade_board", { method: "POST", body: { board: kind, today } });
  return rows.map((r) => ({ name: r.username, avatar: r.avatar_url, ...(kind === "daily"
    ? { points: Number(r.points), wins: Number(r.wins) }
    : { score: r.score }) }));
}
