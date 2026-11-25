/* SKIPPIES: Battles. Campaign vs Litterbugs + Arena vs other players' saved teams (nearby first, or by friend code).
   The server issues a seeded ticket; the client plays with the same engine + seed and sends its moves; the server replays them to verify. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document;
  const { C, TYPES, SP, LITTER, AREAS, UTIL, TYPE_MOVE, RARITY } = G;
  const esc = SK.esc, ic = SK.ic;
  let sub = 'campaign', opps = null, B = null, view = null, busy = false;
  SK.battleSub = s => { sub = s; if (s === 'arena') opps = null; SK.render(); };

  SK.views.battle = function () {
    const s = SK.st;
    const seg = `<div class="seg" role="radiogroup" aria-label="Battle mode"><button role="radio" data-sub="campaign" aria-checked="${sub === 'campaign'}">${ic('map', 18)}Campaign</button><button role="radio" data-sub="arena" aria-checked="${sub === 'arena'}">${ic('users', 18)}Arena</button></div>`;
    const head = `<div class="page-title"><h1>Battle</h1><span class="caption tnum">${s.energy} of ${C.ENERGY_MAX} energy</span></div>`;
    if (!s.team.length) return head + `<div class="empty full"><div class="art">${Art.egg(96)}</div><h2>No team yet</h2><p class="muted mt8">Hatch your first Skippy with a real BYO, then come back to battle.</p><button class="btn btn-primary btn-block mt24" id="tohome">Go to Home</button></div>`;
    if (sub === 'arena') return head + seg + arenaView();
    return head + seg + `<p class="caption mt12">Each battle uses 1 energy (your first is free). New areas unlock with real BYO days.</p>
      <div class="path mt16">${AREAS.map((a, i) => {
        const lock = G.lockReason(s, i), pr = s.areas[i].progress, done = pr >= 4, cur = !lock && !done;
        return `<button class="card area-card ${lock ? 'locked' : done ? 'done flat' : 'current'}" data-area="${i}" aria-label="${esc(a.name)}${lock ? ', locked' : done ? ', cleared' : ', stage ' + (pr + 1) + ' of 4'}">
          <span class="num">${lock ? ic('lock', 22) : done ? ic('check', 24, { sw: 3 }) : i + 1}</span>
          <span class="grow"><span class="title" style="font-weight:700">${esc(a.name)}</span><br><span class="meta" style="color:var(--text-3);font-size:13px;line-height:18px">${esc(lock || (done ? 'Cleared. Replay for XP.' : a.blurb))}</span>
            ${lock ? '' : `<span class="goal mt8" aria-hidden="true">${[0, 1, 2, 3].map(k => `<i class="${k < pr ? 'on' : ''}"></i>`).join('')}</span>`}</span>
          ${lock ? '' : ic('next', 20)}</button>`;
      }).join('')}</div>`;
  };
  function arenaView() {
    const s = SK.st, a = s.arena;
    const list = opps === null ? `<div class="stack-8 mt12"><div class="skel" style="height:88px"></div><div class="skel" style="height:88px"></div></div>`
      : !opps.length ? `<div class="empty"><h2>No players yet</h2><p class="muted">Try again later, or challenge a friend with their code.</p></div>`
      : `<div class="group">${opps.map((o, i) => `<div class="row" style="align-items:flex-start;flex-wrap:wrap">
          <span class="grow"><span class="title">${esc(o.name.replace(' (practice bot)', ''))}</span><br>
            <span class="flex wrap mt4">${o.bot ? '<span class="badge soft">Practice bot</span>' : `<span class="caption tnum">${ic('trophy', 14).replace('class="ic', 'style="display:inline;vertical-align:-2px" class="ic')} ${SK.fmt(o.rating)}</span>`}${o.near ? `<span class="badge" style="background:var(--brand-tint);color:var(--brand-strong)">Near you</span>` : ''}<span class="caption tnum">Power ${SK.fmt(o.power)}</span></span>
            <span class="flex mt8" style="gap:4px">${o.team.map(t => `<span class="thumb r-${t.rarity}" style="width:44px;height:44px;border-width:1.5px" title="${esc(t.name)} Lv ${t.level}">${Art.skippy(SP[t.id], { size: 36, stage: t.stage })}</span>`).join('')}</span></span>
          <button class="btn btn-primary btn-sm" data-opp="${i}" ${s.energy < 1 ? 'disabled aria-disabled="true" title="Need at least 1 energy"' : ''} style="align-self:center">${ic('energy', 16)}Battle</button></div>`).join('')}</div>`;
    return `<section class="section" style="margin-top:16px"><div class="card flat" style="cursor:default"><span class="lead" style="width:48px;height:48px;border-radius:12px;background:var(--accent-tint);display:grid;place-items:center;color:var(--accent-ink)">${ic('trophy', 24)}</span>
        <span class="grow"><span class="label">Your rating</span><br><span class="display tnum" style="font-size:28px;line-height:32px">${SK.fmt(a.rating)}</span></span><span class="caption tnum" style="text-align:right">${a.wins} won<br>${a.losses} lost</span></div>
        <p class="caption mt8">You battle a saved copy of the other player\u2019s team, so they don\u2019t need to be online. No chat and no exact locations.</p></section>
      ${s.mode === 'local' ? `<div class="banner warn mt16">${ic('offline', 20)}<span>Offline mode: practice bots only. Real players need the online version.</span></div>` : ''}
      <section class="section"><div class="section-head"><span class="label">Challenge a friend</span></div>
        <div class="group"><div class="row"><span class="grow"><span class="meta">Your code</span><br><span class="code" style="font-size:20px">${esc(s.friendCode)}</span></span><button class="btn btn-secondary btn-sm" id="copycode">${ic('copy', 16)}Copy</button></div>
        <div class="row"><label class="sr" for="fcode">Friend\u2019s code</label><input class="input code grow" id="fcode" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC123"><button class="btn btn-secondary" id="fgo">Find</button></div></div></section>
      <section class="section"><div class="section-head"><span class="label">${s.zone ? 'Players near you first' : 'Opponents'}</span><button class="icon-btn" id="refresh" aria-label="Refresh opponents">${ic('refresh', 20)}</button></div>
        ${s.zone ? '' : `<p class="caption" style="margin:-4px 0 12px">Set your area in Radar to see players near you first.</p>`}
        ${list}</section>`;
  }
  async function loadOpps() { const r = await SK.call('GET', '/api/arena/opponents'); opps = r.status === 200 ? r.body.list : []; if (SK.tab === 'battle' && sub === 'arena' && !B && doc.getElementById('main')) SK.render(); }
  SK.binders.battle = function () {
    SK.$app.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { if (sub === b.dataset.sub) return; SK.battleSub(b.dataset.sub); });
    SK.$app.querySelectorAll('[data-area]').forEach(b => b.onclick = () => { const i = +b.dataset.area, lock = G.lockReason(SK.st, i); if (lock) return SK.toast(lock, 'lock'); areaScreen(i); });
    SK.$app.querySelectorAll('[data-opp]').forEach(b => b.onclick = () => startArena(opps[+b.dataset.opp]));
    SK.on('tohome', () => { SK.tab = 'home'; SK.render(); });
    SK.on('refresh', () => { opps = null; SK.render(); });
    SK.on('copycode', () => SK.copy(SK.st.friendCode));
    SK.on('fgo', async () => {
      const code = (doc.getElementById('fcode').value || '').trim().toUpperCase();
      const r = await SK.call('GET', '/api/arena/code/' + encodeURIComponent(code));
      if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert');
      opps = [r.body.opponent].concat((opps || []).filter(o => o.id !== r.body.opponent.id)); SK.render(); SK.toast('Found ' + r.body.opponent.name, 'check');
    });
    if (sub === 'arena' && opps === null && SK.st.team.length) loadOpps();
  };

  function areaScreen(i) {
    const s = SK.st, a = AREAS[i], pr = s.areas[i].progress, list = G.fightList(i);
    SK.clearTimers(); SK.dark(false); root.scrollTo && root.scrollTo(0, 0);
    const free = !s.tutorialDone && i === 0;
    SK.$app.innerHTML = `<div class="flow light-flow" style="padding-bottom:calc(var(--sab) + 24px)"><div class="flow-top"><button class="icon-btn" id="back" aria-label="Back to areas">${ic('back', 24)}</button><h2>${esc(a.name)}</h2></div>
      <p class="muted">${esc(a.blurb)}</p>
      <div class="stack mt16">${list.map((f, k) => {
        const state = k < pr ? 'done' : k > pr ? 'locked' : 'now';
        return `<div class="card ${state === 'now' ? 'current' : 'flat'} ${state === 'locked' ? 'locked' : ''}" style="flex-direction:column;align-items:stretch;cursor:default">
          <div class="flex between"><span class="label">${k === 3 ? 'Boss' : 'Stage ' + (k + 1)}</span>${state === 'done' ? `<span class="badge" style="background:var(--ok-bg);color:var(--ok-ink)">Cleared</span>` : ''}</div>
          <div class="flex wrap" style="gap:12px">${f.map(([id, lv]) => `<span class="flex" style="gap:6px">${Art.litter(LITTER[id], { size: 52 })}<span><b style="font-size:15px">${esc(LITTER[id].name)}</b><br><span class="caption tnum">Lv ${lv} \u00b7 ${TYPES[LITTER[id].type].name}</span></span></span>`).join('')}</div>
          <button class="btn ${state === 'now' ? 'btn-primary' : 'btn-secondary'} btn-block" data-f="${k}" ${state === 'locked' ? 'disabled aria-disabled="true" title="Clear the previous stage first"' : ''}>${state === 'locked' ? 'Clear the previous stage first' : state === 'done' ? 'Replay for XP \u00b7 1 energy' : (free && k === 0 ? 'Fight \u00b7 free' : 'Fight \u00b7 1 energy')}</button></div>`;
      }).join('')}</div>
      <div class="banner info mt16">${ic('info', 20)}<span>Skippies deal <b>2\u00d7 damage</b> to Litterbugs of the <b>same type</b>. Spark and Recycle Skippies deal 1.25\u00d7 to everything.</span></div></div>`;
    SK.on('back', () => SK.render());
    SK.$app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => startCampaign(i, +b.dataset.f));
  }
  async function startCampaign(ai, fi) {
    const r = await SK.call('POST', '/api/campaign/start', { area: ai, fight: fi });
    if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert');
    begin('campaign', r.body);
  }
  async function startArena(o) {
    if (!o) return;
    const r = await SK.call('POST', '/api/arena/start', { oppId: o.id });
    if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert');
    begin('arena', r.body);
  }
  let wildSpawn = null;
  SK.startWild = async function (spawn) {
    const r = await SK.call('POST', '/api/wild/start', { litter: spawn.litter });
    if (r.status !== 200) { SK.toast(SK.errMsg(r), 'alert'); return r; }
    wildSpawn = spawn; begin('wild', r.body); return r;
  };
  function snapshot(b) { return { a: b.allies.map(x => ({ hp: x.hp })), e: b.enemies.map(x => ({ hp: x.hp, type: x.curType || x.type })), ai: b.a, ei: b.e, log: '', fx: null }; }
  function begin(kind, body) {
    const bt = G.clone(body.battle);
    B = { kind, ticket: body.ticket, bt, rng: G.mulberry32(bt.seed), actions: [] };
    view = snapshot(bt); busy = false;
    view.log = kind === 'arena' ? `${bt.oppName.replace(' (practice bot)', '')}\u2019s team wants to battle.` : kind === 'wild' ? `A wild ${bt.enemies[0].name} appeared.` : bt.boss ? `${bt.enemies[0].name} blocks the way.` : `${bt.enemies.map(e => e.name).join(' and ')} appeared.`;
    renderBattle(); SK.announce(view.log);
  }
  SK.inBattle = () => !!B;
  function effText(e) { return e >= 2 ? '2\u00d7 super effective' : e >= 1.5 ? '1.5\u00d7 strong' : e > 1 ? '1.25\u00d7' : e < 1 ? 'Weak here' : 'Normal'; }
  function hpBar(v, max, label) { const p = v / max; return SK.bar(v, max, 'hp ' + (p < 0.2 ? 'low' : p < 0.5 ? 'mid' : ''), label); }
  function renderBattle() {
    SK.dark(true);
    const b = B.bt, pvp = b.mode === 'pvp', A = b.allies[view.ai], E = b.enemies[view.ei], aHp = view.a[view.ai].hp, eHp = view.e[view.ei].hp, eType = view.e[view.ei].type;
    const typeEff = G.eff(A.type, eType, pvp ? 'pvp' : 'pve');
    const fx = view.fx || {}, fxc = side => fx.target === side ? (fx.kind === 'faint' ? 'fx-faint' : fx.kind === 'heal' ? 'fx-heal' : 'fx-hit') : '';
    const coach = b.tutorial ? `<div class="coach">${ic('info', 20)}<span>${A.type === eType ? `${esc(A.name)} is the same type as ${esc(E.name)}. Use <b>${esc(TYPE_MOVE[A.type])}</b> for 2\u00d7 damage.` : 'Same-type attacks deal 2\u00d7 to Litterbugs. For now, just attack.'}</span></div>` : '';
    const eArt = E.litter ? Art.litter(LITTER[E.id], { size: 140, type: eType }) : Art.skippy(SP[E.id], { size: 140, stage: E.stage, mood: 'ok' });
    const sw = b.allies.some((x, k) => k !== view.ai && view.a[k].hp > 0);
    SK.$app.innerHTML = `<div class="battle dark">
      <div class="bt-top"><span class="label tnum">${pvp ? 'Arena' : b.wild ? 'Wild Litterbug' : (b.boss ? 'Boss' : 'Stage ' + (b.fi + 1)) + ' \u00b7 ' + esc(AREAS[b.ai].name)} \u00b7 Turn ${b.turn + 1}</span><button class="icon-btn" id="run" ${busy ? 'disabled' : ''} aria-label="Walk away">${ic('flag', 22)}</button></div>
      <div class="field-b">
        <div class="combatant foe ${fxc('enemy')}"><div class="hpcard"><div class="flex between"><span class="nm">${esc(E.name.replace(' (practice bot)', ''))}</span><span class="hpn">Lv ${E.level}</span></div>
          <div class="flex between">${SK.typeChip(eType)}<span class="hpn">${eHp} / ${E.maxHp}</span></div>${hpBar(eHp, E.maxHp, E.name + ' HP')}
          <div class="foes" aria-label="${b.enemies.filter((x, k) => view.e[k].hp > 0).length} of ${b.enemies.length} left">${b.enemies.map((x, k) => `<i class="${view.e[k].hp <= 0 ? 'off' : ''}"></i>`).join('')}</div></div>
          <div class="sprite">${eArt}</div></div>
        <div class="combatant me ${fxc('ally')}"><div class="hpcard"><div class="flex between"><span class="nm">${esc(A.name)}</span><span class="hpn">Lv ${A.level}</span></div>
          <div class="flex between">${SK.typeChip(A.type)}<span class="hpn">${aHp} / ${A.maxHp}</span></div>${hpBar(aHp, A.maxHp, A.name + ' HP')}
          <div class="hpn">${A.cheer ? 'Attack up \u00d7' + A.cheer + ' ' : ''}${A.guard ? 'Guarding' : ''}</div></div>
          <div class="sprite">${Art.skippy(SP[A.id], { size: 150, stage: A.stage })}</div></div>
      </div>
      <div class="blog" id="log" aria-live="polite">${esc(view.log)}</div>${coach}
      <div class="actions-panel">
        <div class="moves">
          <button class="move t-${A.type}" data-mv="type" ${busy ? 'disabled' : ''}><b>${esc(TYPE_MOVE[A.type])}</b><span>${effText(typeEff)}</span></button>
          <button class="move" data-mv="bump" ${busy ? 'disabled' : ''}><b>Bump</b><span>Normal damage</span></button>
          <button class="move" data-mv="util" ${busy || A.utilLeft <= 0 ? 'disabled' : ''}><b>${esc(UTIL[A.util].name)}</b><span>${esc(UTIL[A.util].desc)} \u00b7 ${A.utilLeft} left</span></button>
          <button class="move" data-mv="switch" ${busy || !sw ? 'disabled' : ''}><b>Switch</b><span>${sw ? 'Uses your turn' : 'No one else can fight'}</span></button>
        </div>
        ${pvp ? `<p class="caption mt12">Drink beats Water beats Food beats Carry beats Cutlery beats Recycle beats Drink (1.5\u00d7). Spark is neutral.</p>` : ''}
      </div></div>`;
    SK.$app.querySelectorAll('[data-mv]').forEach(btn => btn.onclick = () => { const mv = btn.dataset.mv; if (mv === 'switch') return switchSheet(); doAct({ kind: 'move', move: mv }); });
    SK.on('run', async () => { if (await SK.confirm('Walk away?', 'This counts as a loss' + (pvp ? ' in the Arena' : '') + ', and the energy is used up.', 'Walk away', true)) doAct({ kind: 'run' }); });
  }
  function switchSheet() {
    const b = B.bt;
    const { sh, close } = SK.sheet('Switch Skippy', `<div class="group">${b.allies.map((x, k) => { const off = k === view.ai || view.a[k].hp <= 0; return `<button class="row" data-sw="${k}" ${off ? 'disabled aria-disabled="true"' : ''}><span class="lead" style="background:none">${Art.skippy(SP[x.id], { size: 40, stage: x.stage })}</span><span class="grow"><span class="title">${esc(x.name)}</span><br><span class="meta tnum">${TYPES[x.type].name} \u00b7 HP ${view.a[k].hp} / ${x.maxHp}${k === view.ai ? ' \u00b7 in battle' : view.a[k].hp <= 0 ? ' \u00b7 too tired' : ''}</span></span></button>`; }).join('')}</div>`);
    sh.querySelectorAll('[data-sw]').forEach(btn => btn.onclick = () => { close(); doAct({ kind: 'switch', to: +btn.dataset.sw }); });
  }
  function doAct(action) {
    if (busy || !B || B.bt.over) return;
    const ev = G.act(B.bt, action, B.rng);
    if (ev.length && ev[0].invalid) { SK.toast(ev[0].text, 'alert'); return; }
    B.actions.push(action);
    busy = true; const step = SK.reduced ? 300 : 700; let i = 0;
    const next = () => {
      if (!B) return;
      if (i >= ev.length) { view.fx = null; busy = false; if (B.bt.over) return SK.later(finish, 400); renderBattle(); return; }
      const e = ev[i++]; view.fx = null;
      if (e.t === 'hit') { (e.side === 'enemy' ? view.e : view.a)[e.idx].hp = e.hp; view.fx = { target: e.side, kind: 'hit' }; view.log = e.text + ' ' + (e.eff >= 1.5 ? 'Super effective. ' : e.eff < 1 ? 'Not very effective. ' : '') + (e.guarded ? 'Guarded. ' : '') + '\u2212' + e.dmg + ' HP'; if (e.side === 'ally') SK.vibrate(25); }
      else if (e.t === 'heal') { (e.side === 'enemy' ? view.e : view.a)[e.idx].hp = e.hp; view.fx = { target: e.side, kind: 'heal' }; view.log = e.text; }
      else if (e.t === 'faint') { view.fx = { target: e.side, kind: 'faint' }; view.log = e.text; }
      else if (e.t === 'send') { if (e.side === 'ally') view.ai = e.idx; else view.ei = e.idx; view.log = e.text; }
      else if (e.t === 'shift') { view.e[e.idx].type = e.type; view.log = e.text; }
      else if (e.t === 'end') view.log = e.result === 'win' ? 'You won.' : e.result === 'lose' ? 'Your team is too tired to go on.' : 'You walked away.';
      else view.log = e.text || view.log;
      renderBattle(); SK.announce(view.log); SK.later(next, step);
    };
    next();
  }
  SK.showBattleResult = function (kind, res, ai, done, spawn) {
    const win = res.result === 'win', spawnDone = spawn;
    SK.dark(true); SK.vibrate(win ? [30, 50, 80] : 40);
    if (SK.audio) SK.audio.play(win ? 'win' : 'lose');
    const lv = (res.levelUps || []);
    SK.$app.innerHTML = `<div class="flow dark"><div class="flow-body center">
      <p class="label">${kind === 'arena' ? 'Arena result' : kind === 'wild' ? 'Wild Litterbug' : esc(AREAS[ai].name)}</p>
      ${kind === 'arena' ? `<p class="muted">${res.ranked ? 'Ranked match' : 'Practice match: rating stays the same.'}</p>` : ''}
      <h1 class="display">${win ? (kind === 'arena' ? 'Victory' : 'Cleaned up') : res.result === 'lose' ? 'Not this time' : 'Walked away'}</h1>
      ${kind === 'wild' && win && spawnDone ? `<p class="muted">You cleaned up the ${esc(G.LITTER[spawnDone.litter].name)} near you. It\u2019s gone from your map.</p>` : ''}
      <div class="flex" style="justify-content:center;gap:4px">${SK.st.team.map(id => SK.art(id, { size: 84, mood: win ? 'happy' : 'ok' })).join('')}</div>
      <div class="group" style="text-align:left;background:var(--dark-2);box-shadow:none;color:var(--dark-text)">
        ${kind === 'arena' ? `<div class="row" style="color:inherit"><span class="grow">Rating</span><span class="trail tnum" style="color:inherit">${res.delta >= 0 ? '+' : ''}${res.delta} \u2192 ${SK.fmt(res.rating)}</span></div>` : ''}
        <div class="row" style="color:inherit"><span class="grow">XP for each team member</span><span class="trail tnum" style="color:inherit">+${res.xp || 0}</span></div>
        <div class="row" style="color:inherit"><span class="grow">Scrap</span><span class="trail tnum" style="color:inherit">+${res.scrap || 0}</span></div>
        ${lv.map(u => `<div class="row" style="color:inherit"><span class="grow">${esc(SK.nm(u.id))} levelled up</span><span class="trail tnum" style="color:var(--accent)">Lv ${u.from} \u2192 ${u.to}</span></div>`).join('')}
      </div>
      ${res.areaCleared ? `<div class="banner reward" style="text-align:left">${ic('trophy', 20)}<span><b>${esc(AREAS[ai].name)} cleared.</b>${AREAS[ai + 1] ? ' Next: ' + esc(AREAS[ai + 1].name) + ' (needs ' + AREAS[ai + 1].need + ' real BYO days).' : ''}</span></div>` : ''}
      ${res.gameCleared ? `<div class="banner reward" style="text-align:left">${ic('sparkle', 20)}<span><b>You beat the Landfill Lord.</b> Keep collecting stars and climb the Arena.</span></div>` : ''}
      ${!win ? '<p class="muted">Tips: merge duplicates for stars, train with scrap, use same-type attacks, and BYO more for habit mileage.</p>' : ''}
      </div><div class="flow-foot"><button class="btn btn-accent btn-block" id="cont">Continue</button></div></div>`;
    SK.announce(win ? 'Victory' : 'Battle over');
    SK.on('cont', done || function () { if (kind === 'campaign' && ai != null) areaScreen(ai); else if (kind === 'wild') { SK.tab = 'radar'; SK.render(); } else { opps = null; SK.render(); } });
  };
  async function finish() {
    const kind = B.kind, ai = B.bt.ai;
    const r = await SK.call('POST', '/api/' + kind + '/finish', { ticket: B.ticket, actions: B.actions });
    B = null;
    if (r.status !== 200) { SK.render(); SK.toast(SK.errMsg(r, 'That battle couldn\u2019t be verified.'), 'alert'); return; }
    if (kind === 'wild' && r.body.result.result === 'win' && wildSpawn && SK.markWildDone) SK.markWildDone(wildSpawn);
    const spawnDone = wildSpawn; wildSpawn = null;
    SK.showBattleResult(kind, r.body.result, ai, null, spawnDone);
  }
  SK.devStartArena = async function (ranked) {
    const r = await SK.call('GET', '/api/dev/opponent', { ranked: !!ranked });
    if (r.status !== 200) return SK.toast(SK.errMsg(r, 'Could not load demo opponent.'), 'alert');
    return startArena(r.body.opponent);
  };
  SK._battleTest = { startCampaign, startArena, doAct, get B() { return B; }, get busy() { return busy; } };
})(typeof window !== 'undefined' ? window : globalThis);
