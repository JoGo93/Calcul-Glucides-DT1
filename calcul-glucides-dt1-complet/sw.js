const CACHE = "calcul-glucides-dt1-v3-2-0";
const FILES = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "manifest.json",
  "database.json",
  "version.json",
  "apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "assets/aide-valeurs-nutritives.png",
  "assets/aide-memoire-diabetes.jpeg"
];

self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

function stableRequest(request, url) {
  if (url.pathname.endsWith("database.json")) {
    return new Request(new URL("database.json", self.registration.scope).href);
  }
  if (url.pathname.endsWith("version.json")) {
    return new Request(new URL("version.json", self.registration.scope).href);
  }
  return request;
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const key = stableRequest(event.request, url);
  const networkFirst = url.pathname.endsWith("database.json") ||
    url.pathname.endsWith("version.json") ||
    url.pathname.endsWith("index.html") ||
    url.pathname.endsWith("/");

  if (networkFirst) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(key, copy));
        }
        return response;
      }).catch(() => caches.match(key))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
