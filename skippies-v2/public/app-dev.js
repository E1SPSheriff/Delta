(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document, G = root.G, D = root.DevMode;
  const LS = SK.LS, esc = SK.esc, ic = SK.ic;
  const K_ACTIVE = 'skippies2.devActive', K_TOKEN = 'skippies2.devToken', K_PRES = 'skippies2.devPresentation';
  const dev = SK.dev = {
    available: true,
    checked: true,
    active: LS.get(K_ACTIVE) === '1',
    presentation: LS.get(K_PRES) === '1',
    reason: 'DEV MODE available',
    saved: null,
    token: () => LS.get(K_TOKEN),
    setToken: t => { if (t) LS.set(K_TOKEN, t); else LS.del(K_TOKEN); },
    status: () => dev.active ? (dev.presentation ? 'DEV DEMO · presentation' : 'DEV DEMO') : 'REAL PLAYER'
  };
  let bridge = null;

  function rewrite(path) {
    if (path.indexOf('/api/dev/') === 0) return '/api/demo/dev/' + path.slice(9);
    if (path.indexOf('/api/') === 0) return '/api/demo/' + path.slice(5);
    return path;
  }
  function grayFor(n) { return Array.from({ length: 72 }, (_, i) => ((i * 37 + n * 29) % 256) < 128 ? 18 : 242); }
  function toast(text, icon) { SK.toast(text, icon || 'info'); }

  dev.syncBadge = function () {
    if (!dev.badge) return;
    dev.badge.style.display = dev.active ? '' : 'none';
    dev.badge.innerHTML = '<b>DEV MODE</b><span>Simulation data. Not legitimate player progress.</span>';
  };
  dev.checkAvailability = async function () {
    dev.available = true; dev.checked = true; dev.reason = 'DEV MODE available'; dev.syncBadge();
    return true;
  };
  dev.bridge = function () {
    if (bridge) return bridge;
    const store = SkippiesAPI.createMemoryStore();
    const api = SkippiesAPI.createApi(store, { mode: 'demo', randomHex: SK.randomHex, sha256: async s => SK.sha256hex(s) });
    bridge = D.createRuntime({ store, api, randomHex: SK.randomHex, sha256: async s => SK.sha256hex(s), rng: Math.random });
    return bridge;
  };
  dev.rawCall = async function (method, path, body) {
    const route = rewrite(path), token = dev.token();
    const headers = {};
    if (method !== 'GET' && method !== 'DELETE') headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    if (!SK.SERVER || SK.mode === 'local') {
      try { return await dev.bridge().handle({ method, path: route, headers, body: body || {} }); }
      catch (e) { return { status: 0, body: { error: 'demo', message: 'DEV MODE could not start.' } }; }
    }
    try {
      const res = await root.fetch(SK.SERVER + route, {
        method, headers,
        body: method === 'GET' || (method === 'DELETE' && !body) ? undefined : JSON.stringify(body || {})
      });
      let b = {}; try { b = await res.json(); } catch (e) { }
      return { status: res.status, body: b };
    } catch (e) { return { status: 0, body: { error: 'network', message: 'You\u2019re offline. DEV MODE needs the demo server.' } }; }
  };
  dev.enter = async function () {
    if (!dev.checked) await dev.checkAvailability();
    if (!dev.available) { toast('DEV MODE is off on this server. Ask for a dedicated DEMO deployment.', 'lock'); return false; }
    if (!SK.mode || !SK.st) { toast('Choose a player first, then open DEV MODE.', 'info'); return false; }
    dev.saved = { st: G.clone(SK.st), tab: SK.tab, mode: SK.mode, token: LS.get('skippies2.token.' + SK.mode) };
    dev.active = true; dev.setToken(null); LS.set(K_ACTIVE, '1'); dev.syncBadge();
    const r = await dev.rawCall('POST', '/api/dev/session', {});
    if (r.status !== 200) {
      const msg = SK.errMsg(r, 'Could not start the demo session.');
      dev.active = false; dev.saved = null; dev.setToken(null); LS.set(K_ACTIVE, '0'); dev.syncBadge();
      toast(msg, 'alert'); return false;
    }
    dev.setToken(r.body.token); SK.setState(r.body.state); SK.tab = 'home'; SK.render(); SK.devPanel();
    toast('DEV MODE active. Real player saved and untouched.', 'check');
    return true;
  };
  dev.bootDemo = async function () {
    if (!dev.checked) await dev.checkAvailability();
    if (!dev.available) {
      dev.active = false; dev.presentation = false; dev.saved = null; dev.setToken(null);
      LS.set(K_ACTIVE, '0'); LS.set(K_PRES, '0'); dev.syncBadge(); SK.boot(); return;
    }
    let r = dev.token() ? await dev.rawCall('GET', '/api/dev/session') : null;
    if (!r || r.status === 401 || r.status === 0) {
      const fresh = await dev.rawCall('POST', '/api/dev/session', {});
      if (fresh.status === 200) { dev.setToken(fresh.body.token); SK.setState(fresh.body.state); SK.render(); toast('Demo session renewed after refresh.', 'info'); return; }
      await dev.exit(true); toast('Demo session expired. Real player restored.', 'info'); return;
    }
    if (r.status === 200) { SK.setState(r.body.state); SK.render(); return; }
    await dev.exit(true); toast('Could not load demo state. Real player restored.', 'alert');
  };
  dev.exit = async function (silent) {
    dev.active = false; dev.presentation = false; dev.setToken(null);
    LS.set(K_ACTIVE, '0'); LS.set(K_PRES, '0'); dev.syncBadge();
    if (dev.saved) {
      SK.setState(dev.saved.st); SK.tab = dev.saved.tab;
      if (dev.saved.mode && SK.mode !== dev.saved.mode) SK.setMode(dev.saved.mode);
      if (dev.saved.token) LS.set('skippies2.token.' + SK.mode, dev.saved.token);
    }
    dev.saved = null;
    try { await SK.boot(); } catch (e) { SK.render(); }
    if (!silent) toast('Real player restored. Demo data discarded.', 'check');
  };
  async function preset(name, message, show) {
    const r = await SK.call('POST', '/api/dev/preset', { preset: name });
    if (r.status !== 200) { toast(SK.errMsg(r, message + ' failed.'), 'alert'); return false; }
    toast(message, 'check'); SK.render();
    if (show) show(); else if (SK.dev.active) SK.devPanel();
    return true;
  }
  function openTab(tab) { SK.tab = tab; SK.render(); }
  async function devBattle(kind, result) {
    const r = await SK.call('POST', '/api/dev/battle', { kind, result });
    if (r.status !== 200) { toast(SK.errMsg(r, 'Could not stage that battle.'), 'alert'); return; }
    if (SK.showBattleResult) SK.showBattleResult(kind, r.body.result, kind === 'campaign' ? 0 : null, () => SK.devPanel());
    else SK.devPanel();
  }
  async function mergeFlow() {
    if (!await preset('mergeReady', 'Merge state ready')) return;
    const r = await SK.call('POST', '/api/merge', { id: 'sipsy' });
    if (r.status !== 200) { toast(SK.errMsg(r, 'Merge failed.'), 'alert'); return SK.devPanel(); }
    const ev = r.body && r.body.result && r.body.result.evolved;
    const done = () => { openTab('dex'); SK.devPanel(); };
    if (ev && SK.playEvolution) SK.playEvolution('sipsy', ev, done); else done();
  }
  async function simulate(kind) {
    if (kind === 'daily') await preset('habitMaxToday', 'Daily limit state ready');
    if (kind === 'duplicate') await preset('habitNew', 'Duplicate-check state ready');
    if (kind === 'validRecycle') await preset('habit3', 'Recycling state ready');
    const cfg = {
      byo: { item: 'cup', detected: ['cup'], gray: grayFor(1), label: 'Valid BYO' },
      recycle: { item: 'bottle', detected: ['bottle'], gray: grayFor(2), label: 'Valid recycling' },
      duplicate: { item: 'cup', detected: ['cup'], gray: grayFor(3), label: 'Duplicate photo' },
      failed: { item: 'cup', detected: ['person'], gray: grayFor(4), label: 'Failed detection' },
      daily: { item: 'cup', detected: ['cup'], gray: grayFor(5), label: 'Daily limit' }
    }[kind];
    if (!cfg) return;
    toast('DEV simulation: ' + cfg.label, 'camera');
    if (kind === 'byo' || kind === 'recycle' || kind === 'failed') {
      const r = await SK.submitCapture(cfg.item, cfg.gray, cfg.detected, { dev: true });
      if (r.status === 200) SK.later(() => { if (SK.dev.active) SK.devPanel(); }, 2600);
      return r;
    }
    const hash = G.dhash(cfg.gray);
    const r = await SK.call('POST', '/api/action', { item: cfg.item, hash, detected: cfg.detected });
    toast(kind === 'daily' ? 'DEV result: daily limit reached' : 'DEV result: duplicate photo rejected', r.status === 200 ? 'check' : 'alert');
    SK.devPanel();
    return r;
  }
  function uiState(kind) {
    const states = {
      offline: ['Offline UI', `<div class="banner warn">${ic('offline', 22)}<span><b>Offline state preview.</b>Progress stays on this device. This preview changes no settings.</span></div>`],
      empty: ['Empty state', `<div class="empty"><div class="art">${Art.egg(72)}</div><h2>Nothing here yet</h2><p class="muted">This is what a brand-new collection looks like.</p></div>`],
      loading: ['Loading state', `<div class="stack-8"><div class="skel" style="height:24px"></div><div class="skel" style="height:72px"></div><div class="skel" style="height:72px"></div></div>`],
      error: ['Error state', `<div class="banner err">${ic('alert', 22)}<span><b>Something went wrong.</b><br><span class="caption">Retry, or check Help &amp; recovery.</span></span></div>`],
      locked: ['Locked state', `<div class="card locked"><span class="lead">${ic('lock', 22)}</span><span class="grow"><span class="title">Locked</span><br><span class="meta">Earn real BYO days to open this.</span></span></div>`],
      full: ['Full state', `<div class="banner reward">${ic('check', 22)}<span><b>All caught up.</b><br><span class="caption">Every task is complete for this preview.</span></span></div>`]
    };
    const s = states[kind]; if (!s) return;
    SK.sheet(s[0], '<div class="dev-preview">' + s[1] + '</div>');
  }
  function openHabit() {
    const habit = G.habitStats(SK.st, SK.now()), reuse = G.reusableStats(SK.st, SK.now());
    SK.sheet('BYO habit preview', `<div class="stack">
      <div class="banner info">${ic('calendar', 22)}<span><b>${habit.successful} of 7 days</b> this week. Current streak ${habit.current}, longest ${habit.longest}.</span></div>
      <div class="group">${habit.days.map(d => `<div class="row"><span class="lead">${ic(d.done ? 'check' : 'calendar', 18)}</span><span class="grow title">${esc(G.ymdOf(d.adn * G.DAY))}</span><span class="trail">${d.done ? 'Done' : 'Missed'}</span></div>`).join('')}</div>
      <div class="group"><div class="row"><span class="grow"><span class="title">${esc(reuse.nickname)}</span><br><span class="meta">Reusable identity</span></span><span class="trail tnum">${reuse.uses} uses</span></div>
      <div class="row"><span class="grow title">Potentially avoided</span><span class="trail tnum">${reuse.potentiallyAvoided}</span></div></div></div>`);
  }
  function openIdentity() {
    const r = G.reusableStats(SK.st, SK.now());
    SK.sheet('Reusable identity preview', `<div class="stack">
      <div class="banner reward">${ic('sparkle', 22)}<span><b>${esc(r.nickname)}</b><br><span class="caption">Demo reusable identity, not a real purchase.</span></span></div>
      <div class="group"><div class="row"><span class="grow title">BYO uses</span><span class="trail tnum">${r.uses}</span></div>
      <div class="row"><span class="grow title">Current streak</span><span class="trail tnum">${r.current} days</span></div>
      <div class="row"><span class="grow title">Potentially avoided</span><span class="trail tnum">${r.potentiallyAvoided}</span></div></div></div>`);
  }
  async function openRecap() {
    const r = await SK.call('GET', '/api/season/recap');
    const v = r.status === 200 ? r.body.recap : G.seasonRecap(SK.st, SK.now());
    SK.sheet('Season Recap preview', `<div class="stack">
      <div class="banner reward">${ic('trophy', 22)}<span><b>Season ${v.season}</b><br><span class="caption">${v.activeDays} active days · ${v.byoDays} BYO days</span></span></div>
      <div class="group"><div class="row"><span class="grow title">Longest streak</span><span class="trail tnum">${v.streak} days</span></div>
      <div class="row"><span class="grow title">Species discovered</span><span class="trail tnum">${v.discovered}</span></div>
      <div class="row"><span class="grow title">Eggs opened</span><span class="trail tnum">${v.hatched}</span></div>
      <div class="row"><span class="grow title">Strongest Skippy</span><span class="trail">${esc(SK.nm(v.strongest))}</span></div>
      <div class="row"><span class="grow title">Season claim</span><span class="trail">${v.reward ? 'Issued (demo)' : 'Not issued'}</span></div></div></div>`);
  }
  async function togglePresentation() {
    if (dev.presentation) { dev.presentation = false; LS.set(K_PRES, '0'); SK.devPanel(); return; }
    const r = await SK.call('POST', '/api/dev/preset', { preset: 'full' });
    if (r.status !== 200) { toast(SK.errMsg(r, 'Could not build presentation state.'), 'alert'); return; }
    await SK.call('POST', '/api/dev/preset', { preset: 'season' });
    dev.presentation = true; LS.set(K_PRES, '1'); SK.render(); SK.devPresentation();
  }

  async function devAction(action) {
    switch (action) {
      case 'full': return preset('full', 'Full demo unlocked');
      case 'reset': return preset('reset', 'Demo state reset');
      case 'exit': return dev.exit();
      case 'unlockAll': return preset('unlockAll', 'All species and forms unlocked');
      case 'discoverAll': return preset('discoverAll', 'All species discovered');
      case 'eggs': return preset('eggs', 'Three demo eggs added');
      case 'scrap': return preset('scrap', '+500 demo scrap');
      case 'energy': return preset('energy', 'Demo energy restored');
      case 'maxTeam': return preset('maxTeam', 'Strongest demo team selected');
      case 'openDex': return openTab('dex');
      case 'battleWin': return devBattle('campaign', 'win');
      case 'battleLose': return devBattle('campaign', 'lose');
      case 'hatch': return simulate('byo');
      case 'merge': return mergeFlow();
      case 'battleArena': openTab('battle'); SK.battleSub('arena'); return;
      case 'rankedArena': return SK.devStartArena ? SK.devStartArena(true) : (openTab('battle'), SK.battleSub('arena'));
      case 'habitNew': return preset('habitNew', 'New habit state');
      case 'habit3': return preset('habit3', '3-day streak ready');
      case 'habit7': return preset('habit7', '7-day habit state ready');
      case 'habitMonth': return preset('habitMonth', 'Strong month ready');
      case 'openHabit': return openHabit();
      case 'reusable': return preset('reusable', 'Demo reusable Cuppy ready');
      case 'openIdentity': return openIdentity();
      case 'scanByo': return simulate('byo');
      case 'scanRecycle': return simulate('recycle');
      case 'scanDuplicate': return simulate('duplicate');
      case 'scanFailed': return simulate('failed');
      case 'scanDaily': return simulate('daily');
      case 'rewardNone': return preset('rewardNone', 'Reward: not eligible');
      case 'rewardAlmost': return preset('rewardAlmost', 'Reward: almost eligible');
      case 'rewardEligible': return preset('rewardEligible', 'Reward: eligible');
      case 'rewardAvailable': return preset('rewardAvailable', 'Reward: claim available');
      case 'rewardClaimed': return preset('rewardClaimed', 'Reward: demo claim issued');
      case 'rewardRedeemed': return preset('rewardRedeemed', 'Reward: demo claim redeemed');
      case 'openRewards': return openTab('rewards');
      case 'season': return preset('season', 'Demo season recap ready', openRecap);
      case 'openRecap': return openRecap();
      case 'uiOffline': return uiState('offline');
      case 'uiEmpty': return uiState('empty');
      case 'uiLoading': return uiState('loading');
      case 'uiError': return uiState('error');
      case 'uiLocked': return uiState('locked');
      case 'uiFull': return uiState('full');
      case 'presentation': return togglePresentation();
      default: return;
    }
  }

  function card(title, subtitle, icon, buttons) {
    return `<section class="dev-card"><div class="section-head"><span class="lead">${ic(icon, 22)}</span><span class="grow"><span class="label">${esc(title)}</span><br><span class="caption">${esc(subtitle)}</span></span></div>
      <div class="dev-grid">${buttons.map(([key, label]) => `<button class="btn btn-secondary btn-sm" data-dev="${key}">${esc(label)}</button>`).join('')}</div></section>`;
  }
  SK.devPanel = function () {
    const s = SK.st || {}, recap = G.seasonRecap(s, SK.now()), habit = G.habitStats(s, SK.now());
    const body = `<div class="flow light-flow dev-panel"><div class="flow-top"><button class="icon-btn" id="dev-back" aria-label="Back">${ic('back', 24)}</button><h2>DEV MODE</h2><button class="icon-btn" id="dev-exit" aria-label="Exit DEV MODE">${ic('close', 24)}</button></div>
      <div class="dev-flow-body" style="justify-content:flex-start">
        <div class="dev-warning">${ic('alert', 22)}<span><b>Simulation data. Not legitimate player progress.</b><br><span class="caption">Temporary demo state. Real saves, rankings, Elo and MamaShop claims are isolated.</span></span></div>
        <div class="dev-status"><span class="badge ${dev.active ? 'demo-on' : ''}">${esc(dev.status())}</span><span class="caption">${esc(dev.reason)}</span></div>
        <div class="dev-card"><div class="section-head"><span class="label">Player</span><span class="caption tnum">${Object.keys(s.dex || {}).length} species · ${habit.successful}/7 days · season ${recap.season}</span></div>
          <div class="dev-grid"><button class="btn btn-primary btn-sm" data-dev="full">Unlock full demo</button><button class="btn btn-secondary btn-sm" data-dev="reset">Reset demo state</button><button class="btn btn-danger btn-sm" data-dev="exit">Restore real player</button></div></div>
        ${card('Skippies and Dex', 'Derived from the canonical game data', 'egg', [['unlockAll', 'Unlock all species'], ['discoverAll', 'Discover all'], ['eggs', 'Add eggs'], ['scrap', 'Add scrap'], ['energy', 'Restore energy'], ['maxTeam', 'Max demo team'], ['openDex', 'Open Dex']])}
        ${card('Battle', 'Real battle flow with demo state only', 'battle', [['battleWin', 'Win state'], ['battleLose', 'Lose state'], ['hatch', 'Hatch'], ['merge', 'Evolution / merge'], ['battleArena', 'Arena'], ['rankedArena', 'Ranked arena']])}
        ${card('BYO habit', 'Realistic missed and successful days', 'calendar', [['habitNew', 'New habit'], ['habit3', '3-day streak'], ['habit7', '7-day streak'], ['habitMonth', 'Strong month'], ['openHabit', 'View weekly BYO']])}
        ${card('Reusable identity', 'A realistic BYO habit companion', 'cup', [['reusable', 'Demo reusable'], ['openIdentity', 'View identity']])}
        ${card('Scanner simulation', 'Security checks still run on the demo server', 'camera', [['scanByo', 'Valid BYO'], ['scanRecycle', 'Valid recycling'], ['scanDuplicate', 'Duplicate'], ['scanFailed', 'Failed detection'], ['scanDaily', 'Daily limit']])}
        ${card('MamaShop Rewards', 'Demo lifecycle only, never a store claim', 'trophy', [['rewardNone', 'Not eligible'], ['rewardAlmost', 'Almost eligible'], ['rewardEligible', 'Eligible'], ['rewardAvailable', 'Claim available'], ['rewardClaimed', 'Claimed'], ['rewardRedeemed', 'Redeemed'], ['openRewards', 'Open Rewards']])}
        ${card('Season Recap', 'A showcase season without touching real progress', 'sparkle', [['season', 'Generate demo season'], ['openRecap', 'Open Season Recap']])}
        ${card('UI state testing', 'Previews only, no settings are changed', 'info', [['uiOffline', 'Offline UI'], ['uiEmpty', 'Empty state'], ['uiLoading', 'Loading state'], ['uiError', 'Error state'], ['uiLocked', 'Locked state'], ['uiFull', 'Full state']])}
      </div><div class="flow-foot"><button class="btn btn-primary btn-block" data-dev="presentation">${ic('sparkle', 20)}${dev.presentation ? 'Exit presentation mode' : 'Presentation mode'}</button></div></div>`;
    SK.$app.innerHTML = body;
    SK.$app.querySelectorAll('[data-dev]').forEach(b => b.onclick = () => devAction(b.dataset.dev));
    SK.on('dev-back', () => SK.render());
    SK.on('dev-exit', () => dev.exit());
  };
  SK.devPresentation = function () {
    const steps = [
      ['identity', 'Reusable identity', 'cup', 'Cuppy, with realistic BYO uses'],
      ['scanner', 'Scanner / BYO action', 'camera', 'A valid photo-checked BYO simulation'],
      ['progression', 'Skippy reward and game progression', 'egg', 'Hatch, collect, merge and evolve'],
      ['habit', 'BYO habit progress', 'calendar', 'A strong month with real-looking gaps'],
      ['battle', 'Battle and collection', 'battle', 'Campaign, Arena and ranked Arena'],
      ['rewards', 'MamaShop Rewards', 'trophy', 'Every claim lifecycle state'],
      ['recap', 'Season Recap', 'sparkle', 'One showcase season summary']
    ];
    const body = `<div class="flow light-flow dev-panel"><div class="flow-top"><button class="icon-btn" id="devp-back" aria-label="Back">${ic('back', 24)}</button><h2>Presentation mode</h2><button class="icon-btn" id="devp-exit" aria-label="Exit DEV MODE">${ic('close', 24)}</button></div>
      <div class="dev-flow-body" style="justify-content:flex-start"><div class="dev-warning">${ic('alert', 22)}<span><b>DEV DEMO · presentation.</b><br><span class="caption">Tap a step to jump straight to that part of the story. All data here is simulated.</span></span></div>
      <div class="group">${steps.map(([key, title, icon, sub], i) => `<button class="row" data-step="${key}"><span class="lead">${ic(icon, 20)}</span><span class="grow"><span class="title">${i + 1}. ${esc(title)}</span><br><span class="meta">${esc(sub)}</span></span>${ic('next', 20)}</button>`).join('')}</div></div>
      <div class="flow-foot"><button class="btn btn-secondary btn-block" id="devp-panel">${ic('settings', 20)}Dev panel</button></div></div>`;
    SK.$app.innerHTML = body;
    SK.$app.querySelectorAll('[data-step]').forEach(b => b.onclick = async () => {
      const step = b.dataset.step;
      if (step === 'identity') return openIdentity();
      if (step === 'scanner') return simulate('byo');
      if (step === 'progression') { openTab('dex'); return; }
      if (step === 'habit') return openHabit();
      if (step === 'battle') { openTab('battle'); SK.battleSub('campaign'); return; }
      if (step === 'rewards') return openTab('rewards');
      if (step === 'recap') return openRecap();
    });
    SK.on('devp-back', () => SK.devPanel());
    SK.on('devp-exit', () => dev.exit());
    SK.on('devp-panel', () => SK.devPanel());
  };

  dev.storageKey = key => dev.active ? key + '.dev' : key;
  const _boot = SK.boot;
  SK.boot = function () { if (dev.active) return dev.bootDemo(); return _boot.apply(this, arguments); };
  const _wipe = SK.wipe;
  SK.wipe = function () {
    const out = _wipe.apply(this, arguments);
    dev.active = false; dev.presentation = false; dev.saved = null; dev.setToken(null);
    LS.set(K_ACTIVE, '0'); LS.set(K_PRES, '0'); dev.syncBadge();
    return out;
  };

  dev.badge = doc.createElement('div');
  dev.badge.className = 'dev-badge';
  dev.badge.setAttribute('role', 'status');
  doc.body.appendChild(dev.badge);
  dev.syncBadge();
})(typeof window !== 'undefined' ? window : globalThis);
