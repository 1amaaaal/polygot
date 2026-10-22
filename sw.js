// Offline support. Every file is cached on install; after that, pages load
// from the cache instantly and are refreshed from the network in the
// background ("stale while revalidate"). Bump CACHE when files are renamed
// or removed so old caches get cleaned up.

const CACHE = "polyglot-v6";
const ASSETS = [
  "./", "index.html", "play.html", "arcade.html", "speed.html", "leaderboard.html", "profile.html",
  "wrapped.html", "languages.html", "help.html", "archive.html", "collection.html",
  "style.css", "manifest.webmanifest",
  "data/languages.js", "data/snippets.txt",
  "src/achievements.js", "src/arcade.js", "src/boards.js", "src/game.js", "src/help.js", "src/highlight.js", "src/home.js",
  "src/languages-page.js", "src/layout.js", "src/leaderboard-page.js", "src/leaderboard.js", "src/merge.js",
  "src/play.js", "src/profile.js", "src/server.js", "src/share-image.js", "src/speed.js", "src/store.js",
  "src/sync.js", "src/ui.js", "src/wrapped-page.js", "src/wrapped.js",
  "fonts/plex-sans-400.woff2", "fonts/plex-sans-500.woff2", "fonts/plex-sans-600.woff2",
  "fonts/plex-mono-400.woff2", "fonts/plex-mono-500.woff2", "fonts/plex-mono-600.woff2",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async (cache) => {
    // Challenge links carry a ?c= query, but the page itself is the same.
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    const fresh = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    }).catch(() => cached);
    if (cached) {
      event.waitUntil(fresh);
      return cached;
    }
    return fresh;
  }));
});
