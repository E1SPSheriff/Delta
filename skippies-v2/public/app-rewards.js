/* SKIPPIES: native Mamashop loyalty and rewards. */
(function (root) {
  'use strict';
  const SK = root.SK, doc = root.document, ic = SK.ic, esc = SK.esc;
  const KEY = 'mamashop_rewards_native';
  const TIERS = [
    { name: 'Sprout', min: 0, perk: 'Earn 1 point per $1 spent.' },
    { name: 'Sapling', min: 500, perk: 'Lower free shipping threshold.' },
    { name: 'Evergreen', min: 1500, perk: 'Early access to local and new-arrival drops.' }
  ];
  const CATS = [
    ['Lunchboxes', 1], ['Reusable straws', 1], ['Reusable cups', 1],
    ['Reusable bowls', 1], ['Reusable utensils', 1], ['Kitchenware', 1],
    ['Tableware', 1], ['Drinkware', 1], ['Local collection', 2],
    ['Premium', 1.5], ['Sale', 0.5]
  ];
  const REWARDS = [
    { name: 'Free shipping', cost: 150, detail: 'One order, any size', tier: 0 },
    { name: 'Reusable straw set', cost: 300, detail: 'One On the Go reward', tier: 0 },
    { name: '$5 voucher', cost: 250, detail: 'Any full-price item', tier: 0 },
    { name: '$10 voucher', cost: 450, detail: 'Any full-price item', tier: 0 },
    { name: 'Early access pass', cost: 200, detail: 'Shop the next drop first', tier: 2 }
  ];
  let cart = [], selectedCat = 0;

  function load() {
    const fallback = { points: 0, lifetime: 0, log: [], journal: { week: '', ids: [] } };
    try {
      const saved = JSON.parse(root.localStorage.getItem(KEY));
      if (!saved) return fallback;
      return {
        points: Number.isFinite(saved.points) ? Math.max(0, Math.floor(saved.points)) : 0,
        lifetime: Number.isFinite(saved.lifetime) ? Math.max(0, Math.floor(saved.lifetime)) : 0,
        log: Array.isArray(saved.log) ? saved.log : [],
        journal: saved.journal && Array.isArray(saved.journal.ids) ? saved.journal : { week: '', ids: [] }
      };
    } catch (_) { return fallback; }
  }
  function save(s) { try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {} }
  function week() {
    const d = new Date(), jan = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + '-' + Math.floor((d - jan) / 604800000);
  }
  function tier(s) {
    let current = TIERS[0];
    TIERS.forEach(t => { if (s.lifetime >= t.min) current = t; });
    return TIERS.indexOf(current);
  }
  function add(s, points, label) {
    s.points += points;
    s.lifetime += Math.max(0, points);
    s.log.unshift({ label, points, date: new Date().toLocaleDateString('en-SG', { day: 'numeric', month: 'short' }) });
    s.log = s.log.slice(0, 20);
    save(s);
  }
  function purchase(s) {
    let points = 0;
    cart.forEach(line => { points += Math.floor(line.amount * CATS[line.category][1]); });
    if (new Set(cart.map(line => line.category)).size >= 3) points += 50;
    if (!points) return SK.toast('Add an item to earn points.', 'alert');
    add(s, points, 'Purchase reward');
    cart = [];
    SK.toast('You earned ' + points + ' points.', 'check');
  }

  SK.views.rewards = function () {
    const s = load(), ti = tier(s), next = TIERS[ti + 1];
    const progress = next ? Math.max(0, Math.min(100, (s.lifetime - TIERS[ti].min) / (next.min - TIERS[ti].min) * 100)) : 100;
    const toNext = next ? next.min - s.lifetime : 0;
    return `
      <div class="page-title"><div><span class="label">Mamashop Rewards</span><h1 class="mt4">${s.points} points</h1></div><span class="pill" style="height:36px">${TIERS[ti].name}</span></div>
      <section class="section" style="margin-top:8px">
        <div class="banner reward"><span class="lead" style="width:48px;height:48px;background:var(--surface);border-radius:50%;display:grid;place-items:center">${ic('trophy', 26)}</span><span><b>${TIERS[ti].name} member</b><br><span>${next ? toNext + ' points to ' + next.name : TIERS[ti].perk}</span></span></div>
        <div class="group mt12" style="padding:16px">
          <div class="flex between"><b>Tier progress</b><span class="meta tnum">${s.lifetime} lifetime points</span></div>
          ${SK.bar(progress, 100, '', TIERS[ti].name + ' tier progress')}
          <div class="flex mt12" style="gap:8px">${TIERS.map((t, i) => `<span class="pill" style="flex:1;justify-content:center;height:40px;${i === ti ? 'border-color:var(--brand);color:var(--brand)' : ''}">${esc(t.name)}</span>`).join('')}</div>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Earn points</span></div>
        <div class="group" style="padding:16px">
          <label class="field"><span>Category</span><select class="input" id="reward-category">${CATS.map((c, i) => `<option value="${i}" ${i === selectedCat ? 'selected' : ''}>${esc(c[0])} (${c[1]}x)</option>`).join('')}</select></label>
          <label class="field mt12"><span>Purchase amount</span><input class="input tnum" id="reward-amount" type="number" min="1" step="0.01" inputmode="decimal" placeholder="25.00"></label>
          <button class="btn btn-primary btn-block mt12" id="reward-add">Add to purchase</button>
        </div>
        ${cart.length ? `<div class="group mt12">${cart.map((line, i) => `<div class="row"><span class="grow"><span class="title">${esc(CATS[line.category][0])}</span><br><span class="meta">$${line.amount.toFixed(2)}</span></span><button class="icon-btn" data-remove-reward="${i}" aria-label="Remove purchase">${ic('trash', 18)}</button></div>`).join('')}<div class="row"><span class="grow"><b>Confirm purchase</b></span><button class="btn btn-accent btn-sm" id="reward-confirm">Earn points</button></div></div>` : ''}
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Redeem</span></div>
        <div class="group">${REWARDS.map((reward, i) => {
          const locked = ti < reward.tier, low = s.points < reward.cost;
          return `<div class="row"><span class="lead">${ic('trophy', 20)}</span><span class="grow"><span class="title">${esc(reward.name)}</span><br><span class="meta">${esc(reward.detail)}</span></span><button class="btn btn-ghost btn-sm" data-reward="${i}" ${locked || low ? 'disabled' : ''}>${locked ? 'Evergreen' : low ? reward.cost - s.points + ' pts' : reward.cost + ' pts'}</button></div>`;
        }).join('')}</div>
      </section>
      <section class="section">
        <div class="section-head"><span class="label">Recent activity</span></div>
        ${s.log.length ? `<div class="group">${s.log.slice(0, 6).map(item => `<div class="row"><span class="grow"><span class="title">${esc(item.label)}</span><br><span class="meta">${esc(item.date)}</span></span><b class="tnum">${item.points >= 0 ? '+' : ''}${item.points}</b></div>`).join('')}</div>` : `<div class="banner info">Add a purchase or journal read to earn your first Mamashop points.</div>`}
      </section>`;
  };

  SK.binders.rewards = function () {
    const category = doc.getElementById('reward-category');
    if (category) category.onchange = () => { selectedCat = Number(category.value); };
    const amount = doc.getElementById('reward-amount');
    SK.on('reward-add', () => {
      const value = amount ? parseFloat(amount.value) : 0;
      if (!(value > 0)) return SK.toast('Enter an amount above $0.', 'alert');
      cart.push({ category: selectedCat, amount: value });
      SK.render();
    });
    SK.on('reward-confirm', () => { purchase(load()); SK.render(); });
    doc.querySelectorAll('[data-remove-reward]').forEach(button => {
      button.onclick = () => { cart.splice(Number(button.dataset.removeReward), 1); SK.render(); };
    });
    doc.querySelectorAll('[data-reward]').forEach(button => {
      button.onclick = () => {
        const s = load(), reward = REWARDS[Number(button.dataset.reward)];
        if (s.points < reward.cost || ti(tier(s)) < reward.tier) return;
        add(s, -reward.cost, 'Redeemed ' + reward.name);
        SK.toast(reward.name + ' redeemed.', 'check');
        SK.render();
      };
    });
  };
  function ti(value) { return value; }
})(window);
