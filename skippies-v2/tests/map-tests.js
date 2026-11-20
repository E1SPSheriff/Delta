// Map + wild Litterbug tests: web-mercator maths, deterministic spawns, server-verified wild battles, limits, privacy.
const crypto = require('crypto');
require('../public/engine.js');
const { createApi, createMemoryStore } = require('../public/api.js');
let fails = 0, passes = 0; const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL:', m); } };
const near = (a, b, e) => Math.abs(a - b) <= e;

// ---------- mercator ----------
const SP = { lat: 1.3099, lng: 103.7775 };
for (const z of [11, 15, 17, 19]) {
  const x = G.lngToX(SP.lng, z), y = G.latToY(SP.lat, z);
  ok(near(G.xToLng(x, z), SP.lng, 1e-9) && near(G.yToLat(y, z), SP.lat, 1e-9), 'mercator round trip z' + z);
  // standard slippy-map tile formula (OSM wiki) for comparison
  const n = Math.pow(2, z), lr = SP.lat * Math.PI / 180;
  const tx = Math.floor((SP.lng + 180) / 360 * n), ty = Math.floor((1 - Math.asinh(Math.tan(lr)) / Math.PI) / 2 * n);
  ok(Math.floor(x / 256) === tx && Math.floor(y / 256) === ty, `tile index matches standard formula z${z} (${tx},${ty})`);
}
ok(near(G.metersPerPx(0, 0), 156543.03392, 1e-3), 'metres per pixel at equator z0');
ok(near(G.metersPerPx(1.3, 17), 1.1940, 0.001), 'metres per pixel in Singapore z17 ~1.19 m: ' + G.metersPerPx(1.3, 17).toFixed(4));
ok(G.latToY(1.40, 17) < G.latToY(1.30, 17), 'north is up (smaller y)');
ok(G.lngToX(103.9, 17) > G.lngToX(103.8, 17), 'east is right');

// ---------- geohash cells ----------
const cell = G.geohash(SP.lat, SP.lng, 7), b = G.cellBounds(cell);
ok(b.s <= SP.lat && SP.lat <= b.n && b.w <= SP.lng && SP.lng <= b.e, 'cell contains point');
ok(near(b.n - b.s, 180 / Math.pow(2, 17), 1e-9) && near(b.e - b.w, 360 / Math.pow(2, 18), 1e-9), 'geohash-7 cell size (~153 m)');
ok(G.cellBounds('w2!') === null, 'bad geohash rejected');

// ---------- spawns ----------
const T0 = Date.UTC(2026, 10, 20, 2, 7, 0);
const a1 = G.wildNear(SP.lat, SP.lng, T0), a2 = G.wildNear(SP.lat, SP.lng, T0 + 60000);
ok(JSON.stringify(a1) === JSON.stringify(a2.map(s => s)), 'spawns stable within a 15-minute slot');
ok(a1.length > 0, 'some spawns near SP (' + a1.length + ')');
ok(a1.every(s => s.dist <= G.C.WILD_SCAN_M && G.WILD_POOL.includes(s.litter)), 'spawns within scan radius and valid species');
ok(new Set(a1.map(s => s.id)).size === a1.length, 'spawn ids unique');
ok(a1.every((s, i) => i === 0 || a1[i - 1].dist <= s.dist), 'sorted nearest first');
ok(a1.every(s => { const cb = G.cellBounds(s.cell); return s.lat > cb.s && s.lat < cb.n && s.lng > cb.w && s.lng < cb.e; }), 'each spawn sits inside its own cell');
const slotLater = G.wildNear(SP.lat, SP.lng, T0 + G.C.WILD_SLOT_MS);
ok(slotLater.map(s => s.id).join() !== a1.map(s => s.id).join(), 'new slot = new spawns');
ok(a1.every(s => s.ends > T0 && s.ends - T0 <= G.C.WILD_SLOT_MS), 'spawn end time within slot');
// two players 200 m apart see the same Litterbug where their circles overlap
const other = { lat: SP.lat + 0.0018, lng: SP.lng };
const b1 = G.wildNear(other.lat, other.lng, T0), shared = a1.filter(s => b1.some(x => x.id === s.id));
ok(shared.length > 0 && shared.every(s => { const x = b1.find(y => y.id === s.id); return x.lat === s.lat && x.lng === s.lng && x.litter === s.litter; }), 'same spawns for everyone (' + shared.length + ' shared)');
// spawn rate across many cells ~ WILD_CHANCE %
let n = 0, hit = 0; for (let i = 0; i < 4000; i++) { const c = G.geohash(1.30 + (i % 63) * 0.0014, 103.70 + Math.floor(i / 63) * 0.0014, 7); n++; if (G.cellSpawn(c, 123456)) hit++; }
ok(near(hit / n * 100, G.C.WILD_CHANCE, 3), `spawn rate ${(hit / n * 100).toFixed(1)}% ~ ${G.C.WILD_CHANCE}%`);
// species spread
const counts = {}; for (let s = 0; s < 400; s++) for (const sp of G.wildNear(SP.lat, SP.lng, T0 + s * G.C.WILD_SLOT_MS)) counts[sp.litter] = (counts[sp.litter] || 0) + 1;
ok(G.WILD_POOL.every(k => counts[k] > 0), 'all wild species appear: ' + JSON.stringify(counts));

