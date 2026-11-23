// End-to-end UI flow tests: runs the real client (public/*.js) in a tiny DOM shim with fake timers.
// Usage: node tests/ui-tests.js local   |   node tests/ui-tests.js online
const fs = require('fs'), path = require('path'), vm = require('vm'), nodeCrypto = require('crypto');
const { Node_, walk } = require('./dom-shim.js');
const MODE = process.argv[2] || 'local';
const PUB = path.join(__dirname, '..', 'public');
let fails = 0, passes = 0;
const ok = (c, msg) => { if (c) passes++; else { fails++; console.log('FAIL [' + MODE + ']:', msg); } };

// ---------- deterministic clock + randomness ----------
let T = Date.UTC(2026, 4, 4, 2, 0, 0); // Mon 4 May 2026, 10:00 SGT
Date.now = () => T;
let seed = 12345; Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ---------- fake timers ----------
let q = [], tid = 0, vnow = 0;
global.setTimeout = (fn, ms) => { const id = ++tid; q.push({ id, at: vnow + (ms || 0), fn }); return id; };
global.clearTimeout = id => { q = q.filter(x => x.id !== id); };
const flush = async (n) => { for (let i = 0; i < (n || 30); i++) await new Promise(r => setImmediate(r)); };
async function advance(ms) {
  const end = vnow + ms;
  for (;;) {
    await flush();
    q.sort((a, b) => a.at - b.at);
    const nx = q[0]; if (!nx || nx.at > end) break;
    q.shift(); vnow = nx.at; nx.fn();
  }
  vnow = end; await flush();
}

// ---------- DOM globals ----------
const body = new Node_('body');
const appEl = new Node_('div'); appEl.setAttribute('id', 'app'); body.appendChild(appEl);
const liveEl = new Node_('div'); liveEl.setAttribute('id', 'live'); body.appendChild(liveEl);
const head = new Node_('head');
const listeners = {};
global.document = {
  body, head, activeElement: body, visibilityState: 'visible',
  getElementById: id => { let f = null; walk(body, n => { if (!f && n.attrs.id === id) f = n; }); return f; },
  querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s),
  createElement: t => new Node_(t),
  addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); }
};
const ls = {};
global.localStorage = { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } };
global.window = globalThis;
global.matchMedia = () => ({ matches: false });
global.location = { protocol: 'https:', hostname: 'test.local' };
global.isSecureContext = false;
global.addEventListener = () => { };
global.scrollTo = () => { };
global.confirm = () => true;
let downloads = [];
global.URL = { createObjectURL: b => { downloads.push(b); return 'blob:x'; }, revokeObjectURL: () => { } };
global.Blob = class { constructor(parts, o) { this.text = parts.join(''); this.type = o && o.type; } };
let geo = { lat: 1.3521, lng: 103.8198 };
let watches = 0;
Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition: (ok_) => ok_({ coords: { latitude: geo.lat, longitude: geo.lng } }), watchPosition: (ok_) => { watches++; ok_({ coords: { latitude: geo.lat, longitude: geo.lng, accuracy: 12 } }); return watches; }, clearWatch: () => { } } }, configurable: true, writable: true });
if (!globalThis.crypto) globalThis.crypto = nodeCrypto.webcrypto;

