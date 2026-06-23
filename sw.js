const CACHE = "calcul-glucides-dt1-top-aide-creer-recette-v1";
const FILES = ["./","index.html","style.css","script.js","manifest.json","database.json","assets/aide-memoire-diabetes.jpeg"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if(e.request.url.includes("database.json","assets/aide-memoire-diabetes.jpeg")){
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
