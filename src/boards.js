// The rows for a weekly board: real players from the server, the player
// themselves, and bots to fill the board while there are only a few real
// players. Offline, it falls back to the bots and the player.

import { el } from "./layout.js";
import { arcadeStandings, playerWeek, standings, weeklyBest } from "./leaderboard.js";
import { currentUser, fetchBoard } from "./server.js";
import { store } from "./store.js";

// Below this many real players, the bots stay on the board.
const FILL_TO = 6;

const byPoints = (a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name);
const byScore = (a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name);

// The player's own numbers for the week, from this browser.
function mine(kind, today) {
  return kind === "daily" ? playerWeek(store.history, today) : { score: weeklyBest(store[kind].runs, today) };
}

function bots(kind, today) {
  const hour = new Date().getHours();
  const rows = kind === "daily" ? standings(null, today, hour) : arcadeStandings(kind, null, today, hour);
  return rows.map(({ rank, ...row }) => row);
}

// Returns { rows, live }: rows are ranked, `me` marks the player, `bot` the
// bots, and `live` says whether real players could be loaded.
export async function weeklyBoard(kind, today) {
  const user = currentUser();
  const local = mine(kind, today);
  let real = null;
  try {
    real = await fetchBoard(kind, today);
  } catch { /* offline or unreachable */ }

  const rows = (real ?? []).map((r) => ({ ...r, bot: false, me: Boolean(user && r.name === user.username) }));
  let me = rows.find((r) => r.me);
  if (me) {
    // The server may not have the latest result yet.
    if (kind === "daily") Object.assign(me, local.points > me.points ? local : {});
    else me.score = Math.max(me.score ?? 0, local.score ?? 0);
  } else {
    me = { name: user?.username ?? "you", avatar: user?.avatar ?? "", bot: false, me: true, guest: !user, ...local };
    rows.push(me);
  }
  if (!real || rows.length < FILL_TO) rows.push(...bots(kind, today));
  rows.sort(kind === "daily" ? byPoints : byScore);
  return { rows: rows.map((row, i) => ({ ...row, rank: i + 1 })), live: Boolean(real) };
}

// "You're #3 of 12 on this week's board." as a link to that board, or null
// if the player has no score on it this week.
export async function rankLink(kind, today) {
  const { rows } = await weeklyBoard(kind, today);
  const me = rows.find((r) => r.me);
  if (kind === "daily" ? !me.points : !me.score) return null;
  return el("a", { href: `leaderboard.html#${kind}`, text: `You're #${me.rank} of ${rows.length} on this week's board.` });
}
