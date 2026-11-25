/* SKIPPIES service worker: offline app shell, cached scanner model, push reminders. Bump VERSION each release. */
importScripts('./version.js');
const VERSION = 'skippies-v' + self.SKIPPIES_RELEASE;
const SHELL = ['./', './index.html', './styles.css', './version.js', './engine.js', './api.js', './dev-mode.js', './art.js', './icons.js', './audio.js', './app-core.js', './app-home.js', './app-dex.js', './app-battle.js', './app-map.js', './app-dev.js', './app-social.js', './app-rewards.js', './logos/mamashop-rewards-icon.png', './logos/mamashop-rewards-icon.svg', './logos/mamashop-rewards-logo.png', './logos/mamashop-rewards-logo.svg', './logos/skippies-icon.png', './logos/skippies-icon.svg', './logos/skippies-logo.png', './logos/skippies-logo.svg', './manifest.webmanifest', './data/recycling-points.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './vendor/tfjs/tf.min.js', './vendor/tfjs/coco-ssd.min.js', './vendor/coco/model.json',
  './vendor/coco/group1-shard1of5', './vendor/coco/group1-shard2of5', './vendor/coco/group1-shard3of5', './vendor/coco/group1-shard4of5', './vendor/coco/group1-shard5of5'];
const RUNTIME = 'skippies-runtime-' + self.SKIPPIES_RELEASE;

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
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Skippies', { body: d.body || 'Time for a BYO moment!', tag: d.tag || 'skippies', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) if ('focus' in w) return w.focus(); return self.clients.openWindow('./'); }));
});
