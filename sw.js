// Offline cache. The deploy workflow replaces __BUILD__ with the commit id, so
// every deploy installs a fresh, complete set of files and drops the old one.
const CACHE = 'fitness-snack-__BUILD__';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/dates.js',
  'js/dom.js',
  'js/engine.js',
  'js/game.js',
  'js/model.js',
  'js/player.js',
  'js/sound.js',
  'js/stats.js',
  'js/store.js',
  'js/views/awards.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/workout.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('fitness-snack-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE)
    .then((c) => c.match(e.request, { ignoreSearch: true }))
    .then((hit) => hit ?? fetch(e.request)));
});