// ---------- server (online mode): the real API with a memory store, behind a fake fetch ----------
let serverApi = null;
const sha = async s => nodeCrypto.createHash('sha256').update(s).digest('hex');
const rhex = n => nodeCrypto.randomBytes(n).toString('hex');
function loadScript(f) { vm.runInThisContext(fs.readFileSync(path.join(PUB, f), 'utf8'), { filename: f }); }
loadScript('engine.js'); loadScript('api.js');
const dataFile = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'recycling-points.json'), 'utf8'));
global.fetch = async (url, opts) => {
  opts = opts || {};
  if (url === 'data/recycling-points.json') return { status: 200, json: async () => JSON.parse(JSON.stringify(dataFile)) };
  if (!serverApi) throw new Error('offline');
  const u = url.replace('https://x.test', '');
  if (u === '/api/push/key') return { status: 200, json: async () => ({ publicKey: null }) };
  const h = opts.headers || {};
  const r = await serverApi.handle({ method: opts.method || 'GET', path: u, headers: { authorization: h.Authorization }, body: opts.body });
  return { status: r.status, json: async () => JSON.parse(JSON.stringify(r.body)) };
};
if (MODE === 'online') {
  serverApi = SkippiesAPI.createApi(SkippiesAPI.createMemoryStore(), { randomHex: rhex, sha256: sha, rng: Math.random });
  global.SKIPPIES_SERVER = 'https://x.test';
}

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const txt = () => body.textContent;
const click = async (el, label) => { ok(!!el, 'element exists: ' + label); if (el) { ok(!el.disabled, 'enabled: ' + label); el.click(); } await flush(); };
const sel = s => document.querySelector(s);
const all = s => document.querySelectorAll(s);
const closeSheet = async () => { const b = sel('.sheet [data-close]'); if (b) b.click(); await flush(); };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{FE0F}]/u;
const noEmoji = label => { const m = txt().match(EMOJI); ok(!m, 'no emoji in UI (' + label + ')' + (m ? ': ' + m[0] : '')); };
const confirmYes = async () => { const b = $('cf-ok'); ok(!!b, 'confirm sheet shown'); if (b) b.click(); await flush(); };
// a 9x8 gray grid that is unique per n (different "photo")
function grid(n) { const r = G.mulberry32(1000 + n); return Array.from({ length: 72 }, () => Math.floor(r() * 255)); }
let photo = 0;
async function snap(item, det, flags) { T += 61000; const r = await SK.submitCapture(item, grid(++photo), det || [G.ITEMS[item].detect[0]], flags); await advance(2500); return r; }
async function doneReveal() { const d = $('done'); if (d) { d.click(); await flush(); } }
async function playBattle(maxTurns) {
  for (let i = 0; i < (maxTurns || 80); i++) {
    await advance(200);
    if ($('cont')) return true;
    const BT = SK._battleTest; if (!BT.B) { await advance(2000); if ($('cont')) return true; continue; }
    if (BT.busy) { await advance(1000); continue; }
    const mv = sel('[data-mv="type"]'); if (mv && !mv.disabled) mv.click(); else { const bm = sel('[data-mv="bump"]'); if (bm) bm.click(); }
    await advance(4000);
    if ($('cont')) return true;
  }
  return !!$('cont');
}

