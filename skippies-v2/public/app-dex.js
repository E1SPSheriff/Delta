/* SKIPPIES: Dex (filters, sort, rarity tiles), creature detail (merge, evolve, train, buddy, team), team editor, published odds. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document;
  const { C, TYPES, SP, SPECIES, RARITY, UTIL, TYPE_MOVE } = G;
  const esc = SK.esc, ic = SK.ic;
  let filt = 'all', sort = 'rarity';
  const ready = (s, id) => { const c = G.mergeCost(s, id); return c != null && s.dex[id].copies >= c; };

  function tile(s, sp) {
    const d = s.dex[sp.id];
    if (!d) return `<button class="tile locked" data-lock="${sp.id}" aria-label="Not found yet, ${RARITY[sp.rarity].name}">${ic('lock', 16, { cls: 'lk' })}${Art.skippy(sp, { size: 72, locked: true })}<span class="tn">???</span><span class="tm">${RARITY[sp.rarity].name}</span></button>`;
    return `<button class="tile r-${sp.rarity}" data-sk="${sp.id}" aria-label="${esc(SK.nm(sp.id))}, ${RARITY[sp.rarity].name} ${TYPES[sp.type].name} type, ${d.stars} stars, level ${d.level}${ready(s, sp.id) ? ', ready to merge' : ''}">
      ${ready(s, sp.id) ? `<span class="merge">${ic('merge', 12, { sw: 2.5 })}MERGE</span>` : ''}
      ${SK.art(sp.id, { size: 72 })}<span class="tn">${esc(SK.nm(sp.id))}</span>
      <span class="tm"><span class="dot t-${sp.type}" style="background:currentColor"></span>Lv ${d.level}</span>${SK.stars(d.stars, 10)}</button>`;
  }
  SK.views.dex = function () {
    const s = SK.st, owned = Object.keys(s.dex).length;
    let list = SPECIES.slice();
    if (filt === 'missing') list = list.filter(sp => !s.dex[sp.id]);
    else if (filt !== 'all') list = list.filter(sp => sp.type === filt);
    const rk = sp => RARITY[sp.rarity].rank;
    if (sort === 'rarity') list.sort((a, b) => (!!s.dex[b.id] - !!s.dex[a.id]) || rk(b) - rk(a) || a.stages[0].localeCompare(b.stages[0]));
    else if (sort === 'newest') list.sort((a, b) => ((s.dex[b.id] ? s.dex[b.id].first : -1) - (s.dex[a.id] ? s.dex[a.id].first : -1)) || rk(b) - rk(a));
    else list.sort((a, b) => ((s.dex[b.id] ? s.dex[b.id].stars * 100 + s.dex[b.id].level : -1) - (s.dex[a.id] ? s.dex[a.id].stars * 100 + s.dex[a.id].level : -1)));
    const slots = [0, 1, 2].map(i => { const id = s.team[i]; return id ? tile(s, SP[id]) : `<button class="slot" data-addteam>${ic('plus', 24)}<span class="caption">Add</span></button>`; }).join('');
    const FILTERS = [['all', 'All'], ['missing', 'Not found']].concat(Object.keys(TYPES).map(t => [t, TYPES[t].name]));
    return `<div class="page-title"><h1>Dex</h1><span class="caption tnum">${owned} of ${SPECIES.length} found</span></div>
      ${owned ? `<section class="section" style="margin-top:0"><div class="section-head"><span class="label">Battle team</span><button class="btn btn-ghost btn-sm" id="teamedit" style="min-height:32px;padding:0 4px">Edit team</button></div><div class="team3">${slots}</div></section>` : ''}
      <section class="section">
        <div class="chips" role="radiogroup" aria-label="Filter">${FILTERS.map(([k, l]) => `<button class="chip" role="radio" aria-checked="${filt === k}" data-f="${k}">${k !== 'all' && k !== 'missing' ? ic(Icon.TYPE[k], 16) : ''}${l}</button>`).join('')}</div>
        <div class="seg mt12" role="radiogroup" aria-label="Sort">${[['rarity', 'Rarity'], ['newest', 'Newest'], ['stars', 'Stars']].map(([k, l]) => `<button role="radio" aria-checked="${sort === k}" data-sort="${k}">${l}</button>`).join('')}</div>
        ${list.length ? `<div class="dexgrid mt16">${list.map(sp => tile(s, sp)).join('')}</div>` : `<div class="empty mt16"><h2>All found</h2><p class="muted">You\u2019ve found every Skippy in this filter.</p></div>`}
      </section>
      <section class="section"><div class="group">
        <button class="row" id="odds"><span class="lead">${ic('egg', 20)}</span><span class="grow"><span class="title">Egg odds</span><br><span class="meta">Published chances and the rare guarantee</span></span>${ic('next', 20)}</button>
        <button class="row" id="howmerge"><span class="lead">${ic('merge', 20)}</span><span class="grow"><span class="title">Stars and evolution</span><br><span class="meta">How merging duplicates works</span></span>${ic('next', 20)}</button></div></section>`;
  };
  SK.binders.dex = function () {
    SK.$app.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => SK.creature(b.dataset.sk));
    SK.$app.querySelectorAll('[data-lock]').forEach(b => b.onclick = () => {
      const sp = SP[b.dataset.lock];
      SK.sheet('Not found yet', `<div class="hero-tile" style="height:160px">${Art.skippy(sp, { size: 120, locked: true })}</div>
        <div class="flex mt12">${SK.rarityTag(sp.rarity)}${SK.typeChip(sp.type)}</div>
        <p class="mt12">${sp.source === 'recipe' ? '<b>Habit recipe (never random):</b> ' + esc(sp.recipe) : 'Can hatch from any egg. ' + TYPES[sp.type].name + ' items make ' + TYPES[sp.type].name + ' Skippies more likely.'}</p>`);
    });
    SK.$app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filt = b.dataset.f; SK.render(); });
    SK.$app.querySelectorAll('[data-sort]').forEach(b => b.onclick = () => { sort = b.dataset.sort; SK.render(); });
    SK.$app.querySelectorAll('[data-addteam]').forEach(b => b.onclick = teamEdit);
    SK.on('teamedit', teamEdit);
    SK.on('odds', SK.oddsSheet);
    SK.on('howmerge', () => SK.sheet('Stars and evolution', `<div class="stack"><p>Hatching a Skippy you already have adds a copy. Merge copies to add stars:</p>
      <table class="tbl"><thead><tr><th>Upgrade</th><th class="n">Copies</th></tr></thead><tbody>${[1, 2, 3, 4].map(st => `<tr><td>${st} \u2192 ${st + 1} stars</td><td class="n">${G.STAR_COST[st]}</td></tr>`).join('')}<tr><td><b>Total for 5 stars</b></td><td class="n"><b>15</b> (16 Skippies)</td></tr></tbody></table>
      <p>Each star adds 8% to all stats. Three-stage Skippies evolve at 3 and 5 stars; two-stage Skippies evolve at 4 stars.</p></div>`));
  };

  SK.creature = function (id) {
    const s = SK.st, d = s.dex[id], sp = SP[id], st = G.statsOf(s, id), cost = G.mergeCost(s, id), nx = G.nextEvoStars(sp, d.stars);
    const bonus = Math.round(G.mileageBonus(s, sp.type) * 100), need = G.xpNeed(d.level), inTeam = s.team.includes(id), maxed = d.level >= C.MAX_LEVEL;
    const canMerge = cost != null && d.copies >= cost;
    const mergeWhy = cost == null ? 'Maximum stars reached' : canMerge ? '' : `${cost - d.copies} more cop${cost - d.copies === 1 ? 'y' : 'ies'} needed (have ${d.copies} of ${cost})`;
 const trainWhy = maxed ? 'Maximum level reached' : s.scrap < C.TRAIN_STEP ? `Need ${C.TRAIN_STEP - s.scrap} more scrap` : '';
 const train5Why = maxed ? 'Maximum level reached' : s.scrap < C.TRAIN_STEP * 5 ? `Need ${C.TRAIN_STEP * 5 - s.scrap} more scrap for 5 trains` : '';
    const { sh, close } = SK.sheet(SK.nm(id), `
      <div class="hero-tile r-${sp.rarity}">${SK.art(id, { size: 150, bob: !SK.reduced })}</div>
      <div class="flex wrap mt12">${SK.rarityTag(sp.rarity)}${SK.typeChip(sp.type)}${SK.stars(d.stars, 18)}</div>
      <p class="muted mt8">${esc(sp.blurb)}</p>
      <div class="flex between mt16"><span class="label">Level ${d.level}${maxed ? ' (max)' : ''}</span><span class="caption tnum">${maxed ? '' : d.xp + ' / ' + need + ' XP'}</span></div>
      <div class="mt8">${SK.bar(maxed ? 1 : d.xp, maxed ? 1 : need, '', 'Experience')}</div>
      <div class="stat-grid mt16">
        <div>${ic('heart', 16, { cls: 'muted' }).replace('class="ic', 'style="margin:0 auto" class="ic')}<b>${st.maxHp}</b><span class="caption">HP</span></div>
        <div>${ic('power', 16).replace('class="ic', 'style="margin:0 auto" class="ic')}<b>${st.atk}</b><span class="caption">ATK</span></div>
        <div>${ic('shield', 16).replace('class="ic', 'style="margin:0 auto" class="ic')}<b>${st.def}</b><span class="caption">DEF</span></div>
        <div>${ic('speed', 16).replace('class="ic', 'style="margin:0 auto" class="ic')}<b>${st.spd}</b><span class="caption">SPD</span></div></div>
      <div class="group mt16">
        <div class="row"><span class="lead">${ic(Icon.TYPE[sp.type], 20)}</span><span class="grow"><span class="title">${esc(TYPE_MOVE[sp.type])}</span><br><span class="meta">${TYPES[sp.type].name} attack</span></span></div>
        <div class="row"><span class="lead">${ic('sparkle', 20)}</span><span class="grow"><span class="title">${esc(UTIL[sp.util].name)}</span><br><span class="meta">${esc(UTIL[sp.util].desc)} \u00b7 twice per battle</span></span></div>
        <div class="row"><span class="lead">${ic('leaf', 20)}</span><span class="grow"><span class="title">Habit mileage +${bonus}%</span><br><span class="meta">${sp.type === 'spark' ? 'Grows with all your actions' : 'Grows with your ' + TYPES[sp.type].name + ' actions'}</span></span></div>
      </div>
      ${nx ? `<p class="caption mt12">Evolves at ${nx} stars into ${esc(sp.stages[G.evoStage(sp, nx)])}.</p>` : ''}`,
      { actions: `<button class="btn btn-primary btn-block" id="merge" ${canMerge ? '' : 'disabled aria-disabled="true" title="' + esc(mergeWhy) + '"'}>${ic('merge', 20)}${cost == null ? 'Max stars' : 'Merge ' + cost + ' cop' + (cost === 1 ? 'y' : 'ies') + ' \u2192 ' + (d.stars + 1) + ' stars'}</button>${mergeWhy ? `<span class="why">${esc(mergeWhy)}</span>` : ''}
        <div class="flex mt12"><button class="btn btn-secondary grow" id="train" ${maxed || s.scrap < C.TRAIN_STEP ? 'disabled aria-disabled="true" title="' + esc(trainWhy) + '"' : ''}>${ic('scrap', 18)}Train \u00b7 ${C.TRAIN_STEP}</button><button class="btn btn-secondary grow" id="train5" ${train5Why ? 'disabled aria-disabled="true" title="' + esc(train5Why) + '"' : ''}>Train \u00d75 \u00b7 ${C.TRAIN_STEP * 5}</button></div>${train5Why ? `<span class="why">${esc(train5Why)}</span>` : ''}
        <div class="flex mt8"><button class="btn btn-ghost grow" id="buddy" ${s.buddy === id ? 'disabled' : ''}>${s.buddy === id ? 'Your buddy' : 'Make buddy'}</button><button class="btn btn-ghost grow" id="team">${inTeam ? 'Remove from team' : 'Add to team'}</button></div>` });
    const after = (r, msg) => { if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert'); close(); SK.render(); if (msg) SK.toast(msg, 'check'); };
    sh.querySelector('#merge').onclick = async () => {
      const r = await SK.call('POST', '/api/merge', { id }); if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert');
      close(); const res = r.body.result; SK.vibrate([20, 40, 40]);
      if (res.evolved) return SK.playEvolution(id, res.evolved, () => SK.render());
      SK.render(); SK.toast(SK.nm(id) + ' is now ' + res.stars + ' stars', 'star');
    };
    const tr = async n => { const r = await SK.call('POST', '/api/train', { id, scrap: C.TRAIN_STEP * n }); if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert'); close(); SK.render(); SK.creature(id); SK.toast(r.body.result.levelUps.length ? SK.nm(id) + ' reached level ' + SK.st.dex[id].level : '+' + C.TRAIN_STEP * n * C.SCRAP_XP + ' XP', 'check'); };
    sh.querySelector('#train').onclick = () => tr(1);
    sh.querySelector('#train5').onclick = () => tr(5);
    sh.querySelector('#buddy').onclick = async () => after(await SK.call('POST', '/api/buddy', { id }), SK.nm(id) + ' is your buddy');
    sh.querySelector('#team').onclick = async () => {
      let ids = s.team.slice();
      if (inTeam) { if (ids.length <= 1) return SK.toast('Your team needs at least one Skippy.', 'alert'); ids = ids.filter(x => x !== id); }
      else { if (ids.length >= C.TEAM_MAX) return SK.toast('Team is full. Remove one first.', 'alert'); ids.push(id); }
      after(await SK.call('POST', '/api/team', { ids }), 'Team updated');
    };
  };
  function teamEdit() {
    const s = SK.st, ids = Object.keys(s.dex).sort((a, b) => G.power(s, b) - G.power(s, a));
    if (!ids.length) return SK.toast('Hatch your first Skippy first.', 'alert');
    let pick = s.team.slice();
    const { sh, close } = SK.sheet('Battle team', `<p class="muted">Choose up to 3. In the Arena each type beats the next: Drink, Water, Food, Carry, Cutlery, Recycle, then back to Drink.</p>
      <div class="group mt16">${ids.map(id => `<button class="row" role="checkbox" aria-checked="${pick.includes(id)}" data-t="${id}"><span class="lead" style="background:none">${SK.art(id, { size: 40 })}</span><span class="grow"><span class="title">${esc(SK.nm(id))}</span><br><span class="meta tnum">Lv ${s.dex[id].level} \u00b7 ${s.dex[id].stars} stars \u00b7 power ${G.power(s, id)}</span></span><span class="trail" data-ck>${ic('check', 22)}</span></button>`).join('')}</div>`,
      { actions: `<button class="btn btn-primary btn-block" id="tsave">Save team</button>` });
    const paint = () => sh.querySelectorAll('[data-t]').forEach(b => { const on = pick.includes(b.dataset.t); b.setAttribute('aria-checked', on); b.classList.toggle('me', on); const c = b.querySelector('[data-ck]'); if (c) c.style.visibility = on ? 'visible' : 'hidden'; });
    paint();
    sh.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
      const id = b.dataset.t;
      if (pick.includes(id)) pick = pick.filter(x => x !== id); else { if (pick.length >= C.TEAM_MAX) return SK.toast('Max 3. Untick one first.', 'alert'); pick.push(id); }
      paint();
    });
    sh.querySelector('#tsave').onclick = async () => { if (!pick.length) return SK.toast('Pick at least one.', 'alert'); const r = await SK.call('POST', '/api/team', { ids: pick }); if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert'); close(); SK.render(); SK.toast('Team saved', 'check'); };
  }
  SK.teamEdit = teamEdit;
  SK.oddsSheet = async function () {
    const r = await SK.call('GET', '/api/odds'); const o = r.body;
    if (r.status !== 200) return SK.toast('Couldn\u2019t load the odds.', 'alert');
    SK.sheet('Egg odds', `<table class="tbl"><thead><tr><th>Rarity</th><th class="n">Base</th><th class="n">With guarantee</th></tr></thead><tbody>
      ${o.rarity.map(x => `<tr><td>${SK.rarityTag(x.key)}<div class="caption mt4">${x.species.map(esc).join(', ')}</div></td><td class="n">${x.odds}%</td><td class="n">${x.effective}%</td></tr>`).join('')}</tbody></table>
      <div class="stack mt16"><p><b>Guarantee:</b> if ${o.pity - 1} eggs in a row are Common or Uncommon, the next egg is Rare or better. \u201cWith guarantee\u201d is your real long-run chance per egg.</p>
      <p><b>Type match:</b> 70% of the time you get a Skippy that matches the item\u2019s type, if that rarity has one.</p>
      <p><b>Habit recipes</b> are never random: Bubbles (rinse), Weekend Wanderer (weekend action), Kaki Twins (with a friend), Mama Bao (family).</p>
      <p class="caption">${esc(o.note)} The MamaShop reward is based only on your BYO days, never on luck.</p></div>`);
  };
})(typeof window !== 'undefined' ? window : globalThis);
