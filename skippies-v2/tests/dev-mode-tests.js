const crypto = require('crypto');
require('../public/engine.js');
const G = globalThis.G;
const { createApi, createMemoryStore } = require('../public/api.js');
const DevMode = require('../public/dev-mode.js');
const { createDemoRuntime } = require('../server/demo.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const T0 = Date.UTC(2026, 10, 25, 2, 0);
let seed = 7;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randomHex = n => crypto.randomBytes(n).toString('hex');
const sha256 = async s => crypto.createHash('sha256').update(s).digest('hex');
const H = t => ({ authorization: 'Bearer ' + t });
const gray = n => Array.from({ length: 72 }, (_, i) => (i * 37 + n * 29) % 256);
function mkApi(store) { return createApi(store, { mode: 'test', now: () => T0, rng, randomHex, sha256 }); }
function mkDemo(store, api) { return DevMode.createRuntime({ store, api, now: () => T0, rng, randomHex, sha256 }); }

(async () => {
  ok(DevMode.envEnabled({ NODE_ENV: 'production' }) === true, 'demo is always enabled in production');
  ok(DevMode.envEnabled({ NODE_ENV: 'production', SKIPPIES_DEMO_MODE: '1' }) === true, 'demo ignores old force-on flag');
  ok(DevMode.envEnabled({ NODE_ENV: 'development', SKIPPIES_DEMO_MODE: '0' }) === true, 'demo ignores old force-off flag');
  ok(DevMode.envEnabled({ NODE_ENV: 'development' }) === true, 'demo is always enabled in development');
  const always = createDemoRuntime({ NODE_ENV: 'production', SKIPPIES_DEMO_MODE: '0' });
  const alwaysR = await always.handle({ method: 'POST', path: '/api/demo/dev/session', headers: {}, body: {} });
  ok(always.enabled === true && alwaysR.status === 200 && !!alwaysR.body.token, 'developer API is always available');

  const realStore = createMemoryStore(), realApi = mkApi(realStore);
  const realCall = (method, path, body, tok) => realApi.handle({ method, path, body, headers: tok ? H(tok) : {} });
  let r = await realCall('POST', '/api/register', { age13: true });
  const real = r.body.token;
  r = await realCall('POST', '/api/action', { item: 'cup', hash: G.dhash(gray(1)), detected: ['cup'] }, real);
  const realDex = Object.keys(r.body.state.dex).length, realRating = r.body.state.arena.rating;
  const before = await realCall('GET', '/api/leaderboard?board=eco&scope=global', null, real);

  const demoStore = createMemoryStore(), runtime = mkDemo(demoStore, mkApi(demoStore));
  const demoPath = path => path.indexOf('/api/demo/') === 0 ? path : path.indexOf('/api/dev/') === 0 ? '/api/demo/dev/' + path.slice(9) : '/api/demo/' + path.slice(5);
  const call = (method, path, body, tok) => runtime.handle({ method, path: demoPath(path), body, headers: tok ? H(tok) : {} });
  const preset = (tok, name) => call('POST', '/api/dev/preset', { preset: name }, tok);

  r = await call('POST', '/api/demo/dev/session', { full: true });
  ok(r.status === 200 && r.body.token && r.body.state.demo === true, 'full demo session created in isolated store');
  const tok = r.body.token, s = r.body.state;
  ok(Object.keys(s.dex).length >= 5 && Object.keys(s.dex).length < G.SPECIES.length, 'full demo unlocks a representative showcase roster');
  ok(s.scrap >= 100 && s.energy === G.C.ENERGY_MAX && s.rolls >= 3 && s.actions.length >= 5, 'full demo has scrap, energy, eggs and habit history');
  ok(s.reusable.nickname === 'Cuppy' && s.arena.rating > G.C.ARENA_START && s.areas.some(a => a.progress >= 2), 'full demo has identity, arena and game progression');
  ok(s.actions.some(a => a.verified && a.item === 'bottle') && new Set(s.actions.map(a => a.adn)).size < 7, 'full demo habit history is realistic, not all perfect');

  r = await preset(tok, 'reset');
  ok(r.status === 200 && Object.keys(r.body.state.dex).length === 0 && r.body.state.scrap <= 10, 'reset returns to a fresh demo player');
  r = await preset(tok, 'unlockAll');
  ok(r.status === 200 && Object.keys(r.body.state.dex).length === G.SPECIES.length, 'unlock all derives the roster from canonical species data');
  r = await preset(tok, 'discoverAll');
  ok(r.status === 200 && r.body.state.dex && Object.keys(r.body.state.dex).length > 0, 'discover all applies to the demo player');
  r = await preset(tok, 'eggs');
  ok(r.status === 200 && r.body.state.lastCatch && r.body.state.lastCatch.id, 'add eggs creates demo hatches');
  r = await preset(tok, 'scrap');
  ok(r.status === 200 && r.body.state.scrap >= 500, 'add scrap works');
  r = await preset(tok, 'energy');
  ok(r.status === 200 && r.body.state.energy === G.C.ENERGY_MAX, 'restore energy works');
  r = await preset(tok, 'maxTeam');
  ok(r.status === 200 && r.body.state.team.length === G.C.TEAM_MAX, 'max demo team works');
  r = await preset(tok, 'mergeReady');
  ok(r.status === 200 && Object.values(r.body.state.dex).some(d => d.copies >= 2), 'merge-ready state has duplicates');
  r = await preset(tok, 'habitMonth');
  const monthStats = G.habitStats(r.body.state, T0);
  ok(r.status === 200 && monthStats.longest >= 4 && monthStats.successful < 28, 'strong month preset creates a realistic streak');
  r = await preset(tok, 'habitMaxToday');
  ok(r.status === 200 && r.body.state.actions.filter(a => a.adn === G.adnOf(T0)).length >= G.C.MAX_ACTIONS_PER_DAY, 'daily-limit state reaches the real cap');

  await preset(tok, 'full');
  r = await call('GET', '/api/dev/opponent', null, tok);
  ok(r.status === 200 && r.body.opponent.id.indexOf('demo-') === 0 && r.body.opponent.team.length > 0, 'demo arena opponent is seeded and non-bot');
  r = await call('POST', '/api/demo/dev/battle', { kind: 'arena', ranked: true, result: 'win' }, tok);
  ok(r.status === 200 && r.body.detail && r.body.detail.ranked === true && r.body.state.demo === true, 'demo ranked arena resolves with isolated Elo');
  const after = await realCall('GET', '/api/leaderboard?board=eco&scope=global', null, real);
  const realState = await realCall('GET', '/api/state', null, real);
  ok(after.body.total === before.body.total && realState.body.state.arena.rating === realRating && Object.keys(realState.body.state.dex).length === realDex, 'demo arena never touches real Elo or leaderboard');

  for (const [name, reward] of [['rewardNone', null], ['rewardAlmost', null], ['rewardEligible', null], ['rewardAvailable', 'DEMO MamaShop sticker'], ['rewardClaimed', 'DEMO MamaShop sticker'], ['rewardRedeemed', 'DEMO MamaShop sticker']]) {
    r = await preset(tok, name);
    ok(r.status === 200 && r.body.state.demo === true, name + ' preset applied');
    if (reward) ok((r.body.state.claims || []).some(c => c.reward === reward && c.id.indexOf('demo-') === 0), name + ' has a demo-only claim');
  }
  await preset(tok, 'rewardAvailable');
  r = await call('POST', '/api/demo/rewards/claim', {}, tok);
  ok(r.status === 200 && r.body.claim.reward === 'DEMO MamaShop sticker' && r.body.claim.id.indexOf('demo-') === 0, 'demo reward claim is labelled and prefixed');
  r = await call('POST', '/api/demo/rewards/redeem', { id: r.body.claim.id }, tok);
  ok(r.status === 200 && r.body.state.claims[0].status === 'redeemed', 'demo redemption stays in demo store');
  ok((await realStore.list('claims')).length === 0, 'no demo claim is written to the real store');
  r = await realCall('GET', '/api/rewards/claim', null, real);
  ok(r.status === 200 && !r.body.claim, 'real player has no demo claim');

  await preset(tok, 'season');
  r = await call('GET', '/api/season/recap', null, tok);
  ok(r.status === 200 && r.body.recap.reward === true && r.body.recap.season >= 2, 'demo season recap is generated from demo state');
  r = await call('GET', '/api/demo/dev/session', null, tok);
  ok(r.status === 200 && r.body.state.demo === true && r.body.state.season >= 2, 'refreshing a demo session restores demo state safely');
  const fresh = await call('POST', '/api/demo/dev/session', {});
  ok(fresh.status === 200 && fresh.body.token !== tok && fresh.body.state.id.indexOf('demo-') === 0, 'a new demo session is fresh and isolated');
  ok(!(await demoStore.list('players')).some(p => p.id === realState.body.state.id), 'real player never exists in the demo store');
  ok(!(await realStore.list('players')).some(p => p.id.indexOf('demo-') === 0), 'demo players never exist in the real store');

  console.log(`dev-mode: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('CRASH', e.stack); process.exit(2); });
