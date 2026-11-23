/* SKIPPIES: Home (buddy, catch actions, season, today, habit mileage) + catch flow (item picker, camera scan, fingerprint, hatch reveal). */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document;
  const { C, TYPES, SP, ITEMS, BYO_ITEMS, RECYCLE_ITEMS, RARITY, AREAS } = G;
  const esc = SK.esc, ic = SK.ic;
  const LINES = ['Packed your reusable today?', 'Every BYO makes my type stronger.', 'Rinse me after use, okay?', 'The Hawker Centre needs cleaning up.', 'Recycling day means bonus scrap.'];
  const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  function catchState(s, t) {
    const today = G.actionsToday(s, t).filter(a => a.verified).length;
    if (G.seasonDay(s, t) > C.SEASON_DAYS) return { off: 'Season over' };
    if (today >= C.MAX_ACTIONS_PER_DAY) return { off: 'Back tomorrow', why: `You\u2019ve hatched ${C.MAX_ACTIONS_PER_DAY} today` };
    const wait = s.lastActionTs + C.ACTION_COOLDOWN_MS - t;
    if (wait > 0) return { off: 'Next scan in ' + mmss(wait), wait };
    return { today };
  }
  SK.views.home = function () {
    const s = SK.st, t = SK.now(), adn = G.adnOf(t), todayActs = G.actionsToday(s, t).filter(a => a.verified);
    const sd = G.seasonDay(s, t), over = sd > C.SEASON_DAYS, days = G.seasonActionDays(s), left = Math.max(0, C.SEASON_DAYS - sd + 1);
    const hasBuddy = s.buddy && s.dex[s.buddy];
    const rinsed = !!s.rinsed[adn], byoToday = todayActs.some(a => a.kind === 'byo');
    const remind = G.hhmm(s.reminders.byo), mins = Math.floor(((t + 8 * G.HOUR) % G.DAY) / 60000);
    const nudge = !todayActs.length && remind != null && mins >= remind && !over;
    const cs = catchState(s, t), toRare = C.PITY_RARE - s.pity;
    const goal = Array.from({ length: C.STAR_DAYS }, (_, i) => `<i class="${i < days ? 'on' : ''}"></i>`).join('');
    // next campaign step
    let nextArea = -1; for (let i = 0; i < AREAS.length; i++) if (G.areaUnlocked(s, i) && s.areas[i].progress < 4) { nextArea = i; break; }
    const mil = ['drink', 'water', 'food', 'carry', 'cutlery', 'recycle', 'spark'].map(ty => { const v = Math.round(G.mileageBonus(s, ty) * 100); return `<span class="tl">${ic(Icon.TYPE[ty], 16)}${TYPES[ty].name}</span>${SK.bar(v, C.MILEAGE_CAP, '', TYPES[ty].name + ' bonus ' + v + ' percent')}<span class="v">+${v}%</span>`; }).join('');
    const heroCap = (k) => cs.off ? esc(cs.off) : (k === 'byo' ? 'Scan your cup, bottle, box or bag' : 'Cans, bottles, paper or e-waste');
    return `
      ${nudge ? `<div class="banner warn">${ic('bell', 20)}<span><b>No BYO yet today.</b> Grab your reusable on the way out. An egg is waiting.</span></div>` : ''}
      <section class="section center" aria-label="Your buddy" style="margin-top:${nudge ? 16 : 8}px">
        ${hasBuddy ? `<button class="icon-btn" id="pet" style="width:auto;height:auto;border-radius:24px;margin:0 auto" aria-label="Pet ${esc(SK.nm(s.buddy))}">${SK.art(s.buddy, { size: 156, bob: !SK.reduced })}</button>
          <h2 class="mt8">${esc(SK.nm(s.buddy))}</h2><div class="flex mt4" style="justify-content:center">${SK.rarityTag(SP[s.buddy].rarity)}${SK.stars(s.dex[s.buddy].stars)}</div>
          <p class="muted mt8" id="say">\u201c${esc(LINES[adn % LINES.length])}\u201d</p>`
        : `<div class="flex" style="justify-content:center">${Art.egg(110, { label: 'Your first egg' })}</div><h2 class="mt8">Your first egg is waiting</h2><p class="muted mt4">Scan a real BYO or something you\u2019re recycling to hatch it.</p>`}
      </section>
      ${over ? `<section class="section"><div class="banner reward">${ic('trophy', 20)}<span><b>Season ${s.season} is over.</b> You did ${days} BYO day${days === 1 ? '' : 's'}. Your Skippies, stars and levels carry over.</span></div><button class="btn btn-primary btn-block mt12" id="newseason">Start season ${s.season + 1}</button></section>` : `
      <section class="section" aria-label="Log an action" style="margin-top:24px">
        <div class="heroes">
          <button class="hero byo" id="catch-byo" ${cs.off ? 'disabled' : ''}><span class="icons">${ic('cup', 28)}${ic('bag', 28)}</span><span><span class="hl">I BYO\u2019d</span><br><span class="cap tnum" data-cd>${heroCap('byo')}</span></span></button>
          <button class="hero rec" id="catch-rec" ${cs.off ? 'disabled' : ''}><span class="icons">${ic('recycle', 28)}</span><span><span class="hl">I recycled</span><br><span class="cap tnum" data-cd>${heroCap('rec')}</span></span></button>
        </div>
        <div class="flex between mt12 caption tnum"><span>Today: ${todayActs.length}/${C.MAX_ACTIONS_PER_DAY} eggs</span><span>Rare or better within ${toRare} egg${toRare === 1 ? '' : 's'}</span></div>
      </section>`}
      <section class="section" aria-label="Season">
        <div class="section-head"><span class="label tnum">Season ${s.season} \u00b7 ${over ? 'ended' : left + (left === 1 ? ' day' : ' days') + ' left'}</span><button class="btn btn-ghost btn-sm" id="seasoninfo" style="min-height:32px;padding:0 4px">Details</button></div>
        <div class="goal" role="img" aria-label="${days} of ${C.STAR_DAYS} BYO days">${goal}</div>
        ${s.rewardCode ? `<div class="banner reward mt12">${ic('trophy', 20)}<span><b>MamaShop reward unlocked.</b> Show this code and your reusable at MamaShop:<br><span class="code" style="font-size:20px">${esc(s.rewardCode)}</span><br><a class="body2" href="${esc(root.MAMASHOP_REWARDS_URL || './rewards/')}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px">Open Mamashop Rewards</a></span></div>`
        : `<p class="body2 mt8"><b class="tnum">${days} of ${C.STAR_DAYS}</b> BYO days. ${Math.max(0, C.STAR_DAYS - days)} more for a MamaShop reward.</p>`}
      </section>
      <section class="section" aria-label="Today">
        <div class="section-head"><span class="label">Today</span></div>
        <div class="group">
          ${byoToday ? `<button class="row" id="rinse" ${rinsed ? 'aria-disabled="true" disabled' : ''}><span class="lead">${ic(rinsed ? 'check' : 'drop', 20)}</span><span class="grow"><span class="title">${rinsed ? 'Rinsed today' : 'I rinsed my reusable'}</span><br><span class="meta">${rinsed ? 'Ready for tomorrow' : '+1 energy and a Bubbles copy'}</span></span>${rinsed ? '' : ic('next', 20)}</button>` : ''}
          ${s.lastCatch && s.dex[s.lastCatch.id] ? `<button class="row" id="lastcatch"><span class="lead" style="background:none">${SK.art(s.lastCatch.id, { size: 40 })}</span><span class="grow"><span class="title">${esc(SK.nm(s.lastCatch.id))}</span><br><span class="meta">Latest catch \u00b7 ${SK.ago(s.lastCatch.ts)}</span></span>${SK.rarityTag(SP[s.lastCatch.id].rarity)}</button>` : ''}
          ${nextArea >= 0 && s.team.length ? `<button class="row" id="gocampaign"><span class="lead">${ic('battle', 20)}</span><span class="grow"><span class="title">${esc(AREAS[nextArea].name)}</span><br><span class="meta tnum">Stage ${s.areas[nextArea].progress + 1} of 4 \u00b7 1 energy</span></span>${ic('next', 20)}</button>` : ''}
          ${s.team.length ? `<button class="row" id="goarena"><span class="lead">${ic('users', 20)}</span><span class="grow"><span class="title">Arena</span><br><span class="meta tnum">Rating ${SK.fmt(s.arena.rating)} \u00b7 battle players near you</span></span>${ic('next', 20)}</button>` : ''}
          <button class="row" id="goradar"><span class="lead">${ic('location', 20)}</span><span class="grow"><span class="title">Open the map</span><br><span class="meta">Recycling points and wild Litterbugs near you</span></span>${ic('next', 20)}</button>
        </div>
      </section>
      <section class="section" aria-label="Habit mileage">
        <div class="section-head"><span class="label">Habit mileage</span></div>
        <p class="body2 muted">Each real action gives Skippies of that type +1% to all stats (max +${C.MILEAGE_CAP}%). Spark grows from everything you do.</p>
        <div class="mil mt12">${mil}</div>
      </section>
      <div class="section center" style="margin-top:24px"><button class="btn btn-ghost" id="selfrep">No camera? Log it without a photo</button></div>`;
  };
  SK.binders.home = function () {
    SK.on('catch-byo', () => SK.catchFlow('byo'));
    SK.on('catch-rec', () => SK.catchFlow('recycle'));
    SK.on('pet', () => { const el = doc.getElementById('say'); if (el) el.textContent = '\u201c' + LINES[Math.floor(Math.random() * LINES.length)] + '\u201d'; SK.vibrate(15); SK.announce('Your buddy is happy'); });
    SK.on('rinse', async () => { const r = await SK.call('POST', '/api/rinse'); if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert'); SK.render(); SK.toast(r.body.result.isNew ? 'New Skippy: Bubbles. +1 energy' : '+1 energy and a Bubbles copy', 'check'); });
    SK.on('newseason', async () => { const r = await SK.call('POST', '/api/season/new'); if (r.status !== 200) return SK.toast(SK.errMsg(r), 'alert'); SK.render(); SK.toast('Season ' + SK.st.season + ' started', 'check'); });
    SK.on('selfrep', () => SK.selfReport());
    SK.on('lastcatch', () => SK.creature(SK.st.lastCatch.id));
    SK.on('gocampaign', () => { SK.tab = 'battle'; SK.battleSub('campaign'); });
    SK.on('goarena', () => { SK.tab = 'battle'; SK.battleSub('arena'); });
    SK.on('goradar', () => { SK.tab = 'radar'; SK.render(); });
    SK.on('seasoninfo', () => SK.sheet('Seasons', `<div class="stack"><p>Each season lasts ${C.SEASON_DAYS} days. BYO or recycle on <b>${C.STAR_DAYS} different days</b> to unlock a MamaShop reward code.</p>
      <p>The reward depends only on your days. It never depends on luck or rare Skippies.</p><p class="muted">Your Skippies, stars, levels and rating carry over to the next season.</p></div>`));
    // live cooldown countdown on the hero buttons
    const cs = catchState(SK.st, SK.now());
    if (cs.wait) SK.later(function tick() { if (SK.tab !== 'home' || !doc.getElementById('catch-byo')) return; const c = catchState(SK.st, SK.now()); if (!c.off) return SK.render(); doc.querySelectorAll('[data-cd]').forEach(x => x.textContent = c.off); SK.later(tick, 1000); }, 1000);
  };
  SK.selfReport = function () {
    const items = BYO_ITEMS.concat(RECYCLE_ITEMS);
    const { sh, close } = SK.sheet('Log without a photo', `<p class="muted">This counts in your personal history. Eggs and rankings need a photo so the game stays fair.</p>
      <div class="group mt16">${items.map(k => `<button class="row" data-it="${k}"><span class="lead">${ic(Icon.ITEM[k], 20)}</span><span class="grow title">${esc(ITEMS[k].label)}</span></button>`).join('')}</div>`);
    sh.querySelectorAll('[data-it]').forEach(b => b.onclick = async () => { const r = await SK.call('POST', '/api/selfreport', { item: b.dataset.it }); close(); SK.render(); SK.toast(r.status === 200 ? 'Logged. Nice one.' : SK.errMsg(r), r.status === 200 ? 'check' : 'alert'); });
  };

  // ---------- catch flow ----------
  let F = null;
  SK.catchFlow = function (kind) {
    SK.clearTimers(); SK.dark(false);
    F = { kind, item: null, together: false, family: false };
    const list = kind === 'byo' ? BYO_ITEMS : RECYCLE_ITEMS;
    const short = { cup: 'Cup', bottle: 'Bottle', box: 'Container', bag: 'Tote bag', kit: 'Cutlery or straw', bev: 'Can or bottle', paper: 'Paper', ewaste: 'E-waste' };
    SK.$app.innerHTML = `<div class="flow light-flow"><div class="flow-top"><button class="icon-btn" id="back" aria-label="Back">${ic('back', 24)}</button><h2>${kind === 'byo' ? 'Log a BYO' : 'Log recycling'}</h2></div>
      <div class="flow-body" style="justify-content:flex-start">
        <h1>${kind === 'byo' ? 'What did you bring?' : 'What are you recycling?'}</h1>
        <div class="choices" role="radiogroup" aria-label="Item">${list.map(k => `<button class="choice" role="radio" aria-checked="false" data-it="${k}"><span class="ck">${ic('check', 14, { sw: 3 })}</span>${ic(Icon.ITEM[k], 32)}<span>${short[k]}</span></button>`).join('')}</div>
        <p class="caption" id="itemhint">${kind === 'byo' ? 'Pick the reusable you\u2019re using right now.' : 'Drink cans and plastic bottles with the deposit mark get 10\u00a2 back at Return Right machines.'}</p>
        ${kind === 'byo' ? `<div class="group" style="padding:4px 16px">
          <label class="checkrow"><input type="checkbox" id="tog"><span><b>With a friend</b><br><span class="caption">Both reusables in the photo. Bonus: Kaki Twins</span></span></label>
          <label class="checkrow"><input type="checkbox" id="fam"><span><b>A family member BYO\u2019d too</b><br><span class="caption">Bonus: Mama Bao</span></span></label></div>` : ''}
      </div>
      <div class="flow-foot"><button class="btn btn-primary btn-block" id="next" disabled>${ic('camera', 20)}Open camera</button></div></div>`;
    SK.$app.querySelectorAll('[data-it]').forEach(b => b.onclick = () => {
      F.item = b.dataset.it; SK.$app.querySelectorAll('[data-it]').forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
      const it = ITEMS[F.item], h = doc.getElementById('itemhint');
      if (h) h.textContent = it.kind === 'byo' ? 'Skipping ' + it.skip + '. Hatches a ' + TYPES[it.type].name + '-leaning egg.' : 'Take it to ' + it.where + '.';
      doc.getElementById('next').disabled = false;
    });
    SK.on('back', () => SK.render());
    SK.on('next', () => { const t = doc.getElementById('tog'), f = doc.getElementById('fam'); F.together = !!(t && t.checked); F.family = !!(f && f.checked); cameraScreen(); });
  };
  const LOOK = { cup: 'cup', bottle: 'bottle', box: 'bowl or container', bag: 'bag or backpack', kit: 'fork, spoon or knife', bev: 'bottle or can', paper: 'book or magazine', ewaste: 'phone, laptop, keyboard, mouse or remote' };
  function cameraScreen() {
    const it = ITEMS[F.item];
    SK.dark(true);
    SK.$app.innerHTML = `<div class="flow dark"><div class="flow-top"><button class="icon-btn" id="back" aria-label="Close camera">${ic('close', 24)}</button><h2>Scan your ${esc(LOOK[F.item].split(' ')[0])}</h2></div>
      <div class="flow-body">
        <div class="cam" id="camwrap"><video id="vid" playsinline muted autoplay></video><div class="frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
        <div class="cam-status" id="cs" aria-live="polite">Starting camera\u2026</div>
        <p class="caption center">Looks for: ${esc(LOOK[F.item])}. Your photo stays on your phone.</p>
      </div>
      <div class="flow-foot"><button class="shutter" id="snap" disabled aria-label="Snap and hatch"><i></i></button><button class="btn btn-ghost" id="tips">Can\u2019t scan? Tips</button></div></div>`;
    SK.on('back', () => { SK.stopCam(); SK.catchFlow(F.kind); });
    SK.on('snap', snap);
    SK.on('tips', () => SK.sheet('Scanning tips', `<div class="stack"><p>Hold the item so it fills most of the frame, in good light.</p><p>Plain backgrounds work best. Keep your hand from covering it.</p>
      <p>Snap it where you\u2019re actually using it. Photos that look the same as an earlier one are blocked.</p><p class="muted">Allow camera access when your browser asks. If you said no, turn it back on in your browser\u2019s site settings.</p></div>`));
    startCam();
  }
  const setCs = (t, ok) => { const el = doc.getElementById('cs'); if (el) el.innerHTML = (ok ? Icon.svg('check', 20) : '') + '<span>' + esc(t) + '</span>'; const w = doc.getElementById('camwrap'); if (w) w.classList.toggle('found', !!ok); };
  function loadScript(src) { return new Promise((res, rej) => { const s = doc.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = rej; doc.head.appendChild(s); }); }
  async function getModel() {
    if (root.__cocoModel) return root.__cocoModel;
    if (!root.cocoSsd) {
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
    }
    root.__cocoModel = await root.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    return root.__cocoModel;
  }
  let cam = null;
  SK.stopCam = function () { if (cam) { cam.alive = false; clearTimeout(cam.timer); try { cam.stream.getTracks().forEach(t => t.stop()); } catch (e) { } cam = null; } };
  async function startCam() {
    const md = root.navigator.mediaDevices;
    if (!root.isSecureContext) return setCs('The camera needs a secure (https) link.');
    if (!md || !md.getUserMedia) return setCs('No camera available on this device.');
    let stream;
    try { stream = await md.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }); } catch (e) { return setCs('Camera access is off. Allow it in your browser\u2019s site settings, then try again.'); }
    const v = doc.getElementById('vid'); if (!v) { stream.getTracks().forEach(t => t.stop()); return; }
    cam = { stream, alive: true, seen: [], seenAt: 0, start: Date.now() }; v.srcObject = stream;
    setCs('Loading the scanner\u2026');
    let model; try { model = await getModel(); } catch (e) { return setCs('The scanner couldn\u2019t load. Check your internet and try again.'); }
    if (!cam || !cam.alive) return;
    const it = ITEMS[F.item];
    setCs('Hold steady\u2026');
    const loop = async () => {
      if (!cam || !cam.alive) return;
      const vid = doc.getElementById('vid');
      if (vid && vid.readyState >= 2) {
        try {
          const preds = await model.detect(vid, 10, 0.5);
          const m = (preds || []).filter(p => p.score >= 0.5 && it.detect.includes(p.class)).map(p => p.class);
          const b = doc.getElementById('snap');
          if (m.length) {
            cam.seen = m; cam.seenAt = Date.now();
            setCs(F.together && m.length < 2 ? 'Found one. Show the second one too.' : 'Found it. Tap to snap.', true);
            if (b && b.disabled) { b.disabled = false; SK.vibrate(20); SK.announce('Item found. Ready to snap.'); }
          } else if (Date.now() - cam.seenAt > 1500) {
            if (b) b.disabled = true;
            setCs(Date.now() - cam.start > 8000 ? 'Not found yet. Fill the frame, use good light, or see Tips.' : 'Hold steady\u2026');
          }
        } catch (e) { }
      }
      if (cam && cam.alive) cam.timer = setTimeout(loop, 400);
    };
    loop();
  }
  // 9x8 grayscale grid for dHash: average-pool a 72x64 downscale to reduce noise
  function grayGrid(video) {
    const cv = doc.createElement('canvas'); cv.width = 72; cv.height = 64;
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, 72, 64);
    const d = ctx.getImageData(0, 0, 72, 64).data, out = [];
    for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 9; gx++) {
      let sum = 0, n = 0;
      for (let y = gy * 8; y < gy * 8 + 8; y++) for (let x = gx * 8; x < gx * 8 + 8; x++) { const i = (y * 72 + x) * 4; sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++; }
      out.push(Math.round(sum / n));
    }
    return out;
  }
  async function snap() {
    const v = doc.getElementById('vid'); if (!cam || !v) return;
    const b = doc.getElementById('snap'); if (b) b.disabled = true;
    const gray = grayGrid(v), detected = cam.seen.slice();
    SK.stopCam();
    await SK.submitCapture(F.item, gray, detected, { together: F.together, family: F.family });
  }
  // Exposed for tests: send a capture (9x8 gray grid + detected classes) and show the result.
  SK.submitCapture = async function (item, gray, detected, flags) {
    flags = flags || {};
    const low = G.lowDetail(gray), hash = G.dhash(gray);
    const r = await SK.call('POST', '/api/action', { item, hash, detected, together: !!flags.together, family: !!flags.family, lowDetail: low });
    if (r.status !== 200) {
      SK.dark(false);
      const dup = r.body.error === 'duplicate';
      SK.$app.innerHTML = `<div class="flow light-flow"><div class="flow-body center"><div class="flex" style="justify-content:center">${Art.skippy(SP.drippet, { size: 96, mood: 'sleepy' })}</div>
        <h1>${dup ? 'Seen that photo before' : 'Not this time'}</h1><p class="muted">${esc(SK.errMsg(r))}</p></div>
        <div class="flow-foot"><button class="btn btn-primary btn-block" id="again">${ic('camera', 20)}Try again</button><button class="btn btn-secondary btn-block" id="home">Back home</button></div></div>`;
      SK.on('again', () => { F = F || { kind: ITEMS[item].kind, item }; F.item = item; cameraScreen(); });
      SK.on('home', () => SK.render());
      return r;
    }
    reveal(r.body.result, item);
    return r;
  };
  function reveal(res, item) {
    SK.dark(false); SK.clearTimers();
    const main = res.hatched[0], R = RARITY[main.rarity], big = R.rank >= 2;
    SK.$app.innerHTML = `<div class="flow reveal"><div class="flow-body"><div class="stage" id="eggwrap"><span class="${SK.reduced ? '' : 'egg-anim'}">${Art.egg(150, { label: 'Egg hatching', fill: big ? R.color : '#FBF6EC' })}</span></div><p class="center muted" id="eggtxt">${big ? 'It\u2019s glowing\u2026' : 'Hatching\u2026'}</p></div></div>`;
    SK.vibrate(big ? [20, 60, 20, 60, 80] : 30);
    SK.later(() => {
      const d = SK.st.dex[main.id], cost = G.mergeCost(SK.st, main.id), extras = res.hatched.slice(1);
      SK.$app.innerHTML = `<div class="flow reveal" aria-live="polite"><div class="flow-body center">
          <div class="flex" style="justify-content:center;gap:8px">${SK.rarityTag(main.rarity)}<span class="label">${main.isNew ? 'New Skippy' : 'Duplicate \u00b7 +1 copy'}</span></div>
          <div class="hero-tile r-${main.rarity} ${SK.reduced ? '' : 'pop'}" style="height:220px">${SK.art(main.id, { size: 180, bob: !SK.reduced })}</div>
          <h1 class="display rise">${esc(SK.nm(main.id))}</h1>
          <div class="flex rise" style="justify-content:center">${SK.typeChip(SP[main.id].type)}${SK.stars(d.stars, 18)}</div>
          <p class="muted">${esc(SP[main.id].blurb)}</p>
          ${!main.isNew && cost != null ? `<p class="body2"><b>${d.copies >= cost ? 'Ready to merge to ' + (d.stars + 1) + ' stars in the Dex.' : 'Copies ' + d.copies + ' of ' + cost + ' for the next star.'}</b></p>` : ''}
          ${extras.length ? `<div class="banner info" style="text-align:left">${ic('sparkle', 20)}<span><b>Bonus Skippy:</b> ${extras.map(x => esc(SK.nm(x.id))).join(' and ')}</span></div>` : ''}
          <div class="group tnum" style="display:grid;grid-template-columns:repeat(3,1fr);text-align:center">
            <div style="padding:10px 4px"><div class="flex" style="justify-content:center;gap:4px">${ic('energy', 16)}<b>+${res.energy}</b></div><span class="caption">Energy</span></div>
            <div style="padding:10px 4px;border-left:1px solid var(--line)"><div class="flex" style="justify-content:center;gap:4px">${ic('scrap', 16)}<b>+${res.scrap}</b></div><span class="caption">Scrap</span></div>
            <div style="padding:10px 4px;border-left:1px solid var(--line)"><div class="flex" style="justify-content:center;gap:4px">${ic('leaf', 16)}<b>+1%</b></div><span class="caption">${TYPES[ITEMS[item].type].name}</span></div>
          </div>
          ${res.reward ? `<div class="banner reward" style="text-align:left">${ic('trophy', 20)}<span><b>MamaShop reward unlocked.</b> Code <span class="code">${esc(res.reward)}</span></span></div>` : ''}
          ${res.kind === 'byo' ? '<p class="caption">After you use it: rinse your reusable and tap \u201cI rinsed\u201d on Home for +1 energy.</p>' : ''}
        </div>
        <div class="flow-foot"><button class="btn btn-primary btn-block" id="done">Done</button><button class="btn btn-ghost" id="viewdex">View in Dex</button></div></div>`;
      SK.announce((main.isNew ? 'New ' : 'Duplicate ') + R.name + ' Skippy: ' + SK.nm(main.id));
      SK.on('done', () => { SK.tab = 'home'; SK.render(); });
      SK.on('viewdex', () => { SK.tab = 'dex'; SK.render(); SK.creature(main.id); });
    }, SK.reduced ? 300 : 1800);
  }
})(typeof window !== 'undefined' ? window : globalThis);
