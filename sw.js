const CACHE = "calcul-glucides-dt1-v3-1-2";
const FILES = ["./", "index.html", "style.css", "script.js", "manifest.json", "database.json", "version.json", "apple-touch-icon.png", "icons/icon-192.png", "icons/icon-512.png", "assets/aide-valeurs-nutritives.png", "assets/aide-memoire-diabetes.jpeg", "assets/products/beurre-arachide-kraft-leger-cremeux.jpg", "assets/products/cheerios-multigrains.jpg", "assets/products/garden-veggie-straws-original.jpg", "assets/products/houmous-edamame-lantana.jpg", "assets/products/muffins-anglais-gadoua.jpg", "assets/products/oikos-grec-nature-sans-sucre-2.jpg", "assets/products/pain-quinoa-st-methode.jpg", "assets/products/quaker-crispy-minis-original.jpg", "assets/foods/ail.jpg", "assets/foods/ananas.jpg", "assets/foods/banane.jpg", "assets/foods/bleuets.jpg", "assets/foods/brocoli.jpg", "assets/foods/carotte.jpg", "assets/foods/concombre.jpg", "assets/foods/fraises.jpg", "assets/foods/kiwi.jpg", "assets/foods/laitue-romaine.jpg", "assets/foods/mais.jpg", "assets/foods/mangue.jpg", "assets/foods/melon-cantaloup.jpg", "assets/foods/melon-eau.jpg", "assets/foods/mures.jpg", "assets/foods/oignon.jpg", "assets/foods/orange.jpg", "assets/foods/patate-douce.jpg", "assets/foods/poivron.jpg", "assets/foods/pomme-terre.jpg", "assets/foods/pomme.jpg", "assets/foods/raisins-rouges.jpg", "assets/foods/tomate.jpg"];
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  const networkFirst = url.pathname.endsWith("database.json") || url.pathname.endsWith("version.json") || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");
  if(networkFirst){
    e.respondWith(fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
