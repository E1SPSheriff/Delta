/* SKIPPIES: Leaderboards, Recycling Radar (NEA open data; exact location stays on the phone), Settings (area, reminders, push, privacy, delete). Boots the app. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document, nav = root.navigator;
  const { C } = G;
  const esc = SK.esc, ic = SK.ic;

  // ---------- leaderboards ----------
  let board = 'ecoweek', scope = 'global', lb = null;
  SK.views.ranks = function () {
    const s = SK.st;
    const B = [['ecoweek', 'This week'], ['eco', 'All time'], ['arena', 'Arena']];
    const head = `<div class="page-title"><h1>Ranks</h1></div>
      <div class="seg" role="radiogroup" aria-label="Leaderboard">${B.map(([k, l]) => `<button role="radio" data-b="${k}" aria-checked="${board === k}">${l}</button>`).join('')}</div>
      <div class="chips mt12" role="radiogroup" aria-label="Area"><button class="chip" role="radio" data-s="global" aria-checked="${scope === 'global'}">Singapore</button><button class="chip" role="radio" data-s="zone" aria-checked="${scope === 'zone'}">${ic('location', 16)}Near me</button></div>
      <p class="caption mt8">${board === 'arena' ? 'Arena rating from player battles.' : 'Photo-checked BYO and recycling actions' + (board === 'ecoweek' ? ' since Monday.' : '.')} Practice bots never appear.</p>`;
    if (s.mode === 'local') return head + `<div class="banner warn mt16">${ic('offline', 20)}<span>Offline mode: Singapore-wide rankings need the online version. You\u2019re the only player on this device.</span></div>` + table();
    if (scope === 'zone' && !s.zone) return head + `<div class="empty mt16"><h2>Set your area first</h2><p class="muted">Share a rough area (about 5 km, never your exact location) to rank against players near you.</p><button class="btn btn-primary mt16" id="toradar">${ic('location', 20)}Set my area</button></div>`;
    return head + table();
  };
  function table() {
    if (!lb) return `<div class="stack-8 mt16"><div class="skel" style="height:150px"></div><div class="skel" style="height:56px"></div><div class="skel" style="height:56px"></div></div>`;
    if (lb.error) return `<div class="banner err mt16">${ic('alert', 20)}<span>${esc(lb.error)}</span></div>`;
    if (!lb.rows.length) return `<div class="empty mt16"><h2>No one yet</h2><p class="muted">Be the first on this board.</p></div>`;
    const unit = board === 'arena' ? 'rating' : 'actions';
    const top = lb.rows.slice(0, 3), rest = lb.rows.slice(3);
    const order = [top[1], top[0], top[2]];
    const podium = `<div class="podium" aria-label="Top 3">${order.map((r, i) => r ? `<div class="p p${[2, 1, 3][i]} ${r.me ? 'me' : ''}"><span class="pn">${esc(r.name)}${r.me ? ' (you)' : ''}</span><span class="caption tnum">${SK.fmt(r.score)} ${unit}</span><div class="blk">${r.rank}</div></div>` : '<div></div>').join('')}</div>`;
    const meRow = lb.me && !lb.rows.some(r => r.me) ? `<div class="row you"><span class="rk">${lb.me.rank}</span><span class="grow title">You</span><span class="trail">${SK.fmt(lb.me.score)}</span></div>` : '';
    return `<section class="section" style="margin-top:16px">${podium}
      ${rest.length ? `<div class="group lb">${rest.map(r => `<div class="row ${r.me ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="grow title">${esc(r.name)}${r.me ? ' (you)' : ''}</span><span class="trail">${SK.fmt(r.score)}</span></div>`).join('')}</div>` : ''}
      ${meRow}<p class="caption mt12 tnum">${lb.total} player${lb.total === 1 ? '' : 's'}</p></section>`;
  }
  async function loadLb() {
    const r = await SK.call('GET', `/api/leaderboard?board=${board}&scope=${scope}`);
    lb = r.status === 200 ? r.body : { error: SK.errMsg(r) };
    if (SK.tab === 'ranks' && !SK.inBattle() && doc.getElementById('main')) SK.render();
  }
  SK.binders.ranks = function () {
    SK.$app.querySelectorAll('[data-b]').forEach(b => b.onclick = () => { board = b.dataset.b; lb = null; SK.render(); });
    SK.$app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { scope = b.dataset.s; lb = null; SK.render(); });
    SK.on('toradar', () => { SK.tab = 'radar'; SK.render(); });
    if (!lb && !(scope === 'zone' && !SK.st.zone)) loadLb();
  };
  const _render = SK.render;
  SK.render = function () { if (SK.tab !== 'ranks') lb = null; return _render.apply(this, arguments); };

  // ---------- settings ----------
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function b64u(s) { const pad = '='.repeat((4 - s.length % 4) % 4), raw = root.atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
  async function pushState() { try { if (!('serviceWorker' in nav)) return false; const reg = await nav.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()); } catch (e) { return false; } }
  async function enablePush() {
    if (!('serviceWorker' in nav) || !root.PushManager || !root.Notification) { SK.toast('This browser can\u2019t do push reminders. On iPhone, add Skippies to your Home Screen first (iOS 16.4+). Calendar reminders work everywhere.', 'info'); return false; }
    const perm = await root.Notification.requestPermission(); if (perm !== 'granted') { SK.toast('Notifications are blocked. Calendar reminders still work.', 'alert'); return false; }
    try {
      const kr = await root.fetch(SK.SERVER + '/api/push/key'); const k = await kr.json(); if (!k.publicKey) throw new Error('no key');
      const reg = await nav.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(k.publicKey) });
      const r = await SK.call('POST', '/api/push', { subscription: sub.toJSON() });
      if (r.status !== 200) throw new Error('save');
      SK.toast('Reminders are on', 'bell'); return true;
    } catch (e) { SK.toast('Couldn\u2019t turn on push reminders here. Calendar reminders still work.', 'alert'); return false; }
  }
  async function disablePush() {
    try { const reg = await nav.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { }
    await SK.call('DELETE', '/api/push'); SK.toast('Push reminders off', 'check');
  }
  SK.settings = function () {
    const s = SK.st, rm = s.reminders, local = s.mode === 'local';
    const { sh, close } = SK.sheet('Profile and settings', `
      <div class="group">
        <div class="row"><span class="lead" style="background:none">${s.buddy && s.dex[s.buddy] ? SK.art(s.buddy, { size: 40 }) : ic('egg', 20)}</span><span class="grow"><span class="title">${esc(s.name)}</span><br><span class="meta">${local ? 'Offline mode' : 'Online'} \u00b7 season ${s.season}</span></span><button class="btn btn-ghost btn-sm" id="rename">Change</button></div>
        <div class="row"><span class="lead">${ic('users', 20)}</span><span class="grow"><span class="meta">Friend code</span><br><span class="code">${esc(s.friendCode)}</span></span><button class="btn btn-ghost btn-sm" id="copyfc">${ic('copy', 16)}Copy</button></div>
      </div>
      <div class="section-head mt24"><span class="label">Reminders</span></div>
      <div class="group" style="padding:12px 16px">
        <label class="field"><span>Daily BYO reminder</span><input class="input tnum" type="time" id="rbyo" value="${esc(rm.byo)}"></label>
        <div class="flex mt12" style="align-items:flex-end"><label class="field grow"><span>Recycling day</span><select class="input" id="rdow">${DOW.map((d, i) => `<option value="${i}" ${i === rm.recycleDow ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <label class="field" style="width:42%"><span>Time</span><input class="input tnum" type="time" id="rtime" value="${esc(rm.recycleTime)}"></label></div>
        <button class="btn btn-secondary btn-block mt12" id="rsave">Save times</button>
      </div>
      <div class="group mt12">
        ${local ? '' : `<div class="row"><span class="lead">${ic('bell', 20)}</span><span class="grow"><span class="title">Push reminders</span><br><span class="meta">Singapore time, at the times above</span></span><label class="toggle"><input type="checkbox" id="pushtog" aria-label="Push reminders"><i></i></label></div>`}
        <button class="row" id="ics1"><span class="lead">${ic('calendar', 20)}</span><span class="grow"><span class="title">Add BYO reminder to calendar</span><br><span class="meta">Works on every phone</span></span>${ic('next', 20)}</button>
        <button class="row" id="ics2"><span class="lead">${ic('calendar', 20)}</span><span class="grow"><span class="title">Add recycling reminder to calendar</span><br><span class="meta">Weekly</span></span>${ic('next', 20)}</button>
      </div>
      <div class="section-head mt24"><span class="label">About</span></div>
      <div class="group">
        <a class="row" href="${esc(root.MAMASHOP_REWARDS_URL || './rewards/')}" target="_blank" rel="noopener"><span class="lead">${ic('trophy', 20)}</span><span class="grow"><span class="title">Mamashop Rewards</span><br><span class="meta">View points, tiers and rewards</span></span>${ic('next', 20)}</a>
        <button class="row" id="hows"><span class="lead">${ic('camera', 20)}</span><span class="grow title">How scans work</span>${ic('next', 20)}</button>
        <button class="row" id="oddsl"><span class="lead">${ic('egg', 20)}</span><span class="grow title">Egg odds</span>${ic('next', 20)}</button>
        <button class="row" id="privacy"><span class="lead">${ic('shield', 20)}</span><span class="grow title">Privacy</span>${ic('next', 20)}</button>
      </div>
      <button class="btn btn-ghost btn-block mt16" id="del" style="color:var(--danger-ink)">${ic('trash', 18)}Delete my ${local ? 'game data' : 'account and data'}</button>
      <p class="caption center mt8">SKIPPIES ${G.VERSION} \u00b7 made for MamaShop\u2019s BYO campaign</p>`);
    sh.querySelector('#rename').onclick = () => { close(); SK.pickName(false); };
    sh.querySelector('#copyfc').onclick = () => SK.copy(s.friendCode);
    sh.querySelector('#rsave').onclick = async () => {
      const r = await SK.call('POST', '/api/reminders', { byo: sh.querySelector('#rbyo').value, recycleDow: +sh.querySelector('#rdow').value, recycleTime: sh.querySelector('#rtime').value });
      SK.toast(r.status === 200 ? 'Reminder times saved' : 'Enter valid times.', r.status === 200 ? 'check' : 'alert');
    };
    const tog = sh.querySelector('#pushtog');
    if (tog) {
      pushState().then(on => { tog.checked = on; });
      tog.onclick = async () => { if (tog.checked) { const ok = await enablePush(); tog.checked = ok; } else await disablePush(); };
    }
    sh.querySelector('#ics1').onclick = () => SK.download('skippies-byo-reminder.ics', G.icsDaily(SK.st.reminders.byo, 'Skippies: pack your reusable', SK.now()), 'text/calendar');
    sh.querySelector('#ics2').onclick = () => SK.download('skippies-recycling-reminder.ics', G.icsWeekly(SK.st.reminders.recycleDow, SK.st.reminders.recycleTime, 'Skippies: recycling day', SK.now()), 'text/calendar');
    sh.querySelector('#hows').onclick = () => { close(); SK.howScans(); };
    sh.querySelector('#oddsl').onclick = () => { close(); SK.oddsSheet(); };
    sh.querySelector('#privacy').onclick = () => { close(); SK.sheet('Privacy', local ? '<div class="stack"><p>Offline mode: everything is stored only on this device. Nothing is sent to a server.</p><p>The street map is off in offline mode. If you turn it on (Map, Nearby), map images load from OneMap (Singapore Land Authority), which sees which area you look at. Your location itself stays on this phone.</p><p>Deleting your game data removes it from this device.</p></div>'
      : `<div class="stack"><p><b>What we store:</b> your player name (one you typed, checked by a word filter, or a random one we made), your game progress, photo fingerprints (16-character codes, not photos), and your rough area only if you set one.</p>
        <p><b>What we never collect:</b> your real name, email, phone number, exact location or photos. There is no chat.</p>
        <p><b>The map</b> uses your location only on this phone. It is never sent to the Skippies server. Map images come from OneMap (Singapore Land Authority), which, like any online map, sees which area of the map you load. You can turn the street map off in Map, Nearby.</p>
        <p><b>Push reminders</b> are optional and you can turn them off any time.</p><p><b>Delete</b> removes your player, sign-in, photo fingerprints and battles from the server.</p></div>`); };
    sh.querySelector('#del').onclick = async () => {
      const n = Object.keys(s.dex).length;
      if (!(await SK.confirm('Delete everything?', `Your ${n} Skippie${n === 1 ? '' : 's'}, progress and rankings will be gone for good. This can\u2019t be undone.`, 'Delete', true))) return;
      const r = await SK.call('DELETE', '/api/me');
      if (r.status !== 200 && SK.mode !== 'local') return SK.toast(SK.errMsg(r), 'alert');
      SK.wipe(); SK.boot(); SK.toast('Deleted', 'check');
    };
  };

  // ---------- start ----------
  if ('serviceWorker' in nav && (root.location.protocol === 'https:' || root.location.hostname === 'localhost')) {
    root.addEventListener('load', () => nav.serviceWorker.register('sw.js').catch(() => { }));
  }
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible' && SK.st && !SK.inBattle() && !doc.querySelector('.sheet') && doc.getElementById('main')) SK.call('GET', '/api/state').then(r => { if (r.status === 200 && doc.getElementById('main') && !doc.querySelector('.sheet')) SK.render(); }); });
  if (root.addEventListener) { root.addEventListener('online', () => { if (SK.netDown && SK.st) SK.call('GET', '/api/state').then(() => { if (doc.getElementById('main')) SK.render(); }); }); }
  SK.boot();
})(typeof window !== 'undefined' ? window : globalThis);
