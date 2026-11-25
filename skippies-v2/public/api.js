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
      lowdetail: 'That photo is too dark or blank. Try again in better light.',
      name: 'That name can\u2019t be used. Try another.', taken: G.NAME_ERR.taken, namecooldown: 'You can change your name once every 7 days.',
      daily: 'That\u2019s your 5 ranked matches for today. Practice matches are still available.', repeat: 'That rematch is on cooldown. Try another opponent for 20 minutes.', self: 'Pick another opponent.',
      scanner: 'Start a fresh camera check and try again.', missing: 'That reward isn\u2019t available.', expired: 'That check expired. Start a fresh one.'
    };
    const SAFE_REWARDS = ['MamaShop sticker', 'MamaShop wallpaper', 'MamaShop badge'];
    const chain = { p: Promise.resolve() };
    async function locked(fn) { const prev = chain.p, run = prev.then(fn, fn); chain.p = run.catch(() => {}); return run; }
    function cleanPlayer(x) { const c = G.sanitizePlayer(x, now()); return c || null; }

    async function seedBots() {
      if (await store.get('meta', 'bots')) return;
      for (let i = 0; i < BOTS; i++) await store.put('players', 'bot-' + i, cleanPlayer(G.makeBot(i, now())));
      await store.put('meta', 'bots', { n: BOTS });
    }
    async function auth(req) {
      const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      const m = /^Bearer ([0-9a-f]{64})$/.exec(h); if (!m) return null;
      const t = await store.get('tokens', await sha256(m[1])); if (!t || typeof t.playerId !== 'string') return null;
      const raw = await store.get('players', t.playerId); const p = cleanPlayer(raw); if (!p) return null;
      if (p.id !== t.playerId) return null;
      if (JSON.stringify(p) !== JSON.stringify(raw)) await store.put('players', p.id, p);
      if (G.claimDaily(p, now())) await store.put('players', p.id, p);
      return p;
    }
    function pub(p) {
      const s = G.clone(p); delete s.push; delete s.pushSent;
      s.mode = mode; s.serverNow = now();
      return s;
    }
    function teamCard(p, me) {
      const team = Array.isArray(p.team) ? p.team.filter(id => p.dex && p.dex[id] && G.SP[id]).slice(0, G.C.TEAM_MAX) : [];
      return {
        id: p.id, name: p.name, bot: !!p.bot, rating: p.arena.rating, near: !!(me && G.nearZone(me.zone, p.zone)),
        power: team.reduce((s, id) => s + G.power(p, id), 0),
        team: team.map(id => ({ id, name: G.nameOf(p, id), level: p.dex[id].level, stars: p.dex[id].stars, stage: p.dex[id].stage, type: G.SP[id].type, rarity: G.SP[id].rarity }))
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
    function q(path) {
      const out = {}, dec = s => { try { return decodeURIComponent(s); } catch (e) { return ''; } }, i = path.indexOf('?');
      if (i < 0) return out;
      for (const kv of path.slice(i + 1).split('&')) { const [k, v] = kv.split('='); if (k) { const key = dec(k); if (key) out[key] = dec(v || ''); } }
      return out;
    }

    async function handleInner(req) {
      try {
        const method = (req.method || 'GET').toUpperCase(), full = req.path || '/', path = full.split('?')[0], query = q(full);
        let body = req.body; if (typeof body === 'string' && body) { try { body = JSON.parse(body); } catch (e) { return err(400, 'bad json'); } }
        body = body && typeof body === 'object' ? body : {};

        if (method === 'GET' && path === '/api/health') return ok({ ok: true, version: G.VERSION, mode });
        if (method === 'GET' && path === '/api/odds') return ok({ rarity: G.RARITY_KEYS.map(k => ({ key: k, name: G.RARITY[k].name, odds: G.RARITY[k].odds, effective: G.effectiveOdds()[k], species: G.EGG_POOL[G.RARITY[k].rank].map(s => s.stages[0]) })), pity: G.C.PITY_RARE, note: 'Eggs are free and earned only by real BYO or recycling. Nothing can be bought. Skippies cannot be traded or exchanged for anything of value.' });
        if (method === 'GET' && path === '/api/names') return ok({ names: Array.from({ length: 6 }, () => G.makeName(rng)), min: G.NAME_MIN, max: G.NAME_MAX, cooldownDays: G.C.NAME_COOLDOWN_DAYS });
        if (method === 'GET' && path === '/api/name-check') { // live "is this name free?" hint; the real check happens on save
          const c = G.checkName(query.name); if (!c.ok) return ok({ ok: false, reason: c.reason, message: c.message });
          const me = await auth(req), key = G.nameKey(c.name);
          const taken = (await store.list('players')).map(cleanPlayer).some(x => x && !x.bot && (!me || x.id !== me.id) && G.nameKey(x.name) === key);
          return ok(taken ? { ok: false, reason: 'taken', message: G.NAME_ERR.taken } : { ok: true, name: c.name });
        }
        if (method === 'POST' && path === '/api/register') {
          if (body.age13 !== true) return err(403, 'age', { message: 'Online play is for ages 13+. You can still play offline on this device.' });
          const token = randomHex(32), id = 'p-' + randomHex(8);
          const p = G.newPlayer(id, now(), rng);
          const others = await store.list('players');
          for (let i = 0; i < 5; i++) { if (!others.some(x => x.friendCode === p.friendCode)) break; p.friendCode = G.makeCode(rng); }
          for (let i = 0; i < 10; i++) { if (!others.some(x => G.nameKey(x.name) === G.nameKey(p.name))) break; p.name = G.makeName(rng); }
          await store.put('players', id, p); await store.put('tokens', await sha256(token), { playerId: id, created: now() });
          await seedBots();
          return ok({ token, state: pub(p) });
        }

        const p = await auth(req); if (!p) return err(401, 'auth');
        const save = () => store.put('players', p.id, p);

        if (method === 'GET' && path === '/api/state') return ok({ state: pub(p) });

        if (method === 'POST' && path === '/api/action') {
          const pre = G.validateAction(p, now(), body); if (pre) return err(400, pre, { message: ERR_TEXT[pre] });
          if (p.capture) {
            if (p.capture.expires <= now()) p.capture = null;
            else if (typeof body.nonce !== 'string' || body.nonce !== p.capture.nonce) return err(400, 'scanner', { message: ERR_TEXT.scanner });
          }
          const bits = G.hamming(body.hash, '0000000000000000');
          if (body.lowDetail === true || bits < 4 || bits > 60) return err(400, 'lowdetail', { message: ERR_TEXT.lowdetail });
          if (await isDuplicate(p, body.hash)) return err(409, 'duplicate', { message: ERR_TEXT.duplicate });
          const r = G.doAction(p, now(), { item: body.item, hash: body.hash, detected: body.detected, together: !!body.together, family: !!body.family }, rng);
          if (!r.ok) return err(400, r.reason, { message: ERR_TEXT[r.reason] });
          p.capture = null;
          await store.put('hashes', randomHex(8), { playerId: p.id, hash: body.hash, ts: now() });
          await save(); return ok({ result: r, state: pub(p) });
        }
        if (method === 'POST' && path === '/api/selfreport') { const r = G.logSelfReport(p, now(), body.item); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/rinse') { const r = G.rinse(p, now()); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/merge') { const r = G.merge(p, body.id); if (!r.ok) return err(400, r.reason, r); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/train') { const r = G.train(p, body.id, body.scrap); if (!r.ok) return err(400, r.reason); await save(); return ok({ result: r, state: pub(p) }); }
        if (method === 'POST' && path === '/api/team') { if (!G.setTeam(p, body.ids)) return err(400, 'team'); await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/buddy') { if (!p.dex || !p.dex[body.id] || !G.SP[body.id]) return err(400, 'missing'); p.buddy = body.id; await save(); return ok({ state: pub(p) }); }
        if (method === 'POST' && path === '/api/name') {
          const c = G.checkName(body.name);
          if (!c.ok) return err(400, 'name', { reason: c.reason, message: c.message });
          if (c.name === p.name) return ok({ state: pub(p) }); // no change, so the weekly change is not used up
          const next = p.nameSetAt ? p.nameSetAt + G.C.NAME_COOLDOWN_DAYS * G.DAY : 0;
          if (next > now()) return err(403, 'namecooldown', { next, message: 'You can change your name again on ' + G.ymdOf(next) + '.' });
          const key = G.nameKey(c.name);
          if ((await store.list('players')).map(cleanPlayer).some(x => x && !x.bot && x.id !== p.id && G.nameKey(x.name) === key)) return err(409, 'taken', { message: G.NAME_ERR.taken });
          p.name = c.name; p.nameSetAt = now(); await save(); return ok({ state: pub(p) });
        }
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

        if (method === 'GET' && path === '/api/habits') return ok({ habit: G.habitStats(p, now()), reusable: G.reusableStats(p, now()) });
        if (method === 'POST' && path === '/api/identity/reusable') {
          const c = G.checkName(body.nickname); if (!c.ok) return err(400, 'name', { message: c.message });
          p.reusable = p.reusable || {}; p.reusable.nickname = c.name; await save();
          return ok({ nickname: p.reusable.nickname, state: pub(p) });
        }
        if (method === 'GET' && path === '/api/season/recap') return ok({ recap: G.seasonRecap(p, now()), daysLeft: Math.max(0, G.C.SEASON_DAYS - G.seasonDay(p, now())) });

        if (method === 'POST' && path === '/api/capture/challenge') {
          const nonce = randomHex(12), expires = now() + 5 * 60000;
          p.capture = { nonce, expires }; await save();
          return ok({ nonce, expires, hint: 'Hold your reusable or recycling item in view. This check works without uploading a photo.' });
        }

        if (method === 'GET' && path === '/api/rewards/claim') {
          const existing = p.claims.find(c => c.season === p.season && c.status === 'active') || null;
          return ok({ eligible: G.seasonActionDays(p) >= G.C.STAR_DAYS, season: p.season, claim: existing });
        }
        if (method === 'POST' && path === '/api/rewards/claim') {
          const existing = p.claims.find(c => c.season === p.season && c.status === 'active');
          if (existing) return ok({ claim: existing, state: pub(p) });
          if (G.seasonActionDays(p) < G.C.STAR_DAYS || !p.rewardCode || p.rewardSeason !== p.season) return err(403, 'ineligible', { message: 'Complete ' + G.C.STAR_DAYS + ' real BYO/recycling days this season first.' });
          const codeHash = await sha256(p.rewardCode + ':' + p.id + ':' + p.rewardSeason);
          const claim = { id: randomHex(8), codeHash, reward: SAFE_REWARDS[parseInt(codeHash.slice(0, 2), 16) % SAFE_REWARDS.length], created: now(), status: 'active', redeemedAt: null, season: p.season };
          const key = p.id + '_' + p.season;
          const saved = store.take ? await store.take('claims', key, old => old || claim) : (await store.put('claims', key, claim), claim);
          p.claims.push(saved); await save(); return ok({ claim: saved, state: pub(p) });
        }
        if (method === 'POST' && path === '/api/rewards/redeem') {
          const claim = p.claims.find(c => c.id === body.id && c.status === 'active');
          if (!claim) return err(404, 'missing', { message: ERR_TEXT.missing });
          claim.status = 'redeemed'; claim.redeemedAt = now();
          if (store.take) await store.take('claims', p.id + '_' + claim.season, old => old && old.id === claim.id ? claim : old);
          else await store.put('claims', p.id + ':' + claim.season, claim);
          await save(); return ok({ claim, state: pub(p) });
        }

        if (method === 'POST' && path === '/api/campaign/start') {
          const bt = G.startCampaign(p, body.area, body.fight, Math.floor(rng() * 4294967295)); if (bt.error) return err(400, bt.error);
          const ticket = randomHex(12); await store.put('tickets', ticket, { playerId: p.id, kind: 'campaign', start: bt, created: now() });
          await save(); return ok({ ticket, battle: bt, state: pub(p) });
        }
        if (method === 'POST' && path === '/api/wild/start') {
          const bt = G.startWild(p, body.litter, now(), Math.floor(rng() * 4294967295)); if (bt.error) return err(400, bt.error);
          const ticket = randomHex(12); await store.put('tickets', ticket, { playerId: p.id, kind: 'wild', start: bt, created: now() });
          await save(); return ok({ ticket, battle: bt, state: pub(p) });
        }
        if (method === 'POST' && (path === '/api/campaign/finish' || path === '/api/arena/finish' || path === '/api/wild/finish')) {
          const kind = path.includes('arena') ? 'arena' : path.includes('wild') ? 'wild' : 'campaign';
          const t = typeof body.ticket === 'string' && await store.get('tickets', body.ticket);
          if (!t || t.playerId !== p.id || t.kind !== kind) return err(400, 'ticket');
          await store.del('tickets', body.ticket);
          if (now() - t.created > TICKET_TTL) return err(400, 'expired');
          const rp = G.replay(t.start, body.actions); if (rp.error) return err(400, 'replay', { detail: rp.error });
          if (kind === 'campaign') { const r = G.finishCampaign(p, rp.battle); await save(); return ok({ result: r, state: pub(p) }); }
          if (kind === 'wild') { const r = G.finishWild(p, rp.battle); await save(); return ok({ result: r, state: pub(p) }); }
          const opp = cleanPlayer(await store.get('players', t.start.oppId)); if (!opp) { await save(); return ok({ result: { result: rp.battle.result, ranked: false, delta: 0, rating: p.arena.rating, xp: 0, scrap: 0, levelUps: [] }, state: pub(p) }); }
          const r = G.finishArena(p, opp, rp.battle, now()); await save(); if (!opp.bot) await store.put('players', opp.id, opp);
          return ok({ result: r, state: pub(p) });
        }
        if (method === 'GET' && path === '/api/arena/opponents') {
          await seedBots();
          const all = (await store.list('players')).map(cleanPlayer).filter(x => x && x.id !== p.id && x.team && x.team.length);
          const near = x => G.nearZone(p.zone, x.zone);
          const real = all.filter(x => !x.bot).sort((a, c) => (near(c) - near(a)) || Math.abs(a.arena.rating - p.arena.rating) - Math.abs(c.arena.rating - p.arena.rating)).slice(0, 5);
          const bots = all.filter(x => x.bot).sort((a, c) => Math.abs(a.arena.rating - p.arena.rating) - Math.abs(c.arena.rating - p.arena.rating)).slice(0, Math.max(2, 5 - real.length));
          return ok({ list: real.concat(bots).map(x => teamCard(x, p)) });
        }
        if (method === 'GET' && path.startsWith('/api/arena/code/')) {
          const code = path.slice('/api/arena/code/'.length).toUpperCase();
          if (!/^[A-Z2-9]{6}$/.test(code)) return err(400, 'code');
          const o = (await store.list('players')).map(cleanPlayer).find(x => x && x.friendCode === code && !x.bot);
          if (!o || o.id === p.id || !o.team.length) return err(404, 'notfound'); return ok({ opponent: teamCard(o, p) });
        }
        if (method === 'POST' && path === '/api/arena/start') {
          const opp = typeof body.oppId === 'string' && cleanPlayer(await store.get('players', body.oppId));
          if (!opp || opp.id === p.id) return err(404, 'notfound');
          const bt = G.startArena(p, opp, Math.floor(rng() * 4294967295), now(), { ranked: body.ranked !== false });
          if (bt.error) return err(400, bt.error, { message: ERR_TEXT[bt.error] || 'That match isn\u2019t available right now.' });
          const ticket = randomHex(12); await store.put('tickets', ticket, { playerId: p.id, kind: 'arena', start: bt, created: now() });
          await save(); return ok({ ticket, battle: bt, state: pub(p) });
        }
        if (method === 'GET' && path === '/api/leaderboard') {
          const board = ['eco', 'ecoweek', 'arena'].includes(query.board) ? query.board : 'ecoweek';
          const scope = query.scope === 'zone' ? 'zone' : 'global';
          if (scope === 'zone' && !p.zone) return err(400, 'nozone');
          const wk = G.weekStart(G.adnOf(now()));
          const score = x => board === 'arena' ? x.arena.rating : board === 'eco' ? G.ecoScore(x) : G.ecoScore(x, wk);
          let ps = (await store.list('players')).map(cleanPlayer).filter(x => x && !x.bot && (scope === 'global' || G.nearZone(p.zone, x.zone)));
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
        return err(e && e.status ? e.status : 500, e && e.status ? 'bad request' : 'server');
      }
    }
    async function handle(req) { return locked(() => handleInner(req)); }

    // Reminders that are due now (server scheduler calls this every minute). Marks them as sent.
    async function dueReminders() {
      const t = now(), adn = G.adnOf(t), mins = Math.floor(((t + 8 * G.HOUR) % G.DAY) / 60000), dow = G.sgDow(t), out = [];
      for (const raw of await store.list('players')) {
        const p = cleanPlayer(raw); if (!p) continue;
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
    async function dropPush(playerId) { const p = cleanPlayer(await store.get('players', playerId)); if (p && p.push) { delete p.push; await store.put('players', p.id, p); } }
    async function cleanup() { const t = now(); let n = 0; for (const [id, k] of await store.entries('tickets')) if (t - k.created > TICKET_TTL) { await store.del('tickets', id); n++; } return n; }

    return { handle, dueReminders, dropPush, cleanup };
  }

  // Simple in-memory/localStorage store for the browser (offline mode) and tests.
  function createMemoryStore(persist) {
    const safeKey = k => typeof k === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(k) && k !== '__proto__' && k !== 'prototype' && k !== 'constructor';
    let data = Object.create(null);
    if (persist && persist.load) {
      try {
        const old = persist.load() || {};
        for (const k of Object.keys(old)) if (safeKey(k)) data[k] = old[k] && typeof old[k] === 'object' ? Object.assign(Object.create(null), old[k]) : old[k];
      } catch (e) { data = Object.create(null); }
    }
    const col = c => (data[c] = data[c] || Object.create(null));
    const flush = () => { if (persist && persist.save) persist.save(data); };
    return {
      async get(c, id) { if (!safeKey(id)) return null; const v = col(c)[id]; return v === undefined ? null : JSON.parse(JSON.stringify(v)); },
      async put(c, id, v) { if (!safeKey(c) || !safeKey(id)) return; col(c)[id] = JSON.parse(JSON.stringify(v)); flush(); },
      async del(c, id) { if (safeKey(id)) { delete col(c)[id]; flush(); } },
      async take(c, id, fn) {
        if (!safeKey(c) || !safeKey(id)) return null;
        const old = col(c)[id] === undefined ? null : JSON.parse(JSON.stringify(col(c)[id]));
        const next = await fn(old);
        if (next === null || next === undefined) delete col(c)[id]; else col(c)[id] = JSON.parse(JSON.stringify(next));
        flush(); return next;
      },
      async list(c) { return Object.values(col(c)).map(v => JSON.parse(JSON.stringify(v))); },
      async entries(c) { return Object.entries(col(c)).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]); },
      dump() { return data; }
    };
  }

  const API = { createApi, createMemoryStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SkippiesAPI = API;
})(typeof window !== 'undefined' ? window : globalThis);
