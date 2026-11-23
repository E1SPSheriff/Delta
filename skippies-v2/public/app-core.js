/* SKIPPIES client core: utilities, API client (online server or on-device offline), app shell, sheets, onboarding. */
(function (root) {
  'use strict';
  const SK = root.SK = root.SK || {};
  const { C, TYPES, SP, RARITY } = G;
  const doc = root.document;
  SK.$app = doc.getElementById('app'); SK.$live = doc.getElementById('live');
  SK.reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  SK.st = null; SK.tab = 'home'; SK.timers = []; SK.offset = 0;
  const SERVER = (typeof root.SKIPPIES_SERVER === 'string' ? root.SKIPPIES_SERVER : '').replace(/\/$/, '');
  SK.SERVER = SERVER;
  const LS = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { root.localStorage.removeItem(k); } catch (e) { } }
  };
  SK.LS = LS;
  const K_MODE = 'skippies2.mode', K_TOKEN = 'skippies2.token.', K_LOCAL = 'skippies2.localdb';
  const ic = (n, s, o) => Icon.svg(n, s, o);
  SK.ic = ic;

  // ---------- small utils ----------
  SK.now = () => Date.now() + SK.offset;
  SK.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = SK.esc;
  SK.fmt = n => Number(n).toLocaleString('en-SG');
  SK.announce = t => { SK.$live.textContent = ''; setTimeout(() => { SK.$live.textContent = t; }, 30); };
  let snackT = null;
  SK.toast = function (t, icon) {
    const old = doc.querySelector('.snackbar'); if (old) old.remove(); clearTimeout(snackT);
    const el = doc.createElement('div'); el.className = 'snackbar'; el.setAttribute('role', 'status');
    el.innerHTML = (icon ? ic(icon, 20) : '') + '<span>' + esc(t) + '</span>'; doc.body.appendChild(el);
    snackT = setTimeout(() => el.remove(), 4000);
  };
  SK.clearTimers = () => { SK.timers.forEach(t => clearTimeout(t)); SK.timers = []; };
  SK.later = (fn, ms) => { SK.timers.push(setTimeout(fn, ms)); };
  SK.on = (id, fn) => { const el = doc.getElementById(id); if (el) el.onclick = fn; return el; };
  SK.dark = on => {
    doc.body.classList.toggle('dark-bg', !!on);
    const m = doc.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', on ? '#13241B' : '#F7F3EA');
  };
  SK.typeChip = t => `<span class="type t-${t}">${ic(Icon.TYPE[t], 14)}${TYPES[t].name}</span>`;
  SK.rarityTag = r => `<span class="badge r-${r}">${RARITY[r].name}</span>`;
  SK.stars = (n, size) => { size = size || 14; let s = ''; for (let i = 0; i < C.MAX_STARS; i++) s += `<span class="${i < n ? 'on' : 'off'}">${ic('star', size, { filled: i < n, sw: 1.75 })}</span>`; return `<span class="stars" role="img" aria-label="${n} of 5 stars">${s}</span>`; };
  SK.bar = (v, max, cls, label) => { const p = Math.max(0, Math.min(100, Math.round(v / max * 100))); return `<div class="bar ${cls || ''}" role="meter" aria-label="${esc(label || '')}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(v)}"><i style="width:${p}%"></i></div>`; };
  SK.art = (id, o) => { o = o || {}; const d = SK.st && SK.st.dex[id]; return Art.skippy(SP[id], Object.assign({ stage: d ? d.stage : 0 }, o)); };
  SK.nm = id => G.nameOf(SK.st, id);
  SK.copy = t => { const n = root.navigator; if (n.clipboard && n.clipboard.writeText) n.clipboard.writeText(t).then(() => SK.toast('Copied ' + t, 'check'), () => SK.toast(t)); else SK.toast(t); };
  SK.download = (name, text, type) => {
    const a = doc.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name;
    doc.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  SK.vibrate = ms => { try { if (root.navigator.vibrate && !SK.reduced) root.navigator.vibrate(ms); } catch (e) { } };
  SK.ago = ts => { const m = Math.round((SK.now() - ts) / 60000); if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; const d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago'); };

  // ---------- bottom sheet (focus trapped, Esc/scrim to close) ----------
  SK.sheet = function (title, body, opts) {
    opts = opts || {};
    const prevSheet = doc.querySelector('.sheet'); if (prevSheet) { const s = doc.querySelector('.scrim'); if (s) s.remove(); prevSheet.remove(); }
    const scrim = doc.createElement('div'); scrim.className = 'scrim';
    const sh = doc.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', title);
    sh.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${ic('close', 24)}</button></div><div class="sheet-body${opts.actions ? ' has-actions' : ''}">${body}</div>${opts.actions ? '<div class="actions">' + opts.actions + '</div>' : ''}`;
    doc.body.append(scrim, sh);
    const prev = doc.activeElement;
    const keyh = e => {
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') { const f = Array.from(sh.querySelectorAll('button:not([disabled]),input,select,a[href]')); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && doc.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && doc.activeElement === z) { a.focus(); e.preventDefault(); } }
    };
    let closed = false;
    const close = () => { if (closed) return; closed = true; scrim.remove(); sh.remove(); doc.removeEventListener('keydown', keyh); if (opts.onClose) opts.onClose(); if (prev && prev.focus) try { prev.focus(); } catch (e) { } };
    doc.addEventListener('keydown', keyh); scrim.onclick = close;
    sh.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
    const f = sh.querySelector('.actions button') || sh.querySelector('button:not([data-close])') || sh.querySelector('button'); if (f) f.focus();
    return { sh, close };
  };
  SK.confirm = function (title, text, okLabel, danger) {
    return new Promise(res => {
      let done = false;
      const { sh, close } = SK.sheet(title, `<p class="muted">${esc(text)}</p>`, { actions: `<div class="stack-8"><button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" id="cf-ok">${esc(okLabel)}</button><button class="btn btn-secondary btn-block" id="cf-no">Cancel</button></div>`, onClose: () => { if (!done) res(false); } });
      sh.querySelector('#cf-ok').onclick = () => { done = true; close(); res(true); };
      sh.querySelector('#cf-no').onclick = () => { done = true; close(); res(false); };
    });
  };

  // ---------- SHA-256 (pure JS: offline-mode token hashing) ----------
  SK.sha256hex = function (str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(unescape(encodeURIComponent(str)), c => c.charCodeAt(0)), l = bytes.length * 8;
    bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 0xff);
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const r = (x, n) => (x >>> n) | (x << (32 - n)), w = new Array(64);
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) w[i] = (bytes[o + 4 * i] << 24) | (bytes[o + 4 * i + 1] << 16) | (bytes[o + 4 * i + 2] << 8) | bytes[o + 4 * i + 3];
      for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = h.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) | 0);
    }
    return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
  SK.randomHex = n => { const a = new Uint8Array(n); root.crypto.getRandomValues(a); return Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); };

  // ---------- API client: same endpoints online or offline ----------
  SK.mode = LS.get(K_MODE) || (SERVER ? null : 'local');
  let localApi = null;
  function getLocalApi() {
    if (localApi) return localApi;
    const store = SkippiesAPI.createMemoryStore({ load: () => JSON.parse(LS.get(K_LOCAL) || '{}'), save: d => { if (!LS.set(K_LOCAL, JSON.stringify(d)) && !SK._warned) { SK._warned = true; SK.toast('This browser can\u2019t save (private mode or storage full).', 'alert'); } } });
    localApi = SkippiesAPI.createApi(store, { mode: 'local', randomHex: SK.randomHex, sha256: async s => SK.sha256hex(s) });
    return localApi;
  }
  SK.token = () => LS.get(K_TOKEN + SK.mode);
  SK.netDown = false;
  SK.call = async function (method, path, body) {
    const token = SK.token();
    let r;
    if (SK.mode === 'local') {
      r = await getLocalApi().handle({ method, path, headers: token ? { authorization: 'Bearer ' + token } : {}, body: body || {} });
    } else {
      try {
        const res = await root.fetch(SERVER + path, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: method === 'GET' || (method === 'DELETE' && !body) ? undefined : JSON.stringify(body || {}) });
        let b = {}; try { b = await res.json(); } catch (e) { }
        r = { status: res.status, body: b }; SK.netDown = false;
      } catch (e) { SK.netDown = true; r = { status: 0, body: { error: 'network', message: 'You\u2019re offline. Check your connection and try again.' } }; }
    }
    if (r.body && r.body.state) SK.setState(r.body.state);
    if (r.status === 401 && path !== '/api/register') { LS.del(K_TOKEN + SK.mode); SK.st = null; SK.boot(); }
    if (r.status === 429) r.body.message = 'Too many requests. Wait a moment and try again.';
    return r;
  };
  SK.setState = s => { SK.st = s; if (s.serverNow) SK.offset = s.serverNow - Date.now(); };
  SK.errMsg = (r, fallback) => (r.body && (r.body.message || SK.ERR[r.body.error])) || fallback || 'Something went wrong. Try again.';
  SK.ERR = {
    wildlimit: 'That\u2019s ' + C.WILD_PER_DAY + ' wild battles today. More Litterbugs tomorrow.', wild: 'That Litterbug has wandered off.',
    energy: 'Out of energy. A real BYO or recycle gives +3, and you get +2 every day.', locked: 'That area is still locked.', order: 'Beat the earlier fight first.',
    team: 'Hatch a Skippy and add it to your team first.', copies: 'Not enough duplicate copies yet.', max: 'Already maxed out.', scrap: 'Not enough scrap.',
    nobyo: 'Do a photo-checked BYO first, then rinse it.', done: 'Already rinsed today.', nozone: 'Set your area first in Radar.', notfound: 'No player with that code.',
    season: 'Your season isn\u2019t over yet.', code: 'Codes are 6 letters or numbers.', ticket: 'That battle expired. Start a new one.', expired: 'That battle expired. Start a new one.', name: 'That name can\u2019t be used. Try another.', taken: 'Someone already has that name. Try another, or add a number.', namecooldown: 'You can change your name once every 7 days.'
  };
  SK.setMode = m => { SK.mode = m; LS.set(K_MODE, m); };
  SK.saveToken = t => LS.set(K_TOKEN + SK.mode, t);
  SK.wipe = () => { LS.del(K_TOKEN + SK.mode); if (SK.mode === 'local') { LS.del(K_LOCAL); localApi = null; } LS.del(K_MODE); SK.mode = SERVER ? null : 'local'; SK.st = null; };

  // ---------- shell ----------
  const TABS = [['home', 'home', 'Home'], ['dex', 'dex', 'Dex'], ['battle', 'battle', 'Battle'], ['ranks', 'ranks', 'Ranks'], ['radar', 'map', 'Map'], ['rewards', 'trophy', 'Rewards']];
  SK.views = {}; SK.binders = {};
  SK.render = function () {
    SK.clearTimers(); if (SK.stopCam) SK.stopCam(); if (SK.stopMap) SK.stopMap(); SK.dark(false);
    if (!SK.st) return SK.boot();
    const isMap = SK.tab === 'radar';
    const body = (SK.views[SK.tab] || SK.views.home)();
    const s = SK.st, buddy = s.buddy && s.dex[s.buddy];
    SK.$app.innerHTML = `<header class="appbar" id="appbar">
        <button class="who" id="settings" aria-label="Profile and settings: ${esc(s.name)}"><span class="av">${buddy ? SK.art(s.buddy, { size: 30 }) : ic('egg', 20)}</span><span class="nm">${esc(s.name)}</span></button>
        <div class="pills"><button class="pill" id="pill-en" aria-label="Energy ${s.energy} of ${C.ENERGY_MAX}">${ic('energy', 16, { cls: 'en', filled: true })}<span>${s.energy}</span><span class="of">/${C.ENERGY_MAX}</span></button>
        <button class="pill" id="pill-sc" aria-label="Scrap ${s.scrap}">${ic('scrap', 16)}<span>${SK.fmt(s.scrap)}</span></button></div></header>
      ${s.mode === 'local' && !isMap ? `<div class="offline-bar">${ic('offline', 18)}Offline mode · progress is saved on this device only</div>` : ''}
      ${SK.netDown ? `<div class="offline-bar">${ic('alert', 18)}Can\u2019t reach the server. Showing your last saved progress.</div>` : ''}
      <main id="main" class="main${isMap ? ' main-map' : ''}">${body}</main>
      <nav class="tabbar" aria-label="Main">${TABS.map(([k, i, l]) => `<button class="tab" data-tab="${k}" ${SK.tab === k ? 'aria-current="page"' : ''}>${ic(i, 24, { filled: SK.tab === k })}<span>${l}</span></button>`).join('')}</nav>`;
    SK.$app.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (SK.tab === b.dataset.tab) { root.scrollTo && root.scrollTo(0, 0); return; } SK.tab = b.dataset.tab; SK.render(); root.scrollTo && root.scrollTo(0, 0); });
    SK.on('settings', () => SK.settings());
    SK.on('pill-en', () => SK.sheet('Energy', `<p class="muted">Each battle uses 1 energy (your first battle is free). You have <b class="tnum">${s.energy}</b> of ${C.ENERGY_MAX}.</p><div class="group mt16">
      <div class="row"><span class="lead">${ic('camera', 20)}</span><span class="grow"><span class="title">Real BYO or recycle</span><br><span class="meta">Photo-checked</span></span><span class="trail">+${C.ACTION_ENERGY}</span></div>
      <div class="row"><span class="lead">${ic('calendar', 20)}</span><span class="grow"><span class="title">Every new day</span></span><span class="trail">+${C.DAILY_ENERGY}</span></div>
      <div class="row"><span class="lead">${ic('drop', 20)}</span><span class="grow"><span class="title">Rinse your reusable</span><br><span class="meta">Once a day, after a BYO</span></span><span class="trail">+${C.RINSE_ENERGY}</span></div></div>`));
    SK.on('pill-sc', () => SK.sheet('Scrap', `<p class="muted">Spend scrap to train Skippies in the Dex (${C.TRAIN_STEP} scrap = ${C.TRAIN_STEP * C.SCRAP_XP} XP). You have <b class="tnum">${SK.fmt(s.scrap)}</b>.</p><div class="group mt16">
      <div class="row"><span class="lead">${ic('recycle', 20)}</span><span class="grow"><span class="title">Recycle</span></span><span class="trail">+${C.RECYCLE_SCRAP}</span></div>
      <div class="row"><span class="lead">${ic('cup', 20)}</span><span class="grow"><span class="title">BYO</span></span><span class="trail">+${C.BYO_SCRAP}</span></div>
      <div class="row"><span class="lead">${ic('calendar', 20)}</span><span class="grow"><span class="title">Every new day</span></span><span class="trail">+${C.DAILY_SCRAP}</span></div>
      <div class="row"><span class="lead">${ic('battle', 20)}</span><span class="grow"><span class="title">Win battles</span></span><span class="trail">+5 to +35</span></div></div>`));
    if (SK.binders[SK.tab]) SK.binders[SK.tab]();
  };
  if (root.addEventListener) root.addEventListener('scroll', () => { const b = doc.getElementById('appbar'); if (b) b.classList.toggle('scrolled', (root.scrollY || 0) > 4); }, { passive: true });

  // ---------- boot / onboarding ----------
  SK.boot = async function () {
    SK.clearTimers(); SK.dark(false);
    if (!SK.mode) return SK.ageGate();
    if (!SK.token()) return SK.welcome();
    SK.$app.innerHTML = `<div class="main" aria-busy="true"><div class="skel" style="height:56px;margin-top:8px"></div><div class="heroes mt16"><div class="skel" style="height:120px"></div><div class="skel" style="height:120px"></div></div><div class="skel mt24" style="height:140px"></div></div>`;
    const r = await SK.call('GET', '/api/state');
    if (r.status === 200) { SK.render(); return; }
    if (r.status === 0) {
      SK.$app.innerHTML = `<div class="main"><div class="empty full"><div class="art">${Art.skippy(SP.drippet, { size: 96, mood: 'sleepy' })}</div><h2>Can\u2019t reach Skippies</h2><p class="muted mt8">${esc(r.body.message)}</p><button class="btn btn-primary btn-block mt24" id="retry">${ic('refresh', 20)}Try again</button></div></div>`;
      SK.on('retry', () => SK.boot());
    }
  };
  const brand = () => `<div class="flex" style="gap:10px">${Art.skippy(SP.sipsy, { size: 40 })}<span style="font-weight:800;font-size:20px;letter-spacing:.02em">SKIPPIES</span></div>`;
  SK.ageGate = function () {
    SK.$app.innerHTML = `<div class="flow light-flow">${brand()}<div class="flow-body" style="justify-content:flex-start;padding-top:32px">
      <h1>How old are you?</h1><p class="muted">So we can keep the game safe for you. We don\u2019t store your age.</p>
      <div class="group mt8">
        <button class="row" id="a13"><span class="grow"><span class="title">13 to 17</span><br><span class="meta">Play online with players across Singapore</span></span>${ic('next', 20)}</button>
        <button class="row" id="a18"><span class="grow"><span class="title">18 or older</span><br><span class="meta">Play online with players across Singapore</span></span>${ic('next', 20)}</button>
        <button class="row" id="u13"><span class="grow"><span class="title">Under 13</span><br><span class="meta">Play the full game on this device only. Nothing is sent online.</span></span>${ic('next', 20)}</button>
      </div></div></div>`;
    SK.on('a13', () => { SK.setMode('online'); SK.welcome(); });
    SK.on('a18', () => { SK.setMode('online'); SK.welcome(); });
    SK.on('u13', () => { SK.setMode('local'); SK.welcome(); });
  };
  SK.welcome = function () {
    SK.dark(false);
    const pics = ['kopicat', 'sipsy', 'refundo'].map((id, i) => `<span style="transform:translateY(${i === 1 ? -10 : 6}px)">${Art.skippy(SP[id], { size: i === 1 ? 108 : 84 })}</span>`).join('');
    SK.$app.innerHTML = `<div class="flow light-flow">${brand()}<div class="flow-body">
      <div class="flex" style="justify-content:center;gap:0;background:var(--surface);border-radius:var(--r-lg);padding:28px 8px 20px;box-shadow:var(--e1)">${pics}</div>
      <h1 class="display">Bring your own.<br>Hatch a Skippy.</h1>
      <div class="group">
        <div class="row"><span class="lead tnum" style="font-weight:800">1</span><span class="grow body2"><b>Scan</b> your reusable cup, bottle, container or bag, or something you\u2019re recycling.</span></div>
        <div class="row"><span class="lead tnum" style="font-weight:800">2</span><span class="grow body2"><b>Hatch</b> a random Skippy. Merge duplicates up to 5 stars.</span></div>
        <div class="row"><span class="lead tnum" style="font-weight:800">3</span><span class="grow body2"><b>Battle</b> Litterbugs and players near you. The more you BYO, the stronger you get.</span></div>
      </div>
      <p class="caption">${SK.mode === 'local' ? 'Offline mode: nothing leaves this device.' : 'We store your player name (one you make up or a random one), your progress and short photo fingerprints (never your photos). Location is optional and only a rough area.'}</p></div>
      <div class="flow-foot"><button class="btn btn-primary btn-block" id="go">Let\u2019s go</button><button class="btn btn-ghost" id="howscan">How scans work</button></div></div>`;
    SK.on('howscan', SK.howScans);
    SK.on('go', async () => {
      const b = doc.getElementById('go'); if (b) b.disabled = true;
      const r = await SK.call('POST', '/api/register', { age13: true });
      if (r.status !== 200) { SK.toast(SK.errMsg(r, 'Couldn\u2019t create your game.'), 'alert'); if (b) b.disabled = false; return; }
      SK.saveToken(r.body.token); SK.setState(r.body.state); SK.pickName(true);
    });
  };
  SK.howScans = () => SK.sheet('How scans work', `<div class="stack">
    <p>Your phone\u2019s camera checks that the item is really there before you can snap it. The check runs on your phone.</p>
    <p>Your photo is <b>never uploaded</b>. We only send a 16-character fingerprint, so the same photo can\u2019t be used twice.</p>
    <p>Limits keep it fair: one photo a minute and up to ${C.MAX_ACTIONS_PER_DAY} eggs a day.</p>
    <p class="caption">The first scan downloads the scanner (about 5 MB), so it needs internet.</p></div>`);
  // Player name: type your own (3-20 letters/numbers, word filter, must be unique online) or tap a random one.
  // The same rules run here (instant feedback) and on the server (the real check).
  SK.pickName = async function (first) {
    const s = SK.st || {}, days = C.NAME_COOLDOWN_DAYS || 7;
    const nextAt = !first && s.nameSetAt ? s.nameSetAt + days * G.DAY : 0;
    const locked = nextAt > SK.now();
    let names = [];
    const r = await SK.call('GET', '/api/names'); names = (r.body && r.body.names) || [];
    const start = first ? (names[0] || '') : (s.name || '');
    SK.dark(false);
    SK.$app.innerHTML = `<div class="flow light-flow"><div class="flow-top">${first ? '' : `<button class="icon-btn" id="nmback" aria-label="Back">${ic('back', 24)}</button>`}</div>
      <div class="flow-body" style="justify-content:flex-start"><h1>${first ? 'Choose your player name' : 'Change your name'}</h1>
      <p class="muted">Shown on leaderboards and to players you battle. Make one up, or tap a random one below.</p>
      ${locked ? `<div class="banner warn" id="namelock">${ic('timer', 20)}<span>You changed your name recently. You can change it again on <b>${esc(G.ymdOf(nextAt))}</b>.</span></div>` : ''}
      <label class="field" for="nameinput"><span>Player name</span></label>
      <div class="name-field"><input class="input" id="nameinput" maxlength="${G.NAME_MAX}" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="done" value="${esc(start)}" aria-describedby="namemsg namerules" ${locked ? 'disabled' : ''}><span class="name-count tnum" id="namecount" aria-hidden="true">0/${G.NAME_MAX}</span></div>
      <p class="name-msg" id="namemsg" role="status" aria-live="polite"></p>
      <p class="caption" id="namerules">${G.NAME_MIN} to ${G.NAME_MAX} letters, numbers or spaces. No rude words. Don\u2019t use your real full name, school, class or phone number.${first ? '' : ' You can change your name once every ' + days + ' days.'}</p>
      <div class="name-sugg"><span class="label">Random names</span><button class="btn btn-ghost btn-sm" id="rer" ${locked ? 'disabled' : ''}>${ic('refresh', 18)}Shuffle</button></div>
      <div class="chips name-chips" role="radiogroup" aria-label="Random names" id="namechips"></div></div>
      <div class="flow-foot"><button class="btn btn-primary btn-block" id="namego" disabled>${first ? 'Start playing' : 'Save name'}</button></div></div>`;
    const inp = doc.getElementById('nameinput'), cnt = doc.getElementById('namecount'), msg = doc.getElementById('namemsg'), go = doc.getElementById('namego'), box = doc.getElementById('namechips');
    let seq = 0, timer = null;
    const say = (text, kind) => { msg.textContent = text || ''; msg.className = 'name-msg' + (kind ? ' ' + kind : ''); };
    const drawChips = () => {
      const cur = G.cleanName(inp.value);
      box.innerHTML = names.map((n, i) => `<button class="chip" role="radio" aria-checked="${n === cur}" data-nm="${i}" ${locked ? 'disabled' : ''}>${esc(n)}</button>`).join('');
      box.querySelectorAll('[data-nm]').forEach(b => b.onclick = () => { inp.value = names[+b.dataset.nm]; update(); });
    };
    const update = () => {
      const raw = inp.value, cur = G.cleanName(raw); seq++;
      cnt.textContent = cur.length + '/' + G.NAME_MAX;
      cnt.classList.toggle('over', cur.length > G.NAME_MAX);
      box.querySelectorAll('[data-nm]').forEach(b => b.setAttribute('aria-checked', names[+b.dataset.nm] === cur ? 'true' : 'false'));
      if (timer) { root.clearTimeout(timer); timer = null; }
      if (locked) { go.disabled = true; return; }
      if (!first && cur === s.name) { say('This is your current name.', ''); go.disabled = true; return; }
      const c = G.checkName(raw);
      if (!c.ok) { say(cur ? c.message : '', cur ? 'bad' : ''); go.disabled = true; inp.setAttribute('aria-invalid', cur ? 'true' : 'false'); return; }
      inp.setAttribute('aria-invalid', 'false'); go.disabled = false;
      if (SK.mode !== 'online') { say('Looks good.', 'good'); return; }
      say('Checking\u2026', ''); const mine = seq;
      timer = root.setTimeout(async () => {
        const x = await SK.call('GET', '/api/name-check?name=' + encodeURIComponent(c.name));
        if (mine !== seq) return; // they kept typing
        if (x.status === 200 && x.body && x.body.ok === false) { say(x.body.message, 'bad'); go.disabled = true; }
        else say(x.status === 200 ? 'Looks good. That name is free.' : 'Looks good.', 'good');
      }, 450);
    };
    inp.oninput = update;
    inp.onkeydown = e => { if (e.key === 'Enter' && !go.disabled) go.click(); };
    drawChips(); update();
    SK.on('rer', async () => {
      const x = await SK.call('GET', '/api/names'); if (x.status !== 200) return SK.toast(SK.errMsg(x), 'alert');
      names = x.body.names || []; inp.value = names[0] || inp.value; drawChips(); update();
    });
    SK.on('nmback', () => SK.render());
    SK.on('namego', async () => {
      const c = G.checkName(inp.value); if (!c.ok) { say(c.message, 'bad'); return; }
      go.disabled = true;
      const x = await SK.call('POST', '/api/name', { name: c.name });
      if (x.status !== 200) { const m = SK.errMsg(x); say(m, 'bad'); SK.toast(m, 'alert'); go.disabled = x.body && x.body.error !== 'namecooldown' ? false : true; return; }
      SK.tab = 'home'; SK.render(); SK.toast(first ? 'Welcome, ' + SK.st.name + '!' : 'Name saved', 'check');
    });
  };

  // ---------- evolution cutscene ----------
  SK.playEvolution = function (id, ev, done) {
    SK.dark(true); SK.clearTimers();
    const d = SK.st.dex[id];
    SK.$app.innerHTML = `<div class="flow dark" aria-live="polite"><div class="flow-body center"><p class="label">Something is happening</p>
      <div class="flex" style="justify-content:center"><span class="${SK.reduced ? '' : 'glow'}">${Art.skippy(SP[id], { size: 180, stage: Math.max(0, d.stage - 1) })}</span></div><h2>${esc(ev.from)} is evolving</h2></div></div>`;
    SK.later(() => {
      SK.$app.innerHTML = `<div class="flow dark"><div class="flow-body center"><p class="label">Evolved</p>
        <div class="flex ${SK.reduced ? '' : 'pop'}" style="justify-content:center">${Art.skippy(SP[id], { size: 200, stage: d.stage, bob: !SK.reduced })}</div>
        <h1 class="display">${esc(ev.to)}</h1><p class="muted">${esc(ev.from)} evolved. Its ${esc(G.TYPE_MOVE[SP[id].type])} is stronger and its stats went up.</p></div>
        <div class="flow-foot"><button class="btn btn-accent btn-block" id="evok">Continue</button></div></div>`;
      SK.announce(ev.from + ' evolved into ' + ev.to); SK.vibrate([30, 40, 60]); SK.on('evok', done);
    }, SK.reduced ? 400 : 1800);
  };
})(typeof window !== 'undefined' ? window : globalThis);
