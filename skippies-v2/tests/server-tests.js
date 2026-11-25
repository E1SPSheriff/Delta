// SKIPPIES v2 server/API tests (no network needed). Usage: node tests/server-tests.js
const crypto = require('crypto'), { Readable } = require('stream');
require('../public/engine.js'); const G = globalThis.G;
const { createApi, createMemoryStore } = require('../public/api.js');
const { createSqliteStore } = require('../server/store-sqlite.js');
const { makeHandler } = require('../server/server.js');
const wp = require('../server/webpush.js');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const T0 = Date.UTC(2026, 11, 2, 4, 0); // Wed 2 Dec 2026 12:00 SGT
function mkApi(store, clock) {
  let seed = 42; const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  return createApi(store, { now: () => clock.t, rng, randomHex: n => crypto.randomBytes(n).toString('hex'), sha256: async s => crypto.createHash('sha256').update(s).digest('hex'), onError: e => console.error(e) });
}
const H = tok => ({ authorization: 'Bearer ' + tok });
let hashN = 1; const freshHash = () => { let h; do { h = crypto.randomBytes(8).toString('hex'); } while (G.hamming(h, '0000000000000000') < 10 || G.hamming(h, '0000000000000000') > 54); return h; };

async function suite(label, store) {
  const clock = { t: T0 }, api = mkApi(store, clock);
  const call = (method, path, body, tok) => api.handle({ method, path, body, headers: tok ? H(tok) : {} });
  // register / age gate
  let r = await call('POST', '/api/register', { age13: false }); ok(r.status === 403 && r.body.error === 'age', label + ' age gate');
  r = await call('POST', '/api/register', { age13: true }); ok(r.status === 200 && /^[0-9a-f]{64}$/.test(r.body.token) && G.validName(r.body.state.name), label + ' register');
  const A = r.body.token; let st = r.body.state;
  ok((await call('GET', '/api/state', null, 'f'.repeat(64))).status === 401, label + ' bad token');
  ok((await call('GET', '/api/state')).status === 401, label + ' no token');
  ok(!(await store.list('tokens')).some(t => JSON.stringify(t).includes(A)), label + ' token stored hashed only');
  // action validation
  const h1 = freshHash();
  r = await call('POST', '/api/action', { item: 'cup', hash: h1, detected: ['person'] }, A); ok(r.status === 400 && r.body.error === 'notdetected', label + ' detection required');
  r = await call('POST', '/api/action', { item: 'cup', hash: 'zz', detected: ['cup'] }, A); ok(r.body.error === 'hash', label + ' hash format');
  r = await call('POST', '/api/action', { item: 'cup', hash: '0000000000000000', detected: ['cup'] }, A); ok(r.body.error === 'lowdetail', label + ' blank photo rejected');
  r = await call('POST', '/api/action', { item: 'nope', hash: h1, detected: ['cup'] }, A); ok(r.body.error === 'item', label + ' item');
  r = await call('POST', '/api/action', { item: 'cup', hash: h1, detected: ['cup'] }, A);
  ok(r.status === 200 && r.body.result.hatched.length >= 1 && r.body.state.actions.length === 1 && r.body.state.energy === 5, label + ' first action hatches');
  ok(!JSON.stringify(r.body.state).includes(h1), label + ' hash not echoed in state');
  r = await call('POST', '/api/action', { item: 'cup', hash: freshHash(), detected: ['cup'] }, A); ok(r.body.error === 'cooldown', label + ' cooldown');
  clock.t += 61000;
  // duplicate photo: exact and near (2 bits flipped)
  r = await call('POST', '/api/action', { item: 'cup', hash: h1, detected: ['cup'] }, A); ok(r.status === 409 && r.body.error === 'duplicate', label + ' exact duplicate');
  const near = (parseInt(h1.slice(0, 2), 16) ^ 0x03).toString(16).padStart(2, '0') + h1.slice(2);
  r = await call('POST', '/api/action', { item: 'cup', hash: near, detected: ['cup'] }, A); ok(r.status === 409, label + ' near-duplicate (2 bits)');
  // other player can't reuse the same photo either
  const B = (await call('POST', '/api/register', { age13: true })).body.token;
  r = await call('POST', '/api/action', { item: 'bev', hash: h1, detected: ['bottle'] }, B); ok(r.status === 409, label + ' cross-player duplicate');
  r = await call('POST', '/api/action', { item: 'bev', hash: freshHash(), detected: ['bottle'] }, B); ok(r.status === 200 && r.body.result.scrap === 30 && r.body.result.kind === 'recycle', label + ' recycle gives 30 scrap');
  // daily cap 6
  for (let i = 0; i < 5; i++) { clock.t += 61000; r = await call('POST', '/api/action', { item: 'bottle', hash: freshHash(), detected: ['bottle'] }, A); }
  clock.t += 61000; r = await call('POST', '/api/action', { item: 'bottle', hash: freshHash(), detected: ['bottle'] }, A); ok(r.body.error === 'limit', label + ' 6/day');
  r = await call('POST', '/api/selfreport', { item: 'cup' }, A); ok(r.status === 200 && r.body.state.actions.filter(a => !a.verified).length === 1, label + ' self-report logged');
  st = (await call('GET', '/api/state', null, A)).body.state;
  ok(G.ecoScore(st) === 6 && st.energy === 10, label + ' eco 6 (self-report excluded), energy capped');
  // rinse
  r = await call('POST', '/api/rinse', {}, A); ok(r.status === 200 && r.body.state.dex.bubbles, label + ' rinse -> bubbles');
  ok((await call('POST', '/api/rinse', {}, A)).body.error === 'done', label + ' rinse once');
  ok((await call('POST', '/api/rinse', {}, B)).body.error === 'nobyo', label + ' rinse needs BYO');
  // merge/train
  st = (await call('GET', '/api/state', null, A)).body.state;
  const dupId = Object.keys(st.dex).find(id => st.dex[id].copies >= 1);
  if (dupId) { r = await call('POST', '/api/merge', { id: dupId }, A); ok(r.status === 200 && r.body.state.dex[dupId].stars === 2, label + ' merge to 2★'); }
  else ok(true, label + ' (no dup to merge this seed)');
  ok((await call('POST', '/api/merge', { id: 'semakoral' }, A)).body.error === 'missing', label + ' merge missing');
  const tid = st.team[0], sc = st.scrap;
  r = await call('POST', '/api/train', { id: tid, scrap: 10 }, A); ok(r.status === 200 && r.body.state.scrap === sc - 10, label + ' train spends scrap');
  ok((await call('POST', '/api/train', { id: tid, scrap: 99999 }, A)).body.error === 'amount', label + ' train amount cap');
  ok((await call('POST', '/api/team', { ids: ['semakoral'] }, A)).body.error === 'team', label + ' team validation');
  ok((await call('POST', '/api/team', { ids: [tid, tid] }, A)).body.error === 'team', label + ' team no dupes');
  // player names: own name (3-20, filtered, unique) or a random one; one change per 7 days
  const badNames = { 'F*ck It': 'chars', 'Sh1t Lord': 'blocked', 'lan jiao': 'blocked', 'Admin Bob': 'reserved', ab: 'length', ['x'.repeat(21)]: 'length', 'Tan 91234567': 'digits', '': 'empty', '1234': 'letters' };
  for (const [n, why] of Object.entries(badNames)) { r = await call('POST', '/api/name', { name: n }, A); ok(r.status === 400 && r.body.error === 'name' && r.body.reason === why && !!r.body.message, label + ' name rejected (' + why + '): ' + n); }
  r = await call('POST', '/api/name', { name: { x: 1 } }, A); ok(r.status === 400 && r.body.error === 'name', label + ' non-string name rejected');
  r = await call('POST', '/api/name', { name: 'Kopi Hero' }, B); ok(r.status === 200 && r.body.state.name === 'Kopi Hero' && r.body.state.nameSetAt === clock.t, label + ' own name saved');
  r = await call('POST', '/api/name', { name: '  kopi   HERO ' }, A); ok(r.status === 409 && r.body.error === 'taken', label + ' duplicate name (any case/spacing) rejected');
  r = await call('GET', '/api/name-check?name=Kopi%20Hero', null, A); ok(r.body.ok === false && r.body.reason === 'taken', label + ' name-check: taken');
  r = await call('GET', '/api/name-check?name=Kopi%20Hero', null, B); ok(r.body.ok === true, label + ' name-check: own name is fine');
  r = await call('GET', '/api/name-check?name=Sh1t', null, A); ok(r.body.ok === false && r.body.reason === 'blocked', label + ' name-check: filter');
  r = await call('POST', '/api/name', { name: '  Kopi   Queen 2 ' }, A); ok(r.status === 200 && r.body.state.name === 'Kopi Queen 2', label + ' name spaces tidied');
  r = await call('POST', '/api/name', { name: 'Kopi Queen 2' }, A); ok(r.status === 200, label + ' saving the same name is a no-op');
  const nm = (await call('GET', '/api/names')).body.names[0];
  r = await call('POST', '/api/name', { name: nm }, A); ok(r.status === 403 && r.body.error === 'namecooldown' && r.body.next === clock.t + 7 * G.DAY && /again on/.test(r.body.message), label + ' 1 name change per 7 days');
  { const pa = (await store.list('players')).find(x => x.name === 'Kopi Queen 2'); pa.nameSetAt -= 7 * G.DAY; await store.put('players', pa.id, pa); }
  r = await call('POST', '/api/name', { name: nm }, A); ok(r.status === 200 && r.body.state.name === nm, label + ' random name allowed after 7 days');
  ok((await call('GET', '/api/names')).body.names.every(n => G.checkName(n).ok), label + ' random names pass the filter');
  // zone
  ok((await call('PUT', '/api/zone', { zone: 'u4pru' }, A)).body.error === 'zone', label + ' non-SG zone rejected');
  const zone = G.geohash(1.3099, 103.7775, 5); ok(G.validZone(zone), label + ' SP campus geohash valid ' + zone);
  ok((await call('PUT', '/api/zone', { zone }, A)).body.state.zone === zone, label + ' set zone');
  // campaign: tutorial, replay verification, tamper rejection
  r = await call('POST', '/api/campaign/start', { area: 0, fight: 0 }, A); ok(r.status === 200 && r.body.battle.tutorial && r.body.ticket, label + ' campaign start');
  let bt = G.clone(r.body.battle), rng = G.mulberry32(bt.seed); const acts = [];
  while (!bt.over && acts.length < 60) { const a = { kind: 'move', move: 'type' }; G.act(bt, a, rng); acts.push(a); }
  const ticket = r.body.ticket;
  r = await call('POST', '/api/campaign/finish', { ticket, actions: acts.concat([{ kind: 'move', move: 'type' }]) }, A); ok(r.body.error === 'replay' && r.body.detail === 'extra', label + ' extra actions rejected');
  r = await call('POST', '/api/campaign/finish', { ticket, actions: acts }, A); ok(r.body.error === 'ticket', label + ' ticket single-use');
  r = await call('POST', '/api/campaign/start', { area: 0, fight: 0 }, A); bt = G.clone(r.body.battle); rng = G.mulberry32(bt.seed); const a2 = [];
  while (!bt.over && a2.length < 60) { const a = { kind: 'move', move: 'type' }; G.act(bt, a, rng); a2.push(a); }
  r = await call('POST', '/api/campaign/finish', { ticket: r.body.ticket, actions: a2 }, A);
  ok(r.status === 200 && r.body.result.result === bt.result && (bt.result !== 'win' || r.body.state.areas[0].progress === 1), label + ' server replay matches client (' + bt.result + ')');
  r = await call('POST', '/api/campaign/start', { area: 2, fight: 0 }, A); ok(r.body.error === 'locked', label + ' locked area');
  r = await call('POST', '/api/campaign/start', { area: 0, fight: 3 }, A); ok(r.body.error === 'order', label + ' fight order');
  // ticket expiry
  r = await call('POST', '/api/campaign/start', { area: 0, fight: 0 }, A); const exp = r.body.ticket; clock.t += 31 * 60000;
  ok((await call('POST', '/api/campaign/finish', { ticket: exp, actions: [] }, A)).body.error === 'expired', label + ' ticket expiry');
  // arena: opponents include B (real) + bots; friend code
  await call('PUT', '/api/zone', { zone }, B);
  r = await call('GET', '/api/arena/opponents', null, A);
  const list = r.body.list; ok(list.some(x => !x.bot && x.near) && list.some(x => x.bot && /practice bot/.test(x.name)), label + ' opponents: nearby real + labelled bots');
  ok(list.every(x => !('zone' in x) && !('friendCode' in x) && !('actions' in x)), label + ' opponent cards leak no zone/code/history');
  const stB = (await call('GET', '/api/state', null, B)).body.state;
  r = await call('GET', '/api/arena/code/' + stB.friendCode.toLowerCase(), null, A); ok(r.status === 200 && r.body.opponent.name === stB.name, label + ' friend code lookup');
  ok((await call('GET', '/api/arena/code/AAAAAA', null, A)).status === 404, label + ' unknown code');
  const rA0 = (await call('GET', '/api/state', null, A)).body.state.arena.rating;
  r = await call('POST', '/api/arena/start', { oppId: list.find(x => !x.bot).id }, A); ok(r.status === 200 && r.body.battle.mode === 'pvp' && r.body.battle.enemies.every(e => e.ghost), label + ' arena start');
  bt = G.clone(r.body.battle); rng = G.mulberry32(bt.seed); const a3 = [];
  while (!bt.over && a3.length < 80) { const a = { kind: 'move', move: 'type' }; G.act(bt, a, rng); a3.push(a); }
  r = await call('POST', '/api/arena/finish', { ticket: r.body.ticket, actions: a3 }, A);
  const stB2 = (await call('GET', '/api/state', null, B)).body.state;
  ok(r.status === 200 && r.body.state.arena.rating === rA0 + r.body.result.delta && stB2.arena.rating === 1000 - Math.round(r.body.result.delta / 2), label + ' elo defender gets half (' + bt.result + ', ' + r.body.result.delta + ')');
  ok((await call('POST', '/api/arena/finish', { ticket: 'x', actions: [] }, A)).body.error === 'ticket', label + ' arena bad ticket');
  // leaderboards: real players only, ranks, zone scope
  r = await call('GET', '/api/leaderboard?board=ecoweek&scope=global', null, A);
  ok(r.body.rows.length === 2 && r.body.rows[0].score === 6 && r.body.rows[0].me && r.body.rows.every(x => !/bot/.test(x.name)), label + ' eco leaderboard');
  ok((await call('GET', '/api/leaderboard?board=arena', null, A)).body.rows.length === 2, label + ' arena leaderboard');
  r = await call('GET', '/api/leaderboard?board=eco&scope=zone', null, A); ok(r.body.scope === 'zone' && r.body.total === 2, label + ' zone leaderboard');
  await call('DELETE', '/api/zone', null, A);
  ok((await call('GET', '/api/leaderboard?scope=zone', null, A)).body.error === 'nozone', label + ' zone needs opt-in');
  // scanner challenge, habit stats, reusable identity, server-backed claims
  clock.t += G.DAY;
  r = await call('POST', '/api/capture/challenge', {}, A);
  const nonce = r.body.nonce;
  ok(/^[0-9a-f]{24}$/.test(nonce), label + ' scanner challenge nonce issued');
  clock.t += 61000;
  r = await call('POST', '/api/action', { item: 'cup', hash: freshHash(), detected: ['cup'], nonce: 'wrong' }, A);
  ok(r.body.error === 'scanner', label + ' scanner nonce required when challenged');
  r = await call('POST', '/api/action', { item: 'cup', hash: freshHash(), detected: ['cup'], nonce }, A);
  ok(r.status === 200, label + ' valid scanner nonce allows action');
  ok((await call('GET', '/api/state', null, A)).body.state.capture === null, label + ' scanner nonce is single-use');
  const claimPlayer = await store.get('players', st.id);
  claimPlayer.actions = Array.from({ length: 5 }, (_, i) => ({ adn: claimPlayer.startAdn + i, ts: clock.t + i * 60000, season: claimPlayer.season, kind: 'byo', item: 'cup', verified: true, together: false, family: false }));
  claimPlayer.rewardCode = 'SKIP-ABCDE'; claimPlayer.rewardSeason = claimPlayer.season;
  await store.put('players', claimPlayer.id, claimPlayer);
  r = await call('GET', '/api/habits', null, A);
  ok(r.body.habit.successful === 5 && r.body.reusable.potentiallyAvoided === 5, label + ' habit/reusable stats from verified days');
  r = await call('GET', '/api/season/recap', null, A);
  ok(r.body.recap.byoDays === 5 && r.body.recap.reward === true && r.body.daysLeft >= 0, label + ' season recap');
  r = await call('POST', '/api/identity/reusable', { nickname: 'Kopi Cup' }, A);
  ok(r.status === 200 && r.body.nickname === 'Kopi Cup' && r.body.state.reusable.nickname === 'Kopi Cup', label + ' reusable identity saved');
  ok((await call('POST', '/api/identity/reusable', { nickname: 'Admin Bob' }, A)).body.error === 'name', label + ' reusable identity uses name filter');
  ok((await call('GET', '/api/rewards/claim', null, A)).body.eligible === true, label + ' claim eligibility from verified days');
  const claims = await Promise.all([call('POST', '/api/rewards/claim', {}, A), call('POST', '/api/rewards/claim', {}, A)]);
  const claim = claims[0].body.claim;
  ok(claims[0].status === 200 && claims[1].status === 200 && claims[0].body.claim.id === claims[1].body.claim.id, label + ' concurrent claim requests issue one claim');
  ok(/^MamaShop /.test(claim.reward) && !/MAMA|EISTEN/.test(claim.id + claim.reward), label + ' claim has a safe reward');
  r = await call('POST', '/api/rewards/redeem', { id: claim.id }, A);
  ok(r.status === 200 && r.body.state.claims.find(c => c.id === claim.id).status === 'redeemed', label + ' claim marked redeemed');
  ok((await call('POST', '/api/rewards/redeem', { id: claim.id }, A)).status === 404, label + ' claim cannot be redeemed twice');
  // reminders + push
  ok((await call('POST', '/api/reminders', { byo: '25:00' }, A)).body.error === 'time', label + ' reminder validation');
  await call('POST', '/api/reminders', { byo: '07:30', recycleDow: 6, recycleTime: '10:00' }, A);
  ok((await call('POST', '/api/push', { subscription: { endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } } }, A)).body.error === 'subscription', label + ' push needs https');
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys(); const auth = wp.b64u(crypto.randomBytes(16));
  const sub = { endpoint: 'https://push.example.com/abc', keys: { p256dh: wp.b64u(ua.getPublicKey()), auth } };
  r = await call('POST', '/api/push', { subscription: sub }, A); ok(r.body.push === true && !('push' in r.body.state), label + ' push saved, not echoed');
  clock.t = Date.UTC(2026, 11, 5, 23, 31); // Sun 6 Dec 07:31 SGT
  let due = await api.dueReminders(); ok(due.length === 1 && due[0].payload.tag === 'byo', label + ' BYO reminder due 07:31');
  ok((await api.dueReminders()).length === 0, label + ' reminder sent once');
  clock.t = Date.UTC(2026, 11, 5, 2, 5); // Sat 5 Dec 10:05 SGT
  due = await api.dueReminders(); ok(due.some(d => d.payload.tag === 'recycle'), label + ' weekly recycle reminder Saturday 10:05');
  const req = wp.buildRequest(sub, due[0].payload, wp.generateVapidKeys(), 'mailto:t@example.com');
  ok(JSON.parse(wp.decrypt(req.body, wp.b64u(ua.getPrivateKey()), sub.keys.p256dh, auth)).tag === due[0].payload.tag && /^vapid t=.+, k=/.test(req.headers.Authorization), label + ' push payload decrypts');
  // delete account removes everything
  r = await call('DELETE', '/api/me', null, A); ok(r.body.deleted, label + ' delete');
  ok((await call('GET', '/api/state', null, A)).status === 401, label + ' token dead after delete');
  ok(!(await store.list('hashes')).some(h => h.playerId === st.id), label + ' photo hashes deleted');
  ok((await call('GET', '/api/odds')).body.rarity.reduce((s, x) => s + x.odds, 0) === 100, label + ' odds sum 100');
  ok((await call('GET', '/api/nope', null, B)).status === 404, label + ' 404');
  ok((await api.handle({ method: 'POST', path: '/api/register', body: '{bad', headers: {} })).status === 400, label + ' bad json');
}

