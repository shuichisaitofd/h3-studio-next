/* H3 Studio β: move the 10Eros / Veda buttons from the floating spot into 設定.
   The buttons and panels themselves are the same ones h3-studio's veda-eros.js / veda-panel.js create. */
(function () {
  function q(s) { return document.querySelector(s); }
  var scrim, closeBtn;
  function panels() { return [q('#vedaPanel'), q('#erosPanel')].filter(Boolean); }
  function anyOpen() { return panels().some(function (p) { return p.style.display !== 'none'; }); }
  function closeAll() { panels().forEach(function (p) { p.style.display = 'none'; }); sync(); }
  function sync() {
    var on = anyOpen();
    if (scrim) scrim.classList.toggle('on', on);
    if (closeBtn) closeBtn.classList.toggle('on', on);
  }
  function place() {
    var page = q('section[data-page="settings"]'), vp = q('#vedaPill'), ep = q('#erosPill');
    if (!page || !vp || !ep) return false;
    var card = q('#nxEngineCard');
    if (!card) {
      card = document.createElement('div');
      card.className = 'card nx-engine'; card.id = 'nxEngineCard';
      card.innerHTML = '<h2>モデル・高速化</h2>' +
        '<div class="small">生成に使うモデル（10Eros）と高速化（Veda）の設定です。タップで設定パネルが開きます。</div>' +
        '<div class="nx-engine-grid"><div class="nx-engine-slot" data-k="eros"><span class="nx-engine-label">Model</span></div>' +
        '<div class="nx-engine-slot" data-k="veda"><span class="nx-engine-label">Speed · Veda</span></div></div>';
      page.insertBefore(card, page.firstChild);
    }
    card.querySelector('[data-k="eros"]').appendChild(ep);
    card.querySelector('[data-k="veda"]').appendChild(vp);
    if (!scrim) {
      scrim = document.createElement('div'); scrim.id = 'nxScrim'; scrim.onclick = closeAll;
      closeBtn = document.createElement('button'); closeBtn.id = 'nxClose'; closeBtn.type = 'button'; closeBtn.textContent = '閉じる'; closeBtn.onclick = closeAll;
      document.body.appendChild(scrim); document.body.appendChild(closeBtn);
      if (window.MutationObserver) panels().forEach(function (p) { new MutationObserver(sync).observe(p, { attributes: true, attributeFilter: ['style'] }); });
      document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.nav')) closeAll(); }, true);
    }
    sync();
    return true;
  }
  function start() {
    var n = 0;
    (function tryPlace() { if (!place() && n++ < 40) setTimeout(tryPlace, 250); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 0); }); else start();
})();
