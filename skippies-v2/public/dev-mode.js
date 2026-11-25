(function (root) {
  'use strict';
  const G = root.G || (typeof require === 'function' ? (require('./engine.js'), root.G) : null);
  const C = G.C;
  const DEMO_REWARD = 'DEMO MamaShop sticker';
  const DEMO_ID = 'demo-';

  function envEnabled() { return true; }
  function dayTs(adn) { return adn * G.DAY + 17 * G.HOUR; }
  function addVerified(p, adn, item, ts) {
    const it = G.ITEMS[item];
    if (!it) return;
    p.actions.push({ adn, ts, season: p.season, kind: it.kind, item, verified: true, together: false, family: false });
  }
  function setSeasonDays(p, count, t) {
    const adn = G.adnOf(t), n = Math.max(0, Math.min(C.SEASON_DAYS, count | 0));
    p.actions = []; p.season = 2; p.startAdn = adn - 6;
    p.lastActionTs = t - 15 * 60 * 1000; p.dailyAdn = adn;
    for (let i = n - 1; i >= 0; i--) addVerified(p, adn - i, 'cup', dayTs(adn - i));
    p.rewardCode = n >= C.STAR_DAYS ? 'SKIP-DEMO2' : null;
    p.rewardSeason = p.rewardCode ? p.season : null;
    p.claims = [];
    return n;
  }
  function freshDemo(p, now, rng, id) {
    const t = now(), q = G.newPlayer(id || DEMO_ID + Math.floor(rng() * 0xffffffff).toString(16), t, rng);
    q.name = 'Demo Ranger 482';
    q.reusable.nickname = 'Cuppy';
    q.zone = G.geohash(1.3099, 103.7775, 5);
    return G.sanitizePlayer(q, t);
  }
  function bestTeam(p) {
    const ids = Object.keys(p.dex).sort((a, c) => G.power(p, c) - G.power(p, a)).slice(0, C.TEAM_MAX);
    if (ids.length) { G.setTeam(p, ids); p.buddy = ids[0]; }
    return p.team.slice();
  }
  function buildFullDemo(p, now, rng) {
    const t = now(), adn = G.adnOf(t);
    const q = G.sanitizePlayer(Object.assign({}, p, {
      name: 'Demo Ranger 482', season: 2, startAdn: adn - 6,
      reusable: { nickname: 'Cuppy' }, zone: G.geohash(1.3099, 103.7775, 5)
    }), t);
    q.tutorialDone = true; q.finished = false; q.energy = C.ENERGY_MAX; q.scrap = 480;
    q.rolls = 27; q.pity = 2; q.dailyAdn = adn; q.lastActionTs = t - 15 * 60 * 1000;
    q.areas = G.AREAS.map((_, i) => ({ progress: [4, 4, 2, 0, 0][i] || 0 }));
    q.litterCleaned = 22; q.battlesWon = 14;
    q.mileage = Object.create(null);
    Object.keys(G.TYPES).forEach(k => { q.mileage[k] = 9; }); q.mileage.recycle = 8;
    const all = G.SPECIES.filter(s => s.source !== 'recipe'), picks = [];
    G.RARITY_KEYS.forEach(r => {
      const list = all.filter(s => s.rarity === r), n = r === 'common' ? 3 : r === 'uncommon' ? 2 : 1;
      picks.push.apply(picks, list.slice(0, n));
    });
    if (G.SP.bubbles) picks.push(G.SP.bubbles);
    if (G.SP.weekend) picks.push(G.SP.weekend);
    picks.forEach((sp, i) => {
      G.addCopy(q, sp.id, adn - 5);
      const d = q.dex[sp.id], stars = i < 2 ? 5 : i < 4 ? 3 : i < 7 ? 2 : 1;
      d.stars = stars; d.stage = G.evoStage(sp, stars); d.copies = i < 2 ? 3 : 2;
      d.level = Math.max(1, 20 - i); d.xp = 0; d.first = adn - 9 + i;
    });
    const habitDays = [adn - 6, adn - 5, adn - 3, adn - 2, adn];
    habitDays.forEach(d => addVerified(q, d, 'cup', dayTs(d)));
    addVerified(q, adn - 5, 'bottle', dayTs(adn - 5));
    addVerified(q, adn - 1, 'bottle', dayTs(adn - 1));
    q.actions[q.actions.length - 1] = { adn: adn - 1, ts: dayTs(adn - 1), season: 1, kind: 'recycle', item: 'bottle', verified: true, together: false, family: false };
    q.rewardCode = 'SKIP-DEMO2'; q.rewardSeason = q.season; q.claims = []; q.capture = null;
    q.arena = { rating: 1280, wins: 12, losses: 6, rankedWins: 5, rankedLosses: 3, rankedDay: adn, rankedPlayed: 2, lastOppId: null, lastOppTs: 0 };
    q.arenaHistory = [{ oppId: DEMO_ID + 'rival', adn: adn - 1, ts: t - G.DAY, ranked: true }, { oppId: DEMO_ID + 'rival', adn: adn - 2, ts: t - 2 * G.DAY, ranked: false }];
    bestTeam(q);
    return G.sanitizePlayer(q, t);
  }
  function unlockAll(p, now) {
    const t = now(), adn = G.adnOf(t), q = G.clone(p);
    G.SPECIES.forEach((sp, i) => {
      G.addCopy(q, sp.id, adn);
      const d = q.dex[sp.id], stars = C.MAX_STARS;
      d.stars = stars; d.stage = G.evoStage(sp, stars); d.copies = 2;
      d.level = Math.max(1, C.MAX_LEVEL - (i % 5)); d.xp = 0; d.first = adn - 20;
    });
    bestTeam(q);
    return G.sanitizePlayer(q, t);
  }
  function discoverAll(p, now) {
    const t = now(), adn = G.adnOf(t), q = G.clone(p);
    G.SPECIES.forEach(sp => {
      G.addCopy(q, sp.id, adn);
      const d = q.dex[sp.id];
      d.stars = 1; d.stage = 0; d.copies = 1; d.level = 5; d.first = adn - 10;
    });
    return G.sanitizePlayer(q, t);
  }
  function addEggs(p, n, now, rng) {
    const t = now(), adn = G.adnOf(t), q = G.clone(p), out = [];
    const it = G.ITEMS[G.BYO_ITEMS[0]];
    for (let i = 0; i < Math.max(1, Math.min(12, n | 0)); i++) {
      const rarity = G.rollRarity(q, rng), sp = G.rollSpecies(rarity, it.type, rng);
      out.push({ id: sp, rarity, isNew: G.addCopy(q, sp, adn) });
    }
    q.lastCatch = out[out.length - 1] ? { id: out[out.length - 1].id, ts: t } : q.lastCatch;
    return { player: G.sanitizePlayer(q, t), info: out };
  }
  function habitPreset(p, kind, now, rng) {
    const t = now(), adn = G.adnOf(t), q = G.clone(p);
    if (kind === 'new') {
      q.actions = []; q.rewardCode = null; q.rewardSeason = null; q.claims = [];
      q.startAdn = adn; q.season = 2; q.lastActionTs = 0;
    } else if (kind === 'month') {
      q.season = 2; q.startAdn = adn - 27; q.actions = []; q.lastActionTs = t - 15 * 60 * 1000;
      for (let i = 27; i >= 0; i--) {
        const d = adn - i, off = 27 - i;
        if (off % 5 !== 2 && off % 7 !== 0) addVerified(q, d, 'cup', dayTs(d));
        if (off % 6 === 3) addVerified(q, d, 'bottle', dayTs(d));
      }
    } else {
      const days = kind === '3' ? [2, 1, 0] : [6, 5, 2, 1, 0];
      setSeasonDays(q, days.length, t);
      q.actions = [];
      days.forEach(i => addVerified(q, adn - i, 'cup', dayTs(adn - i)));
      if (kind === '7') addVerified(q, adn - 5, 'bottle', dayTs(adn - 5));
    }
    q.rolls = Math.max(q.rolls, G.verifiedActions(q).length);
    q.rewardCode = G.seasonActionDays(q) >= C.STAR_DAYS ? 'SKIP-DEMO2' : null;
    q.rewardSeason = q.rewardCode ? q.season : null;
    return G.sanitizePlayer(q, t);
  }
  function habitMaxToday(p, now) {
    const t = now(), adn = G.adnOf(t), q = G.clone(p);
    q.actions = q.actions.filter(a => a.adn !== adn); q.lastActionTs = t - 15 * 60 * 1000;
    for (let i = 0; i < C.MAX_ACTIONS_PER_DAY; i++) addVerified(q, adn, 'cup', t - (20 + i) * 60 * 1000);
    return G.sanitizePlayer(q, t);
  }
  function demoClaim(p, t, rng, status) {
    return {
      id: DEMO_ID + Math.floor(rng() * 0xffffffff).toString(16),
      codeHash: DEMO_ID + Math.floor(rng() * 0xffffffff).toString(16),
      reward: DEMO_REWARD, created: t, status: status || 'active',
      redeemedAt: status === 'redeemed' ? t : null, season: p.season
    };
  }
  function rewardPreset(p, stage, now, rng) {
    const t = now(), q = G.clone(p);
    const need = { none: 3, almost: 4, eligible: 5, available: 5, claimed: 5, redeemed: 5 }[stage] || 3;
    setSeasonDays(q, need, t);
    if (stage === 'available' || stage === 'claimed' || stage === 'redeemed') {
      q.claims = [demoClaim(q, t, rng, stage === 'redeemed' ? 'redeemed' : 'active')];
    }
    return G.sanitizePlayer(q, t);
  }
  function mergeReady(p, now) {
    const t = now(), q = G.clone(p), sp = G.SP.sipsy;
    if (sp) {
      G.addCopy(q, sp.id, G.adnOf(t));
      const d = q.dex[sp.id];
      d.stars = 2; d.stage = G.evoStage(sp, 2); d.copies = 2; d.level = 12;
    }
    return G.sanitizePlayer(q, t);
  }
  function seasonPreset(p, now, rng) {
    const t = now(), q = habitPreset(p, 'month', now, rng);
    q.season = 2; q.startAdn = G.adnOf(t) - 27;
    q.rewardCode = 'SKIP-DEMO2'; q.rewardSeason = q.season;
    q.claims = [demoClaim(q, t, rng, 'active')];
    return G.sanitizePlayer(q, t);
  }
  function applyPreset(p, name, now, rng, opts) {
    opts = opts || {};
    switch (name) {
      case 'full': return { player: buildFullDemo(p, now, rng), info: 'Full demo state ready' };
      case 'reset': return { player: freshDemo(p, now, rng, opts.id), info: 'Demo state reset' };
      case 'unlockAll': return { player: unlockAll(p, now), info: 'All species and forms unlocked' };
      case 'discoverAll': return { player: discoverAll(p, now), info: 'All species discovered' };
      case 'eggs': {
        const r = addEggs(p, opts.n || 3, now, rng);
        return { player: r.player, info: r.info.length + ' demo eggs added' };
      }
      case 'scrap': {
        const q = G.clone(p); q.scrap = Math.min(9999999, q.scrap + 500);
        return { player: G.sanitizePlayer(q, now()), info: '+500 demo scrap' };
      }
      case 'energy': {
        const q = G.clone(p); q.energy = C.ENERGY_MAX; q.dailyAdn = G.adnOf(now());
        return { player: G.sanitizePlayer(q, now()), info: 'Demo energy restored' };
      }
      case 'maxTeam': {
        const q = G.clone(p); bestTeam(q);
        return { player: G.sanitizePlayer(q, now()), info: 'Strongest demo team selected' };
      }
      case 'habitNew': return { player: habitPreset(p, 'new', now, rng), info: 'New habit state' };
      case 'habit3': return { player: habitPreset(p, '3', now, rng), info: '3-day streak ready' };
      case 'habit7': return { player: habitPreset(p, '7', now, rng), info: '7-day habit state ready' };
      case 'habitMonth': return { player: habitPreset(p, 'month', now, rng), info: 'Strong month ready' };
      case 'habitMaxToday': return { player: habitMaxToday(p, now), info: 'Daily limit state ready' };
      case 'reusable': {
        const q = G.clone(p); q.reusable = { nickname: 'Cuppy' };
        q.rolls = Math.max(q.rolls, G.verifiedActions(q).filter(a => a.kind === 'byo').length || 8);
        return { player: G.sanitizePlayer(q, now()), info: 'Demo reusable Cuppy ready' };
      }
      case 'mergeReady': return { player: mergeReady(p, now), info: 'Merge and evolution state ready' };
      case 'season': return { player: seasonPreset(p, now, rng), info: 'Demo season recap ready' };
      case 'rewardNone': return { player: rewardPreset(p, 'none', now, rng), info: 'Reward: not eligible' };
      case 'rewardAlmost': return { player: rewardPreset(p, 'almost', now, rng), info: 'Reward: almost eligible' };
      case 'rewardEligible': return { player: rewardPreset(p, 'eligible', now, rng), info: 'Reward: eligible' };
      case 'rewardAvailable': return { player: rewardPreset(p, 'available', now, rng), info: 'Reward: claim available' };
      case 'rewardClaimed': return { player: rewardPreset(p, 'claimed', now, rng), info: 'Reward: demo claim issued' };
      case 'rewardRedeemed': return { player: rewardPreset(p, 'redeemed', now, rng), info: 'Reward: demo claim redeemed' };
      default: return null;
    }
  }

  function findPlayer(store, token, sha256) {
    if (!token || typeof token !== 'string') return Promise.resolve(null);
    return sha256(token).then(h => store.get('tokens', h)).then(t => t && t.playerId ? store.get('players', t.playerId) : null);
  }
  function savePlayer(store, p) { return store.put('players', p.id, p); }
  function withDemo(body) {
    if (body && typeof body === 'object' && body.state && typeof body.state === 'object') body.state = Object.assign({}, body.state, { demo: true });
    return body;
  }
  function ok(body) { return { status: 200, body: withDemo(body) }; }
  function err(status, code, extra) { return { status, body: Object.assign({ error: code, demo: true }, extra || {}) }; }

  function createRuntime(opts) {
    const store = opts.store, api = opts.api, sha256 = opts.sha256, randomHex = opts.randomHex;
    const rng = opts.rng || Math.random, now = opts.now || (() => Date.now());
    const RIVAL = DEMO_ID + 'rival';
    async function ensureRival() {
      const old = await store.get('players', RIVAL);
      if (old) return old;
      const t = now(), q = freshDemo(null, now, rng, RIVAL);
      q.name = 'Demo Rival 731'; q.zone = G.geohash(1.3099, 103.7775, 5);
      q.energy = C.ENERGY_MAX; q.arena = { rating: 1180, wins: 9, losses: 5, rankedWins: 4, rankedLosses: 2, rankedDay: 0, rankedPlayed: 0, lastOppId: null, lastOppTs: 0 };
      const pool = G.SPECIES.filter(s => s.source !== 'recipe').slice(0, 5);
      q.dex = Object.create(null); q.team = []; q.buddy = null;
      pool.forEach((sp, i) => {
        G.addCopy(q, sp.id, G.adnOf(t) - 2);
        const d = q.dex[sp.id]; d.stars = i < 2 ? 4 : 3; d.stage = G.evoStage(sp, d.stars); d.level = 18 - i; d.copies = 2;
      });
      bestTeam(q);
      const final = G.sanitizePlayer(q, t);
      await store.put('players', RIVAL, final);
      return final;
    }
    async function createSession(body) {
      const t = now(), id = DEMO_ID + randomHex(4), token = randomHex(32);
      let p = freshDemo(null, now, rng, id);
      if (body && body.full) p = buildFullDemo(p, now, rng);
      const hash = await sha256(token);
      await store.put('players', id, p);
      await store.put('tokens', hash, { playerId: id, created: t });
      await ensureRival();
      return ok({ token, state: p, demo: true });
    }
    async function session(r, path, body) {
      const token = bearer(r.headers);
      if (r.method === 'POST') return createSession(body);
      if (r.method !== 'GET') return err(405, 'method');
      if (!token) return err(401, 'unauthorized');
      const p = await findPlayer(store, token, sha256);
      if (!p) return err(401, 'unauthorized');
      return ok({ state: p, demo: true });
    }
    async function preset(r, body) {
      if (r.method !== 'POST') return err(405, 'method');
      const p = await findPlayer(store, bearer(r.headers), sha256);
      if (!p) return err(401, 'unauthorized');
      const result = applyPreset(p, body && body.preset, now, rng, { id: p.id, n: body && body.n });
      if (!result) return err(400, 'preset');
      await savePlayer(store, result.player);
      return ok({ state: result.player, info: result.info, demo: true });
    }
    async function battle(r, body) {
      if (r.method !== 'POST') return err(405, 'method');
      const p = await findPlayer(store, bearer(r.headers), sha256);
      if (!p) return err(401, 'unauthorized');
      const kind = body && body.kind === 'arena' ? 'arena' : 'campaign';
      let start;
      if (kind === 'arena') {
        const opp = await ensureRival();
        start = G.startArena(p, opp, Math.floor(rng() * 0xffffffff), now(), { ranked: !!(body && body.ranked) });
      } else {
        const ai = body && Number.isInteger(body.area) ? body.area : 0;
        const fi = body && Number.isInteger(body.fight) ? body.fight : (p.areas[ai] ? p.areas[ai].progress : 0);
        start = G.startCampaign(p, ai, fi, Math.floor(rng() * 0xffffffff));
      }
      if (start.error) return err(400, start.error, { message: start.message || '' });
      const begin = G.clone(start), acts = [], rr = G.mulberry32(begin.seed);
      for (let i = 0; i < 40 && !begin.over; i++) {
        const cur = begin.allies[begin.a], move = cur && cur.util === 'refill' && cur.utilLeft > 0 && cur.hp < cur.maxHp * 0.5 ? 'util' : 'type';
        const act = { kind: 'move', move };
        const ev = G.act(begin, act, rr);
        if (ev && ev[0] && ev[0].invalid) break;
        acts.push(act);
      }
      const rp = G.replay(start, acts);
      rp.battle.result = body && body.result === 'lose' ? 'lose' : 'win';
      let result;
      if (kind === 'arena') {
        const opp = await store.get('players', RIVAL);
        result = G.finishArena(p, opp, rp.battle, now());
        await savePlayer(store, opp);
      } else result = G.finishCampaign(p, rp.battle);
      await savePlayer(store, p);
      return ok({ result: result.result, detail: result, state: p, demo: true });
    }
    async function opponent(r) {
      if (r.method !== 'GET') return err(405, 'method');
      const p = await findPlayer(store, bearer(r.headers), sha256);
      if (!p) return err(401, 'unauthorized');
      const o = await ensureRival();
      const summary = {
        id: o.id, name: o.name, rating: o.arena.rating, near: true,
        power: o.team.reduce((n, id) => n + 8 + (o.dex[id] ? o.dex[id].level : 0), 0),
        team: o.team.map(id => {
          const sp = G.SPECIES.find(x => x.id === id), d = o.dex[id] || {};
          return { id, name: sp ? sp.name : id, level: d.level || 1, stage: d.stage || 0, rarity: sp ? sp.rarity : 'common' };
        })
      };
      return ok({ opponent: summary, state: p, demo: true });
    }
    async function claim(r, body) {
      const p = await findPlayer(store, bearer(r.headers), sha256);
      if (!p) return err(401, 'unauthorized');
      if (r.method === 'GET') {
        const claim = (p.claims || []).filter(c => c.season === p.season && c.status === 'active')[0] || null;
        return ok({ eligible: G.seasonActionDays(p) >= C.STAR_DAYS, season: p.season, claim, state: p, demo: true });
      }
      if (r.method !== 'POST') return err(405, 'method');
      const active = (p.claims || []).filter(c => c.season === p.season && c.status === 'active')[0];
      if (!active && (G.seasonActionDays(p) < C.STAR_DAYS || !p.rewardCode)) return err(403, 'ineligible', { message: 'Complete ' + C.STAR_DAYS + ' demo BYO days first.' });
      const c = active || demoClaim(p, now(), rng, 'active');
      if (!active) p.claims = (p.claims || []).concat([c]);
      await savePlayer(store, p);
      return ok({ claim: c, state: p, demo: true });
    }
    async function redeem(r, body) {
      if (r.method !== 'POST') return err(405, 'method');
      const p = await findPlayer(store, bearer(r.headers), sha256);
      if (!p) return err(401, 'unauthorized');
      const c = (p.claims || []).filter(x => x.id === (body && body.id) && x.status === 'active')[0];
      if (!c) return err(404, 'claim');
      c.status = 'redeemed'; c.redeemedAt = now();
      await savePlayer(store, p);
      return ok({ state: p, demo: true });
    }
    return {
      store,
      async handle(req) {
        const url = req.path || '/', path = url.split('?')[0], r = req || {};
        let body = r.body || {};
        if (typeof body === 'string') { try { body = body ? JSON.parse(body) : {}; } catch (e) { return err(400, 'json'); } }
        if (path === '/api/demo/dev/session') return session(r, path, body);
        if (path === '/api/demo/dev/preset') return preset(r, body);
        if (path === '/api/demo/dev/battle') return battle(r, body);
        if (path === '/api/demo/dev/opponent') return opponent(r);
        if (path === '/api/demo/rewards/claim') return claim(r, body);
        if (path === '/api/demo/rewards/redeem') return redeem(r, body);
        if (path === '/api/demo/dev/meta') return ok({ demo: true, rivalId: RIVAL, version: G.VERSION });
        let out = await api.handle({ method: r.method, path: path.replace(/^\/api\/demo/, '/api'), headers: r.headers || {}, body });
        out.body = withDemo(out.body);
        return out;
      }
    };
  }
  function bearer(headers) {
    const h = headers || {}, raw = h.authorization || h.Authorization || '';
    return /^Bearer\s+(.+)$/i.test(raw) ? raw.replace(/^Bearer\s+/i, '') : null;
  }

  const DevMode = { C, DEMO_REWARD, DEMO_ID, envEnabled, buildFullDemo, freshDemo, unlockAll, discoverAll, addEggs, habitPreset, rewardPreset, seasonPreset, mergeReady, applyPreset, createRuntime, withDemo };
  if (typeof module !== 'undefined' && module.exports) module.exports = DevMode;
  root.DevMode = DevMode;
})(typeof window !== 'undefined' ? window : globalThis);