(async () => {
  for (const f of ['config.js', 'art.js', 'icons.js', 'app-core.js', 'app-home.js', 'app-dex.js', 'app-battle.js', 'app-map.js', 'app-social.js', 'app-rewards.js']) {
    if (f === 'config.js' && MODE === 'online') continue; // server serves its own config.js
    loadScript(f);
  }
  await flush();

  // ---------- onboarding ----------
  if (MODE === 'online') {
    ok(!!$('a13') && !!$('u13'), 'age gate shown first when a server is configured');
    await click($('a13'), 'age 13+');
  }
  ok(txt().includes('Bring your own.') && txt().includes('Hatch a Skippy.'), 'welcome pitch shown');
  noEmoji('welcome');
  await click($('howscan'), 'how scans work'); ok(txt().includes('never uploaded'), 'scan explainer'); await closeSheet();
  await click($('go'), 'start');
  ok(!!sel('[data-nm]') && !!$('nameinput'), 'name picker opened with text box + random names');
  const typeName = async v => { const i = $('nameinput'); i.value = v; i.oninput({}); await flush(); await advance(600); };
  ok($('nameinput').value === sel('[data-nm]').textContent.trim() && sel('[data-nm]').getAttribute('aria-checked') === 'true', 'first random name pre-filled');
  await typeName('ab'); ok($('namego').disabled && /3 to 20/.test($('namemsg').textContent), 'too short rejected live');
  await typeName('Kopi#Kid'); ok($('namego').disabled && /letters, numbers/.test($('namemsg').textContent), 'symbols rejected live');
  await typeName('Sh1t Lord'); ok($('namego').disabled && /isn\u2019t allowed/.test($('namemsg').textContent), 'rude word (leetspeak) rejected live');
  await typeName('Admin Ah Boy'); ok($('namego').disabled && /staff/.test($('namemsg').textContent), 'staff-like name rejected live');
  await typeName('Tan 91234567'); ok($('namego').disabled && /numbers/.test($('namemsg').textContent), 'phone-number-like name rejected live');
  ok($('nameinput').attrs.maxlength === '20', 'input capped at 20 characters');
  await typeName('Bubble Tea Ninja'); ok(!$('namego').disabled && /Looks good/.test($('namemsg').textContent) && $('namecount').textContent === '16/20', 'own name accepted with counter');
  ok(sel('[data-nm][aria-checked="true"]') === null, 'random chips unselected while typing own name');
  const firstChip = sel('[data-nm]').textContent.trim();
  await click($('rer'), 'shuffle random names'); await advance(600);
  ok(!!sel('[data-nm]') && $('nameinput').value === sel('[data-nm]').textContent.trim(), 'shuffle fills a new random name');
  sel('[data-nm]').click(); await flush(); await advance(600);
  ok(sel('[data-nm]').getAttribute('aria-checked') === 'true' && !$('namego').disabled, 'random name selected');
  await typeName('  Bubble   Tea Ninja  ');
  await click($('namego'), 'start playing');
  ok(SK.st && SK.st.name === 'Bubble Tea Ninja', 'own name saved, spaces tidied: ' + (SK.st && SK.st.name));
  ok(G.checkName(SK.st.name).ok && firstChip.length > 0, 'saved name passes the filter');
  // change again straight away: blocked for 7 days
  await click($('settings'), 'open settings'); await click($('rename'), 'change name');
  ok(!!$('namelock') && $('nameinput').disabled && $('namego').disabled, 'name change locked for 7 days after setting it');
  await click($('nmback'), 'back from name');
  ok(!!$('catch-byo') && !!$('catch-rec'), 'home has BYO + recycle catch buttons');
  ok(txt().includes('Your first egg is waiting'), 'empty buddy shows first-egg state');
  ok(MODE === 'local' ? txt().includes('Offline mode') : !txt().includes('Offline mode'), 'mode banner correct');

  // battle tab before any skippy
  noEmoji('home empty');
  ok(all('.tab').length === 5 && sel('.tab[aria-current="page"]').textContent.includes('Home'), 'tab bar with active Home');
  await click($('pill-en'), 'energy pill'); ok(txt().includes('Each battle uses 1 energy'), 'energy explainer'); await closeSheet();
  await click($('pill-sc'), 'scrap pill'); ok(txt().includes('train Skippies'), 'scrap explainer'); await closeSheet();
  await click(sel('[data-tab="battle"]'), 'battle tab'); ok(txt().includes('No team yet'), 'battle gated until first hatch');
  await click(sel('[data-tab="home"]'), 'home tab');

  // ---------- catch flow UI (item picker) ----------
  await click($('catch-byo'), 'catch byo');
  ok($('next').disabled, 'camera button disabled until item picked');
  await click(sel('[data-it="cup"]'), 'pick cup');
  ok(!$('next').disabled, 'camera button enabled after picking');
  await click($('next'), 'open camera'); await advance(100);
  ok(txt().includes('secure (https)') || txt().includes('No camera'), 'camera unavailable message on insecure/no-camera context');
  ok($('snap').disabled, 'snap disabled until scanner spots the item');
  await click($('back'), 'back from camera'); await click($('back'), 'back to home');

  // ---------- first hatch ----------
  const r1 = await snap('cup', ['cup']);
  ok(r1.status === 200, 'first BYO accepted');
  ok(txt().includes('New Skippy'), 'reveal shows NEW');
  ok(/Common|Uncommon|Rare|Epic|Legendary/.test(sel('.badge').textContent), 'reveal shows a rarity');
  ok(txt().includes('+3') && txt().includes('+10') && txt().includes('Drink'), 'reveal shows energy, scrap and mileage gains');
  noEmoji('reveal');
  await doneReveal();
  ok($('catch-byo').disabled && /Next scan in 0\d:\d\d/.test(txt()), 'catch buttons show cooldown countdown');
  ok(!!$('lastcatch'), 'latest catch row on home');
  ok(!!$('pet'), 'buddy appears on home after first hatch');
  ok(txt().includes('Today: 1/6'), 'today counter 1/6');
  ok(!!$('rinse'), 'rinse button appears after a BYO');

  // rinse
  await click($('rinse'), 'rinse'); ok(!!SK.st.dex.bubbles, 'rinse gives Bubbles'); ok($('rinse').disabled, 'rinse disabled after use');

  // ---------- anti-cheat ----------
  T += 61000; const same = grid(photo);
  let r = await SK.submitCapture('cup', same, ['cup']); await flush();
  ok(r.status === 409 && txt().includes('Seen that photo before'), 'same photo rejected as duplicate');
  const near = same.slice(); near[0] = (near[0] + 3) % 255; near[10] = (near[10] + 2) % 255;
  T += 61000; r = await SK.submitCapture('cup', near, ['cup']); await flush();
  ok(r.status === 409, 'near-identical photo also rejected');
  T += 61000; r = await SK.submitCapture('cup', Array(72).fill(10), ['cup']); await flush();
  ok(r.status === 400 && r.body.error === 'lowdetail', 'blank/dark photo rejected');
  T += 61000; r = await SK.submitCapture('cup', grid(999), ['book']); await flush();
  ok(r.status === 400 && r.body.error === 'notdetected', 'wrong object rejected');
  await click($('home'), 'back home after error');

  // ---------- recycle + cooldown + daily cap ----------
  r = await snap('bev', ['bottle']); ok(r.status === 200 && r.body.result.scrap === 30, 'recycling gives 30 scrap'); await doneReveal();
  T += 20000; r = await SK.submitCapture('cup', grid(998), ['cup']); await flush();
  ok(r.status === 400 && r.body.error === 'cooldown', '60s cooldown enforced right after an accepted photo');
  await click($('home'), 'back home after cooldown');
  for (let i = 0; i < 4; i++) { r = await snap(['bottle', 'box', 'bag', 'kit'][i], [G.ITEMS[['bottle', 'box', 'bag', 'kit'][i]].detect[0]]); await doneReveal(); }
  ok(r.status === 200, 'actions 3-6 accepted');
  r = await snap('cup', ['cup']); ok(r.status === 400 && r.body.error === 'limit', '7th action today blocked (6/day)'); await click($('home'), 'home');

  // ---------- campaign battle (tutorial is free) ----------
  await click(sel('[data-tab="battle"]'), 'battle tab');
  ok(!sel('[data-area="0"]').className.includes('locked'), 'area 1 unlocked after 1 action day');
  await click(sel('[data-area="0"]'), 'open canteen');
  ok(txt().includes('Fight · free'), 'tutorial fight is free');
  noEmoji('area');
  const e0 = SK.st.energy;
  await click(sel('[data-f="0"]'), 'start fight 1'); await flush();
  ok(!!sel('[data-mv="type"]'), 'battle screen shows moves');
  noEmoji('battle');
  ok(SK.st.energy === e0, 'tutorial cost no energy');
  ok(await playBattle(), 'campaign battle reaches result screen');
  ok(/Cleaned up|Not this time/.test(txt()), 'campaign result shown (server verified the replay)');
  const won = txt().includes('Cleaned up');
  ok(!won || SK.st.areas[0].progress === 1, 'win advances area progress');
  await click($('cont'), 'continue'); ok(txt().includes('SP Canteen'), 'back to area screen');
  await click($('back'), 'areas');

  // walk away counts, costs energy
  await click(sel('[data-area="0"]'), 'open canteen again');
  const e1 = SK.st.energy; await click(sel('[data-f="0"]'), 'replay fight 1'); ok(SK.st.energy === e1 - 1, 'replay costs 1 energy');
  await click($('run'), 'walk away'); await confirmYes(); await advance(3000);
  ok(txt().includes('Walked away'), 'walk away result'); await click($('cont'), 'continue'); await click($('back'), 'areas');

  // ---------- arena ----------
  if (MODE === 'online') {
    // a second real player in the same zone
    const reg = await serverApi.handle({ method: 'POST', path: '/api/register', body: { age13: true } });
    const tok2 = reg.body.token, H2 = { authorization: 'Bearer ' + tok2 };
    T += 61000; const a2 = await serverApi.handle({ method: 'POST', path: '/api/action', headers: H2, body: { item: 'bottle', hash: G.dhash(grid(5000)), detected: ['bottle'] } });
    ok(a2.status === 200, 'second player hatched');
    await serverApi.handle({ method: 'PUT', path: '/api/zone', headers: H2, body: { zone: G.geohash(geo.lat, geo.lng, 5) } });
    global.P2 = { H2, code: reg.body.state.friendCode };
    // set my zone from the map's Nearby sheet (on-device geohash)
    await click(sel('[data-tab="radar"]'), 'map'); await flush();
    await click($('maplist'), 'nearby sheet'); await flush();
    await click($('setzone'), 'set zone'); await flush();
    ok(SK.st.zone === G.geohash(geo.lat, geo.lng, 5) && SK.st.zone.length === 5, 'zone saved as 5-char geohash only');
    ok(txt().includes('Area saved'), 'zone saved message');
    // outside Singapore is refused
    geo = { lat: 51.5, lng: -0.12 }; await click($('setzone'), 'set zone abroad'); await flush();
    ok(txt().includes('only available inside Singapore'), 'non-SG zone refused'); geo = { lat: 1.3521, lng: 103.8198 };
    await closeSheet();
  }
  await click(sel('[data-tab="battle"]'), 'battle tab'); await click(sel('[data-sub="arena"]'), 'arena'); await flush(); await flush();
  ok(!!sel('[data-opp]'), 'arena opponents listed');
  ok(/practice bot/i.test(txt()), 'practice bots labelled');
  if (MODE === 'online') {
    ok(txt().includes('Near you'), 'nearby player shown with Near-you tag');
    // friend code lookup
    $('fcode').value = P2.code.toLowerCase(); await click($('fgo'), 'find by code'); await flush();
    ok(sel('[data-opp="0"]') && txt().includes('Near you'), 'friend found by code and listed first');
  } else ok(txt().includes('practice bots only'), 'offline arena explains bots only');
  const rate0 = SK.st.arena.rating;
  await click(sel('[data-opp="0"]'), 'battle opponent 0'); await flush();
  ok(!!sel('[data-mv="type"]'), 'arena battle started');
  ok(txt().includes('Drink beats Water'), 'pvp type tip shown');
  ok(await playBattle(), 'arena battle reaches result');
  ok(txt().includes('Rating'), 'arena result shows rating change');
  ok(SK.st.arena.rating !== rate0, 'rating changed');
  if (MODE === 'online') {
    const s2 = await serverApi.handle({ method: 'GET', path: '/api/state', headers: P2.H2 });
    ok(s2.body.state.arena.rating - 1000 === -Math.round((SK.st.arena.rating - rate0) / 2), 'offline defender rating moves by half the opposite amount');
  }
  await click($('cont'), 'continue');

  // ---------- dex, odds, merge, train, team ----------
  await click(sel('[data-tab="dex"]'), 'dex');
  ok(txt().includes('found') && sel('.tile.locked') && sel('.tile[data-sk]'), 'dex shows owned + locked tiles');
  noEmoji('dex');
  await click(sel('[data-f="missing"]'), 'filter not found'); ok(all('.dexgrid .tile[data-sk]').length === 0 && all('.dexgrid .tile.locked').length > 0, 'not-found filter hides owned');
  await click(sel('[data-f="all"]'), 'filter all');
  await click(sel('[data-sort="stars"]'), 'sort stars'); ok(sel('[data-sort="stars"]').getAttribute('aria-checked') === 'true', 'sort applied');
  await click($('odds'), 'odds'); await flush();
  ok(txt().includes('60%') && txt().includes('1%') && txt().includes('57.4%') && txt().includes('Rare or better'), 'published odds + pity shown');
  await closeSheet();
  // hatch until some duplicate is mergeable (new days as needed)
  let guard = 0;
  const mergeable = () => Object.keys(SK.st.dex).find(id => { const c = G.mergeCost(SK.st, id); return c != null && SK.st.dex[id].copies >= c; });
  while (!mergeable() && guard++ < 40) { if (G.actionsToday(SK.st, T).filter(a => a.verified).length >= 6) T += G.DAY; const it = ['cup', 'bottle', 'bev', 'paper'][guard % 4]; r = await snap(it, [G.ITEMS[it].detect[0]]); await doneReveal(); }
  const mid = mergeable(); ok(!!mid, 'got a mergeable duplicate');
  await click(sel('[data-tab="dex"]'), 'dex');
  ok(txt().includes('MERGE'), 'merge badge shown in dex');
  const st0 = SK.st.dex[mid].stars;
  await click(sel(`.dexgrid [data-sk="${mid}"]`), 'open creature'); ok(txt().includes('Habit mileage +'), 'creature sheet shows mileage bonus');
  noEmoji('creature');
  await click($('merge'), 'merge'); await advance(3000); if ($('evok')) await click($('evok'), 'evo ok');
  ok(SK.st.dex[mid].stars === st0 + 1, 'merge added a star');
  await click(sel('[data-tab="dex"]'), 'dex');
  await click(sel(`.dexgrid [data-sk="${mid}"]`), 'open creature');
  const lv0 = SK.st.dex[mid].level, sc0 = SK.st.scrap;
  await click($('train5'), 'train x5'); ok(SK.st.scrap === sc0 - 50 && SK.st.dex[mid].level > lv0, 'training spends scrap and levels up');
  await closeSheet();
  await click($('teamedit'), 'edit team'); const boxes = all('[data-t]'); ok(boxes.length >= 2, 'team editor lists skippies');
  await click($('tsave'), 'save team'); ok(SK.st.team.length >= 1, 'team saved');

  // ---------- home: mileage + season reward ----------
  await click(sel('[data-tab="home"]'), 'home');
  ok(txt().includes('Habit mileage') && /\+\d+%/.test(txt()), 'habit mileage bars shown');
  while (G.seasonActionDays(SK.st) < 5) { T += G.DAY; r = await snap('kit', ['spoon']); await doneReveal(); }
  ok(!!SK.st.rewardCode && /^SKIP-[A-Z2-9]{5}$/.test(SK.st.rewardCode), 'season reward code after 5 BYO days');
  await click(sel('[data-tab="home"]'), 'home'); ok(txt().includes(SK.st.rewardCode), 'reward code shown on home');

  // ---------- ranks ----------
  await click(sel('[data-tab="ranks"]'), 'ranks'); await flush(); await flush();
  ok(!!(sel('.podium .me') || sel('.row.me')), 'my row highlighted on leaderboard');
  noEmoji('ranks');
  ok(!txt().includes('practice bot'), 'bots excluded from leaderboard');
  if (MODE === 'online') {
    ok(txt().includes('2 players'), 'global board counts both real players');
    await click(sel('[data-s="zone"]'), 'zone scope'); await flush(); await flush();
    ok(txt().includes('2 players'), 'zone board shows the nearby player');
    await click(sel('[data-b="arena"]'), 'arena board'); await flush(); await flush(); ok(!!(sel('.podium .me') || sel('.row.me')), 'arena board renders');
  } else ok(txt().includes('Offline mode: Singapore-wide rankings'), 'offline ranks explanation');

  // ---------- live map ----------
  // compact array format, exactly as the data tool writes it
  const MT = SK._mapTest;
  MT.setData({ source: 'TEST', points: [['bin', 1.3530, 103.8198, '', 'Blk 1 Test St S100001'], ['ewaste', 1.3600, 103.8198, 'E Point', 'Mall'], ['bin', 1.45, 103.82, '', 'Blk 9 North Rd']] });
  await click(sel('[data-tab="radar"]'), 'map tab'); await advance(50);
  ok(!!$('map') && sel('.tab[aria-current="page"]').textContent.includes('Map'), 'map tab opens a full map');
  if (MODE === 'online') {
    ok(!!sel('.map-attr') && !sel('.map-attr').hasAttribute('hidden') && txt().includes('Singapore Land Authority') && sel('.map-attr img').getAttribute('src').startsWith('https://www.onemap.gov.sg/'), 'OneMap logo + attribution shown (required by OneMap terms)');
  } else ok(sel('#map').className.includes('no-tiles') && sel('.map-attr').hasAttribute('hidden'), 'offline mode: street map off by default');
  // location
  if (!MT.M.me) { ok(!!$('geoon') && txt().includes('exact location stays on this phone'), 'location prompt explains privacy'); await click($('geoon'), 'turn on location'); }
  await advance(50);
  ok(MT.M.geo === 'on' && MT.M.me && Math.abs(MT.M.me.lat - geo.lat) < 1e-9, 'map follows your location');
  ok(!!sel('.mk.me') && sel('.mk.me').textContent.includes('You'), 'your buddy marks your position');
  ok(!!sel('.mk.range'), 'interaction range circle drawn');
  if (MODE === 'online') {
    const tiles = all('.tile-img');
    ok(tiles.length >= 4 && tiles.every(t => /^https:\/\/www\.onemap\.gov\.sg\/maps\/tiles\/Default\/17\/\d+\/\d+\.png$/.test(t.getAttribute('src'))), 'OneMap tiles requested at zoom 17 (' + tiles.length + ')');
    const tx = Math.floor(G.lngToX(geo.lng, 17) / 256), ty = Math.floor(G.latToY(geo.lat, 17) / 256);
    ok(tiles.some(t => t.getAttribute('src').endsWith(`/17/${tx}/${ty}.png`)), 'the tile under you is loaded');
  } else ok(all('.tile-img').length === 0, 'offline mode: no map images requested');
  const pins = all('.mk.pin'); ok(pins.length === 1, 'only on-screen recycling points drawn (' + pins.length + ')');
  ok(MT.M.spawns.length > 0 && all('.mk.wild').length > 0, 'wild Litterbugs on the map (' + MT.M.spawns.length + ')');
  ok(/Litterbugs? nearby/.test(sel('#mhud').textContent) && sel('#mhud').textContent.includes('wild 0/10'), 'map HUD shows nearby count and daily wild battles');
  noEmoji('map');
  // a far Litterbug cannot be battled
  const far = MT.M.spawns.find(s => s.dist > G.C.WILD_RANGE_M);
  if (far) { MT.tapMarker('w:' + far.id); await flush(); ok($('wildgo').disabled && txt().includes('Walk closer'), 'far Litterbug: walk closer'); await closeSheet(); }
  // walk up to one and battle it
  const target = MT.M.spawns[MT.M.spawns.length - 1];
  geo = { lat: target.lat, lng: target.lng }; MT.setHere(geo); await advance(50);
  const sp = MT.M.spawns.find(s => s.id === target.id);
  ok(sp && sp.dist < 1, 'walking moves you on the map');
  const mk = sel(`[data-mk="w:${target.id}"]`); ok(!!mk, 'marker for the Litterbug');
  await click(mk, 'tap Litterbug'); await flush();
  ok(txt().includes('Wild ' + G.LITTER[target.litter].name) && !$('wildgo').disabled, 'in range: battle button enabled');
  const en0 = SK.st.energy;
  await click($('wildgo'), 'battle wild'); await flush(); await flush();
  ok(txt().includes('A wild ' + G.LITTER[target.litter].name + ' appeared') && SK.st.energy === en0 - 1, 'wild battle starts and costs 1 energy');
  ok(await playBattle(), 'wild battle reaches result');
  const wonWild = txt().includes('Cleaned up');
  ok(txt().includes('Wild Litterbug'), 'wild result screen');
  await click($('cont'), 'continue'); await advance(50);
  ok(SK.tab === 'radar' && !!$('map'), 'back to the map after a wild battle');
  ok(SK.st.wild.n === 1, 'wild battle counted server-side');
  if (wonWild) ok(!MT.M.spawns.some(s => s.id === target.id) && !sel(`[data-mk="w:${target.id}"]`), 'beaten Litterbug disappears from the map');
  // controls
  const z0 = MT.M.zoom; await click($('mzin'), 'zoom in'); await advance(50); ok(MT.M.zoom === Math.min(19, Math.round(z0) + 1), 'zoom in');
  await click($('mzout'), 'zoom out'); await advance(50); ok(MT.M.zoom === Math.round(z0), 'zoom out');
  const tilt0 = MT.prefs.tilt; await click($('mtilt'), '3D toggle'); ok(MT.prefs.tilt === !tilt0 && $('map').className.includes('tilted') === !tilt0, '3D tilt toggles'); await click($('mtilt'), '3D toggle back');
  const c0 = Object.assign({}, MT.M.center); MT.panBy(120, 0); await advance(50);
  ok(MT.M.center.lng < c0.lng && MT.M.follow === false, 'dragging right shows what is west, and stops following');
  await click($('locate'), 'recentre'); await advance(50); ok(MT.M.follow && Math.abs(MT.M.center.lng - geo.lng) < 1e-9, 'recentre button');
  // recycling point sheet -> recycle flow
  geo = { lat: 1.3521, lng: 103.8198 }; MT.setHere(geo); await advance(50);
  await click(sel('.mk.pin'), 'tap bin'); await flush();
  ok(txt().includes('Blue recycling bin') && txt().includes('Blk 1 Test St') && sel('#pdir').getAttribute('href').includes('travelmode=walking'), 'bin sheet with walking directions');
  await click($('rechere'), 'I recycled here'); ok(txt().includes('What are you recycling?'), 'jumps straight into the recycle flow');
  await click($('back'), 'back'); await click(sel('[data-tab="radar"]'), 'map'); await advance(50);
  // nearby list
  await click($('maplist'), 'nearby list'); await flush();
  ok(txt().includes('Return Right') && txt().includes('10¢') && txt().includes('bubble tea'), 'BCRS refund info + eligibility note');
  ok(txt().includes('Blk 1 Test St') && txt().includes("100 m \u00b7"), 'nearest bin listed with distance (~100 m)');
  const items = all('.plist .row'); ok(items.length === 3 && items[0].textContent.includes('Test St'), 'sorted by distance');
  ok(sel('.plist a').getAttribute('href').includes('google.com/maps/dir'), 'directions link');
  ok(txt().includes('OneMap (Singapore Land Authority)'), 'map privacy note in settings');
  await click(sel('[data-k="ewaste"]'), 'filter e-waste'); await advance(50); ok(all('.plist .row').length === 1, 'e-waste filter');
  ok(all('.mk.pin').length === 0, 'filter applies to the map pins too');
  await click(sel('[data-k="all"]'), 'filter all'); await flush();
  const tg = $('tilestog'); const tiles0 = tg.checked; tg.checked = !tiles0; tg.click(); await flush();
  ok(sel('#map').className.includes('no-tiles') === tiles0, 'street map toggle');
  tg.checked = tiles0; tg.click(); await closeSheet(); await advance(50);
  MT.setData({ source: '', points: [] }); await click($('maplist'), 'nearby list'); await flush(); ok(txt().includes('hasn\u2019t loaded'), 'empty data message'); await closeSheet();
  // outside Singapore
  MT.setHere({ lat: 51.5, lng: -0.12 }); await advance(50);
  ok(txt().includes('Outside Singapore') && MT.M.spawns.length === 0, 'outside Singapore: banner, no spawns');
  geo = { lat: 1.3521, lng: 103.8198 }; MT.setHere(geo); await advance(50);
  ok(MT.M.spawns.length > 0, 'back in Singapore');
  // the server never learns where you are
  if (MODE === 'online') { const dump = JSON.stringify(await serverApi.handle({ method: 'GET', path: '/api/state', headers: { authorization: 'Bearer ' + SK.token() } })); ok(!dump.includes('103.81') && !dump.includes('1.352'), 'exact location never reaches the server'); }

  // ---------- settings: reminders ----------
  await click($('settings'), 'settings');
  ok(txt().includes('Friend code'), 'settings shows friend code');
  $('rbyo').value = '06:45'; await click($('rsave'), 'save reminders'); ok(SK.st.reminders.byo === '06:45', 'reminder time saved');
  await click($('ics1'), 'ics daily'); await click($('ics2'), 'ics weekly');
  ok(downloads.length === 2 && downloads[0].text.includes('RRULE:FREQ=DAILY') && downloads[0].text.includes('T064500') && downloads[1].text.includes('FREQ=WEEKLY'), 'calendar reminders downloaded');
  if (MODE === 'online') { const tg = $('pushtog'); ok(!!tg, 'push toggle'); tg.checked = true; tg.click(); await flush(); ok(txt().includes('can\u2019t do push') && tg.checked === false, 'push unsupported: fallback message and toggle resets'); }
  else ok(!$('pushtog'), 'no push toggle offline');
  noEmoji('settings');
  await click($('privacy'), 'privacy'); ok(txt().includes(MODE === 'local' ? 'only on this device' : 'never collect'), 'privacy notice'); await closeSheet();

  // reminder nudge
  T = (Math.floor((T + 8 * G.HOUR) / G.DAY) + 1) * G.DAY - 8 * G.HOUR + 8 * G.HOUR; // next SG day 08:00
  await click(sel('[data-tab="home"]'), 'home'); await click(sel('[data-tab="home"]'), 'home');
  // need fresh state for the new day
  await SK.call('GET', '/api/state'); SK.render();
  ok(txt().includes('No BYO yet today'), 'in-app BYO nudge after reminder time');

  // ---------- season end ----------
  T += 15 * G.DAY; await SK.call('GET', '/api/state'); SK.render();
  ok(!!$('newseason'), 'season over prompt'); await click($('newseason'), 'new season'); ok(SK.st.season === 2 && !SK.st.rewardCode, 'season 2 started, reward reset');

  // ---------- delete ----------
  await click($('settings'), 'settings'); await click($('del'), 'delete'); await flush();
  ok(txt().includes('Delete everything?'), 'delete asks for confirmation');
  await click($('cf-no'), 'cancel delete'); ok(!!SK.st, 'cancel keeps data');
  await click($('settings'), 'settings'); await click($('del'), 'delete'); await flush(); await confirmYes(); await flush(); await flush();
  ok(!SK.st, 'state cleared');
  if (MODE === 'online') {
    ok(!!$('a13'), 'back to age gate after delete');
    const left = await serverApi.handle({ method: 'GET', path: '/api/leaderboard?board=eco', headers: P2.H2 });
    ok(left.body.total === 1, 'deleted player gone from server leaderboard');
    await click($('u13'), 'under 13'); ok(SK.mode === 'local' && txt().includes('nothing leaves this device'), 'under-13 goes to offline mode');
  } else ok(!!$('go') && !ls['skippies2.localdb'], 'local data wiped, welcome shown');

  console.log(`\n[${MODE}] ${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('CRASH [' + MODE + ']:', e && e.stack); process.exit(2); });
