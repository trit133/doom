// Offline support: the page is fetched network-first (so updates arrive),
// everything else (hashed JS/CSS, icons) is served cache-first.
const CACHE = 'doom-v1';
const PRECACHE = ['./', './manifest.webmanifest', './favicon.svg', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  const save = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(save).catch(() => caches.match(req).then((hit) => hit || caches.match('./'))));
  } else {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(save)));
  }
});
