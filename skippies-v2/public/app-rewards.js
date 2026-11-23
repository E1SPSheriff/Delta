/* SKIPPIES: Mamashop Rewards, hosted inside the game shell. */
(function (root) {
  'use strict';
  const SK = root.SK;

  SK.views.rewards = function () {
    const url = root.MAMASHOP_REWARDS_URL || './rewards/';
    return `<iframe class="rewards-frame" src="${SK.esc(url)}" title="Mamashop Rewards" loading="eager"></iframe>`;
  };

  SK.binders.rewards = function () {
    const frame = root.document.querySelector('.rewards-frame');
    if (!frame) return;
    frame.addEventListener('load', function () {
      try {
        const doc = frame.contentDocument;
        if (!doc) return;
        const nav = doc.querySelector('nav');
        if (nav) nav.style.display = 'none';
        const wrap = doc.querySelector('.wrap');
        if (wrap) wrap.style.paddingBottom = '24px';
      } catch (_) {}
    });
  };
})(window);
