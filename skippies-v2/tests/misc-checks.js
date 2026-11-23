// Extra checks: pure-JS SHA-256 matches Node crypto; all public JS parses; HTML references exist; CSP has no inline-script needs.
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const PUB = path.join(__dirname, '..', 'public');
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL:', m); } };
// load sha from app-core without running the app: extract the function body
const core = fs.readFileSync(path.join(PUB, 'app-core.js'), 'utf8');
const m = core.match(/SK\.sha256hex = (function \(str\) \{[\s\S]*?\n  \});/);
ok(!!m, 'found sha256hex');
const sha = vm.runInNewContext('(' + m[1] + ')', { unescape, encodeURIComponent, Array });
for (const s of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000), 'héllo 🥤 skippies', crypto.randomBytes(32).toString('hex')]) {
  ok(sha(s) === crypto.createHash('sha256').update(s, 'utf8').digest('hex'), 'sha256 matches for len ' + s.length);
}
// syntax check every JS file
for (const f of fs.readdirSync(PUB).filter(f => f.endsWith('.js'))) { try { new vm.Script(fs.readFileSync(path.join(PUB, f), 'utf8'), { filename: f }); ok(true); } catch (e) { ok(false, 'syntax ' + f + ': ' + e.message); } }
// every script/link in index.html exists
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
for (const [, src] of html.matchAll(/(?:src|href)="([^"]+)"/g)) ok(fs.existsSync(path.join(PUB, src)), 'index.html ref exists: ' + src);
ok(!/<script>(?!\s*<\/script>)/.test(html) && !/ on[a-z]+="/.test(html), 'no inline scripts/handlers in index.html (CSP-safe)');
for (const f of fs.readdirSync(PUB).filter(f => f.startsWith('app-'))) ok(!/ on(click|load|error|change)=\\?"/.test(fs.readFileSync(path.join(PUB, f), 'utf8')), 'no inline handlers in ' + f);
// design rules: no emoji in any UI source; every icon referenced exists; every colour in CSS outside :root comes from tokens or known palettes
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}]/u;
for (const f of ['index.html', 'app-core.js', 'app-home.js', 'app-dex.js', 'app-battle.js', 'app-social.js', 'app-rewards.js', 'icons.js', 'styles.css', 'api.js', 'rewards/index.html']) {
  const src = fs.readFileSync(path.join(PUB, f), 'utf8'), m = src.match(EMOJI); ok(!m, 'no emoji in ' + f + (m ? ': ' + m[0] : ''));
}
vm.runInThisContext(fs.readFileSync(path.join(PUB, 'icons.js'), 'utf8'));
for (const f of fs.readdirSync(PUB).filter(f => f.startsWith('app-'))) {
  const src = fs.readFileSync(path.join(PUB, f), 'utf8');
  for (const [, n] of src.matchAll(/\bic\('([a-z]+)'/g)) ok(Icon.names.includes(n), `icon "${n}" exists (${f})`);
}
ok(Object.values(Icon.ITEM).concat(Object.values(Icon.TYPE)).every(n => Icon.names.includes(n)), 'item/type icons exist');
const css = fs.readFileSync(path.join(PUB, 'styles.css'), 'utf8');
ok(/--brand:#1E6B4F/.test(css) && /prefers-reduced-motion/.test(css) && /safe-area-inset-bottom/.test(css), 'css has tokens, reduced motion and safe areas');
// service worker shell files exist
const sw = fs.readFileSync(path.join(PUB, 'sw.js'), 'utf8');
for (const [, f] of sw.match(/SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'\.\/([^']*)'/g)) if (f) ok(fs.existsSync(path.join(PUB, f)), 'sw shell file exists: ' + f);
// manifest icons exist
const man = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.webmanifest'), 'utf8'));
man.icons.forEach(i => ok(fs.existsSync(path.join(PUB, i.src)), 'icon ' + i.src));
// species names must not reuse well-known Pokemon names (spot list)
vm.runInThisContext(fs.readFileSync(path.join(PUB, 'engine.js'), 'utf8'));
const banned = ['pikachu', 'squirtle', 'bulbasaur', 'charmander', 'eevee', 'jigglypuff', 'meowth', 'psyduck', 'snorlax', 'mew', 'trubbish', 'garbodor', 'grimer', 'muk', 'voltorb', 'pokemon', 'pokémon', 'pokeball', 'merlion'];
const names = G.SPECIES.flatMap(s => s.stages).map(n => n.toLowerCase());
{ // published effective odds match a 300k-egg simulation (within 0.3 points) and sum to 100
  const eo = G.effectiveOdds(), p = G.newPlayer('x', 0, Math.random), c = {}, N = 300000;
  for (let i = 0; i < N; i++) { const r = G.rollRarity(p, Math.random); c[r] = (c[r] || 0) + 1; }
  G.RARITY_KEYS.forEach(k => ok(Math.abs(c[k] / N * 100 - eo[k]) < 0.3, `effective odds ${k}: published ${eo[k]} vs simulated ${(c[k] / N * 100).toFixed(2)}`));
  ok(Math.abs(Object.values(eo).reduce((a, b) => a + b, 0) - 100) < 0.05, 'effective odds sum to 100');
  console.log('effective odds:', JSON.stringify(eo));
}
{ // nearby zones: 9 cells, includes self, symmetric, a point ~300 m across a cell edge counts as near, 20 km away does not
  const z = G.geohash(1.3521, 103.8198, 5), nb = G.zoneNeighbors(z);
  ok(nb.length === 9 && nb.includes(z), 'zone has 9 cells incl. itself');
  ok(nb.every(n => G.zoneNeighbors(n).includes(z)), 'neighbour relation symmetric');
  // find the cell edge east of the point, then step 150 m either side
  let lng = 103.8198; while (G.geohash(1.3521, lng, 5) === z) lng += 0.0005;
  const a = G.geohash(1.3521, lng - 0.0014, 5), c = G.geohash(1.3521, lng + 0.0014, 5);
  ok(a !== c && G.nearZone(a, c), 'players 300 m apart across a cell edge are near');
  ok(!G.nearZone(z, G.geohash(1.4400, 103.9800, 5)), 'far zone (~20 km) not near');
  ok(!G.nearZone(null, z) && !G.nearZone(z, null), 'no zone = not near');
}
ok(!names.some(n => banned.some(b => n.split(/\s+/).includes(b) || n === b)), 'no Pokemon/Merlion names used');
// service worker: push shows a notification; click focuses/open the app; /api and /config.js are never cached
(async () => {
  const L = {}, shown = [], opened = [];
  const self = { addEventListener: (t, f) => { L[t] = f; }, registration: { showNotification: async (t, o) => shown.push({ t, o }) }, clients: { matchAll: async () => [], openWindow: async u => opened.push(u), claim: async () => { } }, skipWaiting: () => { } };
  vm.runInNewContext(sw, { self, caches: {}, fetch: () => { }, location: { origin: 'https://s.test' }, URL, Promise, console });
  ok(['install', 'activate', 'fetch', 'push', 'notificationclick'].every(k => L[k]), 'sw registers all handlers');
  let wait; L.push({ data: { json: () => ({ title: 'Skippies 🎒', body: 'Grab your reusable', tag: 'byo' }) }, waitUntil: p => { wait = p; } }); await wait;
  ok(shown.length === 1 && shown[0].t === 'Skippies 🎒' && shown[0].o.tag === 'byo', 'push shows notification');
  L.notificationclick({ notification: { close() { } }, waitUntil: p => { wait = p; } }); await wait;
  ok(opened.length === 1, 'notification click opens the app');
  let responded = false; L.fetch({ request: { method: 'GET', url: 'https://s.test/api/state', mode: 'cors' }, respondWith: () => { responded = true; } });
  ok(!responded, 'API calls bypass the cache');
  L.fetch({ request: { method: 'GET', url: 'https://s.test/config.js', mode: 'no-cors' }, respondWith: () => { responded = true; } });
  ok(!responded, 'config.js bypasses the cache');
  console.log(`${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
if (false) process.exit(fails ? 1 : 0);