// VAPID JWT verifies with the public key
(function () {
  const v = wp.generateVapidKeys(); const jwt = wp.vapidJwt('https://push.example.com', 'mailto:a@b.c', v, 2000000000);
  const [h, c, s] = jwt.split('.'); const pub = wp.unb64u(v.publicKey);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: wp.b64u(pub.subarray(1, 33)), y: wp.b64u(pub.subarray(33)) }, format: 'jwk' });
  ok(crypto.verify('sha256', Buffer.from(h + '.' + c), { key, dsaEncoding: 'ieee-p1363' }, wp.unb64u(s)), 'VAPID JWT signature verifies');
  ok(JSON.parse(wp.unb64u(c)).aud === 'https://push.example.com', 'VAPID aud');
})();

// HTTP layer (mock req/res, no sockets)
async function httpCall(handler, method, url, body, headers) {
  return new Promise(resolve => {
    const req = Readable.from(body ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []);
    req.method = method; req.url = url; req.headers = headers || {}; req.socket = { remoteAddress: '1.2.3.4' };
    const res = { writeHead(s, h) { this.s = s; this.h = h; }, end(d) { resolve({ status: this.s, headers: this.h, body: d ? d.toString() : '' }); } };
    handler(req, res);
  });
}
(async () => {
  await suite('[memory]', createMemoryStore());
  await suite('[sqlite]', createSqliteStore(':memory:'));
  const store = createSqliteStore(':memory:'), clock = { t: T0 }, api = mkApi(store, clock);
  const hd = makeHandler({ api, vapid: { publicKey: 'PUB' }, rateLimit: 5 });
  let r = await httpCall(hd, 'GET', '/'); ok(r.status === 200 && /SKIPPIES/.test(r.body) && r.headers['Content-Security-Policy'], 'serves index with CSP');
  r = await httpCall(hd, 'GET', '/../server/server.js'); ok(r.status === 403 || r.status === 404, 'no path traversal');
  r = await httpCall(hd, 'GET', '/%2e%2e/server/server.js'); ok(r.status === 403 || r.status === 404, 'no encoded traversal');
  r = await httpCall(hd, 'GET', '/config.js'); ok(/SKIPPIES_SERVER/.test(r.body), 'config.js');
  r = await httpCall(hd, 'GET', '/api/push/key'); ok(JSON.parse(r.body).publicKey === 'PUB', 'push key');
  r = await httpCall(hd, 'POST', '/api/register', { age13: true }); ok(r.status === 200 && JSON.parse(r.body).token, 'register via HTTP');
  for (let i = 0; i < 5; i++) r = await httpCall(hd, 'GET', '/api/health');
  ok(r.status === 429 && r.headers['Retry-After'] === '60', 'rate limited after 5/min default bucket with Retry-After');
  ok(!/jsdelivr|[^a-z-]unsafe-eval/.test(r.headers['Content-Security-Policy']), 'CSP has no CDN scripts or plain unsafe-eval');
  r = await httpCall(hd, 'GET', '/%E0%A4%A'); ok(r.status === 400 && JSON.parse(r.body).error === 'badurl', 'malformed URL rejected cleanly');
  r = await httpCall(hd, 'POST', '/api/register', 'x'.repeat(17000), { 'content-type': 'application/json' }); ok(r.status === 413, 'oversized request rejected');
  const hop = makeHandler({ api, vapid: { publicKey: 'PUB' }, rateLimit: 2, trustedProxies: ['10.0.0.1'] });
  for (let i = 0; i < 3; i++) r = await httpCall(hop, 'GET', '/api/health', null, { 'x-forwarded-for': '2.2.2.2, 10.0.0.1' });
  ok(r.status === 429, 'trusted proxy honours forwarded client ip');
  r = await httpCall(hop, 'GET', '/api/health', null, { 'x-forwarded-for': '3.3.3.3, 10.0.0.1' });
  ok(r.status === 200, 'different forwarded client gets a separate bucket');
  const noProxy = makeHandler({ api, vapid: { publicKey: 'PUB' }, rateLimit: 1 });
  await httpCall(noProxy, 'GET', '/api/health', null, { 'x-forwarded-for': '2.2.2.2' });
  r = await httpCall(noProxy, 'GET', '/api/health', null, { 'x-forwarded-for': '3.3.3.3' });
  ok(r.status === 429, 'untrusted X-Forwarded-For is ignored');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
