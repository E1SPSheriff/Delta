/* Mamashop Rewards inside Skippies. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document, ic = SK.ic, esc = SK.esc, C = G.C;
  const KEY = 'mamashop_rewards';
  const CATS = [
    ['Lunchboxes', 1, 'On the Go'], ['Reusable Straws', 1, 'On the Go'],
    ['Reusable Cups', 1, 'On the Go'], ['Reusable Bowls', 1, 'On the Go'],
    ['Reusable Utensils', 1, 'On the Go'], ['Local Collection', 2, 'Local Collection'],
    ['Kitchenware', 1, 'Homeware'], ['Tableware', 1, 'Homeware'],
    ['Drinkware', 1, 'Homeware'], ['Combs', 1, 'Eco-Living'],
    ['Furniture', 1, 'Eco-Living'], ['Disney Collection', 1, 'Disney'],
    ['Gifts', 1, 'Gifts'], ['Kids', 1, 'Kids'], ['Premium', 1.5, 'Premium'],
    ['Sale', 0.5, 'Sale']
  ];
  const TIERS = [
    ['Sprout', 0, 'Earn 1 point per $1 spent.'],
    ['Sapling', 500, 'Lower free shipping threshold.'],
    ['Evergreen', 1500, 'Early access to new arrivals and Local Collection drops.']
  ];
  const REWARDS = [
    ['Free shipping', 150, 'One order, any size', 0],
    ['Reusable straw set', 300, 'Pick one from On the Go', 0],
    ['$5 voucher', 250, 'Any full price item', 0],
    ['$10 voucher', 450, 'Any full price item', 0],
    ['Early access pass', 200, 'Shop the next drop first', 2]
  ];
  const ARTICLES = [
    'Why reusables beat single use',
    'Meet the makers behind our Local Collection',
    'How to pack a zero waste lunchbox'
  ];
  let cart = [], selectedCat = 0;

  function fallback() { return { pts: 0, life: 0, plastic: 0, log: [], reads: { wk: '', ids: [] } }; }
  function load() {
    try {
      const s = JSON.parse(root.localStorage.getItem(KEY));
      if (!s) return fallback();
      if (!Array.isArray(s.log)) s.log = [];
      if (!s.reads || !Array.isArray(s.reads.ids)) s.reads = { wk: '', ids: [] };
      s.pts = Number.isFinite(s.pts) ? Math.max(0, Math.floor(s.pts)) : 0;
      s.life = Number.isFinite(s.life) ? Math.max(0, Math.floor(s.life)) : 0;
      s.plastic = Number.isFinite(s.plastic) ? Math.max(0, Math.floor(s.plastic)) : 0;
      return s;
    } catch (_) { return fallback(); }
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
  function week() {
    const d = new Date(), jan = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + '-' + Math.floor((d - jan) / 604800000);
  }
  function tierIndex(s) {
    let i = 0;
    TIERS.forEach((t, k) => { if (s.life >= t[1]) i = k; });
    return i;
  }
  function add(s, points, why) {
    s.pts += points;
    s.life += Math.max(0, points);
    s.log.unshift({ w: why, p: points, d: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) });
    s.log = s.log.slice(0, 30);
    save(s);
  }
  function calc() {
    let points = 0, groups = {};
    cart.forEach(line => {
      points += Math.floor(line.amount * CATS[line.category][1]);
      groups[CATS[line.category][2]] = 1;
    });
    return { points, bonus: Object.keys(groups).length >= 3 ? 50 : 0 };
  }
  const seasonClaims = () => (SK.st && Array.isArray(SK.st.claims) ? SK.st.claims : []).filter(c => c.season === (SK.st && SK.st.season));
  const claimEligible = () => !!SK.st && G.seasonActionDays(SK.st) >= C.STAR_DAYS && !!SK.st.rewardCode && SK.st.rewardSeason === SK.st.season;

  SK.views.rewards = function () {
    const s = load(), ti = tierIndex(s), next = TIERS[ti + 1];
    const progress = next ? Math.max(0, Math.min(100, (s.life - TIERS[ti][1]) / (next[1] - TIERS[ti][1]) * 100)) : 100;
    const used = s.reads.wk === week() ? s.reads.ids.length : 0;
    const result = calc();
    return `
      <div class="page-title">
        <div><span class="label">Mamashop Rewards demo</span><h1 class="mt4">${s.pts} points</h1></div>
        <img src="logos/mamashop-rewards-icon.png" width="44" height="44" alt="Mamashop Rewards" style="object-fit:contain">
      </div>
      <section class="section" style="margin-top:8px">
        <div class="banner reward">
          <span class="lead" style="width:48px;height:48px;background:var(--surface);border-radius:50%;display:grid;place-items:center">${ic('trophy', 26)}</span>
          <span><b>${TIERS[ti][0]} member</b><br><span>${next ? (next[1] - s.life) + ' points to ' + next[0] : 'You are at our top tier.'}</span></span>
        </div>
        <div class="group mt12" style="padding:16px">
          <div class="flex between"><b>Tier progress</b><span class="meta tnum">${s.life} lifetime points</span></div>
          ${SK.bar(progress, 100, '', TIERS[ti][0] + ' tier progress')}
          <div class="flex mt12" style="gap:6px">${TIERS.map((t, i) => `<span class="pill" style="flex:1;justify-content:center;height:40px;${i === ti ? 'border-color:var(--brand);color:var(--brand)' : ''}">${esc(t[0])}</span>`).join('')}</div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Plastic avoided</span><b class="tnum">${s.plastic} items</b></div>
        <div class="banner info">Reusable straws, cups, bowls and lunchboxes you have bought.</div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Earn points</span></div>
        <div class="group" style="padding:16px">
          <label class="field"><span>Category</span><select class="input" id="reward-category">${CATS.map((c, i) => `<option value="${i}" ${i === selectedCat ? 'selected' : ''}>${esc(c[0])} (${c[1]}x)</option>`).join('')}</select></label>
          <label class="field mt12"><span>Amount</span><input class="input tnum" id="reward-amount" type="number" min="1" step="0.01" inputmode="decimal" placeholder="25.00"></label>
          <label class="field mt12"><span>Items</span><input class="input tnum" id="reward-qty" type="number" min="1" value="1" inputmode="numeric"></label>
          <button class="btn btn-primary btn-block mt12" id="reward-add">Add to purchase</button>
        </div>
        ${cart.length ? `<div class="group mt12">${cart.map((line, i) => `<div class="row"><span class="grow"><span class="title">${esc(CATS[line.category][0])} x${line.qty}</span><br><span class="meta">$${line.amount.toFixed(2)}</span></span><button class="icon-btn" data-remove-reward="${i}" aria-label="Remove purchase">${ic('trash', 18)}</button></div>`).join('')}<div class="row"><span class="grow"><b>Purchase points</b></span><b class="tnum">${result.points}</b></div><div class="row"><span class="grow"><span class="title">Bundle bonus</span><br><span class="meta">3 different groups</span></span><b class="tnum">${result.bonus}</b></div><div class="row"><span class="grow"><b>Confirm</b></span><button class="btn btn-accent btn-sm" id="reward-confirm">Earn ${result.points + result.bonus} pts</button></div></div>` : `<div class="banner info mt12">Your purchase is empty. Add a line to see your points.</div>`}
      </section>
      <section class="section">
        <div class="section-head"><span class="label">More ways to earn</span></div>
        <p class="muted">Journal reads: 5 points each, up to 3 a week (${used} of 3 used).</p>
        <div class="group">${ARTICLES.map((article, i) => {
          const done = s.reads.wk === week() && s.reads.ids.indexOf(i) > -1;
          return `<div class="row"><span class="grow title">${esc(article)}</span><button class="btn btn-ghost btn-sm" data-read="${i}" ${done ? 'disabled' : ''}>${done ? 'Read' : 'Read +5'}</button></div>`;
        }).join('')}</div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">SKIPPIES season claim</span></div>
        <p class="muted">Claims come from ${C.STAR_DAYS} real BYO/recycling days in one season. They are issued here, not typed in by players.</p>
        ${claimEligible() && !seasonClaims().some(c => c.status === 'active') ? `<button class="btn btn-primary btn-block mt12" id="claim-create">${ic('trophy', 20)}Get my MamaShop claim</button>` : ''}
        ${seasonClaims().length ? `<div class="group mt12">${seasonClaims().map(c => `<div class="row"><span class="lead">${ic(c.status === 'redeemed' ? 'check' : 'trophy', 20)}</span><span class="grow"><span class="title">${esc(c.reward)}</span><br><span class="meta">${esc(c.id)} · ${c.status === 'redeemed' ? 'Used' : 'Active'}</span></span>${c.status === 'active' ? `<button class="btn btn-ghost btn-sm" data-use-claim="${esc(c.id)}">Mark used (demo)</button>` : ''}</div>`).join('')}</div>`
        : `<div class="banner info mt12">${claimEligible() ? 'Your claim is ready to issue.' : 'Keep logging real BYO or recycling days to unlock a claim.'}</div>`}
        <p class="caption mt8">This is a campaign demo counter. No purchase is required and no real voucher value is promised.</p>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Redeem</span></div>
        <div class="group">${REWARDS.map((reward, i) => {
          const locked = ti < reward[3], low = s.pts < reward[1];
          return `<div class="row"><span class="lead">${ic('trophy', 20)}</span><span class="grow"><span class="title">${esc(reward[0])}</span><br><span class="meta">${esc(reward[2])}</span></span><button class="btn btn-ghost btn-sm" data-reward="${i}" ${locked || low ? 'disabled' : ''}>${locked ? 'Evergreen only' : low ? (reward[1] - s.pts) + ' pts to go' : 'Redeem'}</button></div>`;
        }).join('')}</div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Recent activity</span></div>
        ${s.log.length ? `<div class="group">${s.log.slice(0, 6).map(item => `<div class="row"><span class="grow"><span class="title">${esc(item.w)}</span><br><span class="meta">${esc(item.d)}</span></span><b class="tnum">${item.p > 0 ? '+' : ''}${item.p}</b></div>`).join('')}</div>` : `<div class="banner info">Nothing yet. Log a purchase to get your first points.</div>`}
      </section>`;
  };

  let claimChecked = '';
  SK.binders.rewards = function () {
    const checkKey = (SK.st && SK.st.id) + ':' + (SK.st && SK.st.season) + ':' + seasonClaims().map(c => c.id + c.status).join(',');
    if (checkKey !== claimChecked) { claimChecked = checkKey; SK.call('GET', '/api/rewards/claim').then(r => { if (r.status === 200 && r.body.state) SK.render(); }); }
    SK.on('claim-create', async () => {
      const r = await SK.call('POST', '/api/rewards/claim');
      SK.toast(r.status === 200 ? 'Claim issued: ' + r.body.claim.id : SK.errMsg(r, 'Not eligible yet.'), r.status === 200 ? 'check' : 'alert');
      if (SK.audio) SK.audio.play(r.status === 200 ? 'reward' : 'error');
      if (r.status === 200) SK.render();
    });
    doc.querySelectorAll('[data-use-claim]').forEach(button => {
      button.onclick = async () => {
        const r = await SK.call('POST', '/api/rewards/redeem', { id: button.dataset.useClaim });
        SK.toast(r.status === 200 ? 'Marked as used (demo)' : SK.errMsg(r), r.status === 200 ? 'check' : 'alert');
        if (SK.audio) SK.audio.play(r.status === 200 ? 'tap' : 'error');
        if (r.status === 200) SK.render();
      };
    });
    const category = doc.getElementById('reward-category');
    if (category) category.onchange = () => { selectedCat = Number(category.value); };
    SK.on('reward-add', () => {
      const amount = parseFloat(doc.getElementById('reward-amount').value);
      const qty = parseInt(doc.getElementById('reward-qty').value, 10) || 1;
      if (!(amount > 0)) return SK.toast('Enter an amount above $0.', 'alert');
      cart.push({ category: selectedCat, amount, qty });
      SK.render();
    });
    SK.on('reward-confirm', () => {
      const s = load(), result = calc();
      cart.forEach(line => { if (CATS[line.category][2] === 'On the Go') s.plastic += line.qty; });
      add(s, result.points, 'Purchase (' + cart.length + ' item line' + (cart.length > 1 ? 's' : '') + ')');
      if (result.bonus) add(s, result.bonus, 'Bundle bonus');
      cart = [];
      SK.toast('You earned ' + (result.points + result.bonus) + ' points.', 'check');
      SK.render();
    });
    doc.querySelectorAll('[data-remove-reward]').forEach(button => {
      button.onclick = () => { cart.splice(Number(button.dataset.removeReward), 1); SK.render(); };
    });
    doc.querySelectorAll('[data-read]').forEach(button => {
      button.onclick = () => {
        const s = load();
        if (s.reads.wk !== week()) s.reads = { wk: week(), ids: [] };
        if (s.reads.ids.length >= 3) return SK.toast('Weekly limit reached. Come back next week.', 'info');
        const i = Number(button.dataset.read);
        s.reads.ids.push(i);
        add(s, 5, 'Read: ' + ARTICLES[i]);
        SK.toast('+5 points', 'check');
        SK.render();
      };
    });
    doc.querySelectorAll('[data-reward]').forEach(button => {
      button.onclick = () => {
        const i = Number(button.dataset.reward), reward = REWARDS[i];
        SK.sheet('How to use this reward', `<div class="stack"><p><b>${esc(reward[0])}</b> is a demo rewards catalogue item.</p>
          <p>Real SKIPPIES season claims are issued from verified BYO and recycling days above. No locally generated code counts at MamaShop.</p></div>`);
      };
    });
  };
})(window);