// ---------- wild battles through the API ----------
(async () => {
  let T = Date.UTC(2026, 10, 20, 2, 0, 0);
  let s = 99; const rng = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const api = createApi(createMemoryStore(), { now: () => T, rng, randomHex: n => crypto.randomBytes(n).toString('hex'), sha256: async x => crypto.createHash('sha256').update(x).digest('hex') });
  const call = async (method, path, body, tok) => { const r = await api.handle({ method, path, headers: tok ? { authorization: 'Bearer ' + tok } : {}, body: body || {} }); return r; };
  const reg = await call('POST', '/api/register', { age13: true }), tok = reg.body.token;
  ok(reg.body.state.wild && reg.body.state.wild.n === 0, 'new players start with 0 wild battles');
  let r = await call('POST', '/api/wild/start', { litter: 'cupkraken' }, tok); ok(r.status === 400 && r.body.error === 'team', 'no team = no wild battle');
  T += 61000; const g = Array.from({ length: 72 }, (_, i) => (i * 53) % 251);
  r = await call('POST', '/api/action', { item: 'cup', hash: G.dhash(g), detected: ['cup'] }, tok); ok(r.status === 200, 'hatched a Skippy');
  r = await call('POST', '/api/wild/start', { litter: 'landfilllord' }, tok); ok(r.status === 400 && r.body.error === 'wild', 'bosses cannot be requested as wild');
  r = await call('POST', '/api/wild/start', { litter: 'nope' }, tok); ok(r.status === 400, 'unknown species rejected');
  const e0 = (await call('GET', '/api/state', null, tok)).body.state.energy;
  r = await call('POST', '/api/wild/start', { litter: 'cupkraken', lat: 1.3, lng: 103.8 }, tok);
  ok(r.status === 200 && r.body.battle.wild === true && r.body.battle.enemies.length === 1 && r.body.battle.enemies[0].id === 'cupkraken', 'wild battle started');
  ok(r.body.state.energy === e0 - 1 && r.body.state.wild.n === 1, 'costs 1 energy and counts toward the day');
  ok(!JSON.stringify(r.body.state).includes('103.8') && !JSON.stringify(r.body.battle).includes('103.8'), 'location sent by a client is never stored');
  ok(r.body.battle.enemies[0].level === G.wildLevel(r.body.state), 'wild level follows your team level');
  const bt = G.clone(r.body.battle), br = G.mulberry32(bt.seed), acts = [];
  while (!bt.over && acts.length < 200) { const a = { kind: 'move', move: 'type' }; G.act(bt, a, br); acts.push(a); }
  const ticket = r.body.ticket;
  r = await call('POST', '/api/campaign/finish', { ticket, actions: acts }, tok); ok(r.status === 400, 'wild ticket cannot be cashed as campaign');
  r = await call('POST', '/api/wild/start', { litter: 'bagghost' }, tok);
  const bt2 = G.clone(r.body.battle), br2 = G.mulberry32(bt2.seed), acts2 = [];
  while (!bt2.over && acts2.length < 200) { const a = { kind: 'move', move: 'type' }; G.act(bt2, a, br2); acts2.push(a); }
  const sc0 = r.body.state.scrap;
  r = await call('POST', '/api/wild/finish', { ticket: r.body.ticket, actions: acts2 }, tok);
  ok(r.status === 200 && r.body.result.result === bt2.result, 'server replay matches (' + bt2.result + ')');
  if (bt2.result === 'win') ok(r.body.result.scrap === G.C.WILD_SCRAP && r.body.state.scrap === sc0 + G.C.WILD_SCRAP && r.body.result.xp > 0, 'win gives scrap + XP');
  r = await call('POST', '/api/wild/finish', { ticket: 'x', actions: acts2 }, tok); ok(r.status === 400, 'replayed/forged ticket rejected');
  // daily limit
  let st = (await call('GET', '/api/state', null, tok)).body.state;
  for (let i = st.wild.n; i < G.C.WILD_PER_DAY + 2; i++) {
    for (let k = 0; k < 3; k++) { T += 61000; await call('POST', '/api/action', { item: 'bottle', hash: G.dhash(Array.from({ length: 72 }, (_, j) => (j * (7 + i * 3 + k) + i * 11 + k * 5) % 251)), detected: ['bottle'] }, tok); }
    r = await call('POST', '/api/wild/start', { litter: 'strawsnake' }, tok);
    if (i >= G.C.WILD_PER_DAY) ok(r.status === 400 && r.body.error === 'wildlimit', 'daily wild limit enforced at ' + G.C.WILD_PER_DAY);
  }
  st = (await call('GET', '/api/state', null, tok)).body.state;
  ok(st.wild.n === G.C.WILD_PER_DAY, 'exactly ' + G.C.WILD_PER_DAY + ' started today');
  T += G.DAY; r = await call('POST', '/api/wild/start', { litter: 'strawsnake' }, tok);
  ok(r.status === 200 && r.body.state.wild.n === 1, 'limit resets the next Singapore day');
  // older saves without the wild field still work
  const old = G.newPlayer('o', T, Math.random); delete old.wild; ok(G.wildToday(old, T) === 0, 'old saves: wildToday = 0');
  // energy gate
  const p = G.newPlayer('e', T, Math.random); G.addCopy(p, 'sipsy', 0); p.energy = 0;
  ok(G.startWild(p, 'cupkraken', T, 1).error === 'energy', 'no energy = no wild battle');
  console.log(`map-tests: ${passes} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
