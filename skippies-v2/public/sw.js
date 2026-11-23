/* SKIPPIES service worker: offline app shell, cached scanner model, push reminders. Bump VERSION each release. */
const VERSION = 'skippies-v2.3.0';
const SHELL = ['./', './index.html', './styles.css', './engine.js', './api.js', './art.js', './icons.js', './app-core.js', './app-home.js', './app-dex.js', './app-battle.js', './app-map.js', './app-social.js', './app-rewards.js', './manifest.webmanifest', './data/recycling-points.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];
const RUNTIME = 'skippies-runtime-v2';

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.endsWith('/config.js'))) return; // always live
  if (req.mode === 'navigate') { e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('./index.html', c)); return r; }).catch(() => caches.match('./index.html'))); return; }
  if (url.origin === location.origin && url.pathname.includes('/data/')) { // map data: network first, cached copy when offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => caches.match(req))); return;
  }
  if (url.origin === location.origin) { // app files: serve cached instantly, refresh in the background
    e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit); return hit || net; })); return;
  }
  if (/cdn\.jsdelivr\.net|storage\.googleapis\.com|tfhub\.dev|kaggle/.test(url.host)) {
    e.respondWith(caches.open(RUNTIME).then(c => c.match(req).then(hit => { const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit); return hit || net; })));
  }
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Skippies', { body: d.body || 'Time for a BYO moment!', tag: d.tag || 'skippies', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) if ('focus' in w) return w.focus(); return self.clients.openWindow('./'); }));
});
