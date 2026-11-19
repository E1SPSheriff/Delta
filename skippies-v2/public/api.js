/* SKIPPIES v2 API: the single source of truth for game rules that matter (hatching, anti-duplicate photos,
   battles, rankings). Runs on the Node server (real multiplayer) AND inside the browser (offline single-player),
   so both modes behave identically. Storage is injected (SQLite on the server, localStorage in the browser). */
(function (root) {
  'use strict';
  const G = root.G || (typeof require !== 'undefined' ? (require('./engine.js'), globalThis.G) : null);
  const TICKET_TTL = 30 * 60000, BOTS = 8;

  function createApi(store, opts) {
    opts = opts || {};
    const now = opts.now || (() => Date.now());
    const rng = opts.rng || Math.random;
    const randomHex = opts.randomHex; // (bytes) => hex string, cryptographically random
    const sha256 = opts.sha256;       // async (string) => hex
    const mode = opts.mode || 'server';
    if (!randomHex || !sha256) throw new Error('createApi needs randomHex and sha256');

    const ok = body => ({ status: 200, body });
    const err = (status, error, extra) => ({ status, body: Object.assign({ error }, extra || {}) });
    const ERR_TEXT = {
      item: 'Unknown item.', season: 'Your 14-day season is over. Start a new one.', limit: 'That\u2019s 6 today. Come back tomorrow!',
      cooldown: 'Slow down: wait a minute between photos.', hash: 'Photo check failed. Try again.',
      notdetected: 'The scanner didn\u2019t spot that item. Hold it clearly in the frame and try again.',
      duplicate: 'That photo looks like one already used. Take a new photo of a new BYO or recycling moment.',
      lowdetail: 'That photo is too dark or blank. Try again in better light.'
    };

    async function seedBots() {
      if (await store.get('meta', 'bots')) return;
      for (let i = 0; i < BOTS; i++) await store.put('players', 'bot-' + i, G.makeBot(i, now()));
      await store.put('meta', 'bots', { n: BOTS });
    }
    async function auth(req) {
      const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      const m = /^Bearer ([0-9a-f]{64})$/.exec(h); if (!m) return null;
      const t = await store.get('tokens', await sha256(m[1])); if (!t) return null;
      const p = await store.get('players', t.playerId); if (!p) return null;
      if (G.claimDaily(p, now())) await store.put('players', p.id, p);
      return p;
    }
    function pub(p) {
      const s = G.clone(p); delete s.push; delete s.pushSent;
      s.mode = mode; s.serverNow = now();
      return s;
    }
    function teamCard(p, me) {
      return {
        id: p.id, name: p.name, bot: !!p.bot, rating: p.arena.rating, near: !!(me && G.nearZone(me.zone, p.zone)),
        power: p.team.reduce((s, id) => s + G.power(p, id), 0),
        team: p.team.map(id => ({ id, name: G.nameOf(p, id), level: p.dex[id].level, stars: p.dex[id].stars, stage: p.dex[id].stage, type: G.SP[id].type, rarity: G.SP[id].rarity }))
      };
    }
    async function isDuplicate(p, hash) {
      const cut = now() - G.C.HASH_WINDOW_DAYS * G.DAY, ownCut = now() - G.C.OWN_HASH_DAYS * G.DAY;
      for (const h of await store.list('hashes')) {
        if (h.ts < (h.playerId === p.id ? ownCut : cut)) continue; // own photos: last 90 days. Other players' photos: last 30 days.
        if (G.hamming(h.hash, hash) <= G.C.HASH_DISTANCE) return true;
      }
      return false;
    }
    function q(path) { const i = path.indexOf('?'); const out = {}; if (i < 0) return out; for (const kv of path.slice(i + 1).split('&')) { const [k, v] = kv.split('='); if (k) out[decodeURIComponent(k)] = decodeURIComponent(v || ''); } return out; }

    async function handle(req) {
      try {
        const method = (req.method || 'GET').toUpperCase(), full = req.path || '/', path = full.split('?')[0], query = q(full);
        let body = req.body; if (typeof body === 'string' && body) { try { body = JSON.parse(body); } catch (e) { return err(400, 'bad json'); } }
        body = body && typeof body === 'object' ? body : {};

        if (method === 'GET' && path === '/api/health') return ok({ ok: true, version: G.VERSION, mode });
        if (method === 'GET' && path === '/api/odds') return ok({ rarity: G.RARITY_KEYS.map(k => ({ key: k, name: G.RARITY[k].name, odds: G.RARITY[k].odds, effective: G.effectiveOdds()[k], species: G.EGG_POOL[G.RARITY[k].rank].map(s => s.stages[0]) })), pity: G.C.PITY_RARE, note: 'Eggs are free and earned only by real BYO or recycling. Nothing can be bought. Skippies cannot be traded or exchanged for anything of value.' });
        if (method === 'GET' && path === '/api/names') return ok({ names: Array.from({ length: 6 }, () => G.makeName(rng)) });
        if (method === 'POST' && path === '/api/register') {
          if (body.age13 !== true) return err(403, 'age', { message: 'Online play is for ages 13+. You can still play offline on this device.' });
          const token = randomHex(32), id = 'p-' + randomHex(8);
          const p = G.newPlayer(id, now(), rng);
          for (let i = 0; i < 5; i++) { if (!(await store.list('players')).some(x => x.friendCode === p.friendCode)) break; p.friendCode = G.makeCode(rng); }
          await store.put('players', id, p); await store.put('tokens', await sha256(token), { playerId: id, created: now() });
          await seedBots();
          return ok({ token, state: pub(p) });
        }

        const p = await auth(req); if (!p) return err(401, 'auth');
        const save = () => store.put('players', p.id, p);

        if (method === 'GET' && path === '/api/state') return ok({ state: pub(p) });

        if (method === 'POST' && path === '/api/action') {
          const pre = G.validateAction(p, now(), body); if (pre) return err(400, pre, { message: ERR_TEXT[pre] });
          const bits = G.hamming(body.hash, '0000000000000000');
          if (body.lowDetail === true || bits < 4 || bits > 60) return err(400, 'lowdetail', { message: ERR_TEXT.lowdetail });
          if (await isDuplicate(p, body.hash)) return err(409, 'duplicate', { message: ERR_TEXT.duplicate });
          const r = G.doAction(p, now(), { item: body.item, hash: body.hash, detected: body.detected, together: !!body.together, family: !!body.family }, rng);
          if (!r.ok) return err(400, r.reason, { message: ERR_TEXT[r.reason] });
          await store.put('hashes', randomHex(8), { playerId: p.id, hash: body.hash, ts: now() });
          await save(); return ok({ result: r, state: pub(p) });
        }
        if (method === 'POST' && path === '/api/selfreport') { const r = G.logSelfReport(p, now(), body.item); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/rinse') { const r = G.rinse(p, now()); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/merge') { const r = G.merge(p, body.id); if (!r.ok) return err(400, r.reason, r); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/train') { const r = G.train(p, body.id, body.scrap); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/team') { if (!G.setTeam(p, body.ids)) return err(400, 'team'); await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/buddy') { if (!p.dex[body.id]) return err(400, 'missing'); p.buddy = body.id; await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/name') { if (!G.validName(body.name)) return err(400, 'name'); p.name = body.name; await save(); return ok({ state: pub(p) }); }
        if (method === 'PUT' && path === '/api/zone') { if (!G.validZone(body.zone)) return err(400, 'zone'); p.zone = body.zone; await save(); return ok({ state: pub(p) }); }
        if (method === 'DELETE' && path === '/api/zone') { p.zone = null; await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/season/new') { if (!G.newSeason(p, now())) return err(400, 'season'); await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/reminders') {
          const r = p.reminders; if (body.byo !== undefined) { if (G.hhmm(body.byo) == null) return err(400, 'time'); r.byo = body.byo; }
          if (body.recycleTime !== undefined) { if (G.hhmm(body.recycleTime) == null) return err(400, 'time'); r.recycleTime = body.recycleTime; }
          if (body.recycleDow !== undefined) { if (!Number.isInteger(body.recycleDow) || body.recycleDow < 0 || body.recycleDow > 6) return err(400, 'dow'); r.recycleDow = body.recycleDow; }
          await save(); return ok({ state: pub(p) });
        }
        if (method === 'POST' && path === '/api/push') {
          const s = body.subscription;
          if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000 || !s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string' || s.keys.p256dh.length > 200 || s.keys.auth.length > 100) return err(400, 'subscription');
          p.push = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }; p.pushSent = p.pushSent || {}; await save(); return ok({ state: pub(p), push: true });
        }
        if (method === 'DELETE' && path === '/api/push') { delete p.push; await save(); return ok({ state: pub(p), push: false }); }
        if (method === 'GET' && path === '/api/push/status') return ok({ push: !!p.push });

        if (method === 'POST' && path === '/api/campaign/start') {
          const bt = G.startCampaign(p, body.area, body.fight, Math.floor(rng() * 4294967295)); if (bt.error) return err(400, bt.error);
          const ticket = randomHex(12); await store.put('tickets', ticket, { playerId: p.id, kind: 'campaign', start: bt, created: now() });
          await save(); return ok({ ticket, battle: bt, state: pub(p) });
        }
        if (method === 'POST' && (path === '/api/campaign/finish' || path === '/api/arena/finish')) {
          const kind = path.includes('arena') ? 'arena' : 'campaign';
          const t = typeof body.ticket === 'string' && await store.get('tickets', body.ticket);
          if (!t || t.playerId !== p.id || t.kind !== kind) return err(400, 'ticket');
          await store.del('tickets', body.ticket);
          if (now() - t.created > TICKET_TTL) return err(400, 'expired');
          const rp = G.replay(t.start, body.actions); if (rp.error) return err(400, 'replay', { detail: rp.error });
          if (kind === 'campaign') { const r = G.finishCampaign(p, rp.battle); await save(); return ok({ result: r, state: pub(p) }); }
          const opp = await store.get('players', t.start.oppId); if (!opp) { await save(); return ok({ result: { result: rp.battle.result, delta: 0, rating: p.arena.rating, xp: 0, scrap: 0, levelUps: [] }, state: pub(p) }); }
          const r = G.finishArena(p, opp, rp.battle); await save(); if (!opp.bot) await store.put('players', opp.id, opp);
          return ok({ result: r, state: pub(p) });
        }
        if (method === 'GET' && path === '/api/arena/opponents') {
          await seedBots();
          const all = (await store.list('players')).filter(x => x.id !== p.id && x.team && x.team.length);
          const near = x => G.nearZone(p.zone, x.zone);
          const real = all.filter(x => !x.bot).sort((a, c) => (near(c) - near(a)) || Math.abs(a.arena.rating - p.arena.rating) - Math.abs(c.arena.rating - p.arena.rating)).slice(0, 5);
          const bots = all.filter(x => x.bot).sort((a, c) => Math.abs(a.arena.rating - p.arena.rating) - Math.abs(c.arena.rating - p.arena.rating)).slice(0, Math.max(2, 5 - real.length));
          return ok({ list: real.concat(bots).map(x => teamCard(x, p)) });
        }
        if (method === 'GET' && path.startsWith('/api/arena/code/')) {
          const code = path.slice('/api/arena/code/'.length).toUpperCase();
          if (!/^[A-Z2-9]{6}$/.test(code)) return err(400, 'code');
          const o = (await store.list('players')).find(x => x.friendCode === code && !x.bot);
          if (!o || o.id === p.id || !o.team.length) return err(404, 'notfound'); return ok({ opponent: teamCard(o, p) });
        }
        if (method === 'POST' && path === '/api/arena/start') {
          const opp = typeof body.oppId === 'string' && await store.get('players', body.oppId);
          if (!opp || opp.id === p.id) return err(404, 'notfound');
          const bt = G.startArena(p, opp, Math.floor(rng() * 4294967295)); if (bt.error) return err(400, bt.error);
          const ticket = randomHex(12); await store.put('tickets', ticket, { playerId: p.id, kind: 'arena', start: bt, created: now() });
          await save(); return ok({ ticket, battle: bt, state: pub(p) });
        }
        if (method === 'GET' && path === '/api/leaderboard') {
          const board = ['eco', 'ecoweek', 'arena'].includes(query.board) ? query.board : 'ecoweek';
          const scope = query.scope === 'zone' ? 'zone' : 'global';
          if (scope === 'zone' && !p.zone) return err(400, 'nozone');
          const wk = G.weekStart(G.adnOf(now()));
          const score = x => board === 'arena' ? x.arena.rating : board === 'eco' ? G.ecoScore(x) : G.ecoScore(x, wk);
          let ps = (await store.list('players')).filter(x => !x.bot && (scope === 'global' || G.nearZone(p.zone, x.zone)));
          if (board === 'arena') ps = ps.filter(x => x.arena.wins + x.arena.losses > 0 || x.id === p.id);
          const rows = ps.map(x => ({ id: x.id, name: x.name, score: score(x) })).sort((a, c) => c.score - a.score || (a.id < c.id ? -1 : 1));
          let rank = 0, prev = null; rows.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
          const mine = rows.find(r => r.id === p.id);
          return ok({ board, scope, rows: rows.slice(0, 50).map(r => ({ rank: r.rank, name: r.name, score: r.score, me: r.id === p.id })), me: mine ? { rank: mine.rank, score: mine.score } : null, total: rows.length });
        }
        if (method === 'DELETE' && path === '/api/me') {
          for (const [id, t] of await store.entries('tokens')) if (t.playerId === p.id) await store.del('tokens', id);
          for (const [id, h] of await store.entries('hashes')) if (h.playerId === p.id) await store.del('hashes', id);
          for (const [id, t] of await store.entries('tickets')) if (t.playerId === p.id) await store.del('tickets', id);
          await store.del('players', p.id); return ok({ deleted: true });
        }
        return err(404, 'not found');
      } catch (e) {
        if (opts.onError) opts.onError(e);
        return err(500, 'server');
      }
    }

    // Reminders that are due now (server scheduler calls this every minute). Marks them as sent.
    async function dueReminders() {
      const t = now(), adn = G.adnOf(t), mins = Math.floor(((t + 8 * G.HOUR) % G.DAY) / 60000), dow = G.sgDow(t), out = [];
      for (const p of await store.list('players')) {
        if (!p.push || p.bot) continue;
        p.pushSent = p.pushSent || {}; let changed = false;
        const byo = G.hhmm(p.reminders.byo);
        if (byo != null && mins >= byo && mins < byo + 15 && p.pushSent.byo !== adn) { p.pushSent.byo = adn; changed = true; out.push({ playerId: p.id, push: p.push, payload: { title: 'Skippies: BYO time', body: 'Grab your reusable on the way out. A new egg is waiting!', tag: 'byo' } }); }
        const rec = G.hhmm(p.reminders.recycleTime);
        if (rec != null && dow === p.reminders.recycleDow && mins >= rec && mins < rec + 15 && p.pushSent.recycle !== adn) { p.pushSent.recycle = adn; changed = true; out.push({ playerId: p.id, push: p.push, payload: { title: 'Skippies: recycling day', body: 'Recycling day! Return a can for 10¢ or drop paper in a blue bin, then hatch an egg.', tag: 'recycle' } }); }
        if (changed) await store.put('players', p.id, p);
      }
      return out;
    }
    async function dropPush(playerId) { const p = await store.get('players', playerId); if (p && p.push) { delete p.push; await store.put('players', p.id, p); } }
    async function cleanup() { const t = now(); let n = 0; for (const [id, k] of await store.entries('tickets')) if (t - k.created > TICKET_TTL) { await store.del('tickets', id); n++; } return n; }

    return { handle, dueReminders, dropPush, cleanup };
  }

  // Simple in-memory/localStorage store for the browser (offline mode) and tests.
  function createMemoryStore(persist) {
    let data = {};
    if (persist && persist.load) { try { data = persist.load() || {}; } catch (e) { data = {}; } }
    const col = c => (data[c] = data[c] || {});
    const flush = () => { if (persist && persist.save) persist.save(data); };
    return {
      async get(c, id) { const v = col(c)[id]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
      async put(c, id, v) { col(c)[id] = JSON.parse(JSON.stringify(v)); flush(); },
      async del(c, id) { delete col(c)[id]; flush(); },
      async list(c) { return Object.values(col(c)).map(v => JSON.parse(JSON.stringify(v))); },
      async entries(c) { return Object.entries(col(c)).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]); },
      dump() { return data; }
    };
  }

  const API = { createApi, createMemoryStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SkippiesAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);
