/* Service worker for The Best of Brock cookbook PWA.
 * Strategy:
 *   - Cache-first for static assets (CSS, fonts, images, recipe HTML).
 *   - Network-first for the index and recipe JSON so updates show up.
 *   - Falls back to cache when offline.
 */
const CACHE = 'brock-v2';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/recipes.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './epub_work/OEBPS/Styles/tools-modern.css',
  './epub_work/OEBPS/Styles/book-modern.css',
  './epub_work/OEBPS/Misc/Scaler.js',
  './epub_work/OEBPS/Misc/Timer.js',
  './epub_work/OEBPS/Misc/Shopping.js',
  './epub_work/OEBPS/Misc/Multiplier61.js',
  './epub_work/OEBPS/Text/Multiplier.xhtml',
  './epub_work/OEBPS/Text/Timer.xhtml',
  './epub_work/OEBPS/Text/ShoppingList.xhtml',
  './epub_work/OEBPS/Text/Converter.xhtml'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  const isIndexOrJson = url.pathname.endsWith('/index.html') ||
                        url.pathname === '/' ||
                        url.pathname.endsWith('/recipes.json');

  if (isIndexOrJson) {
    // Network-first
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
