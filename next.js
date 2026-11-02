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

/* H3 Studio β: LoRA quick list (作成 / 一括) — long-press a tile and drag it to change the order.
   The move itself uses the list's own (hidden) ↑ / ↓ buttons, so the saved order works exactly as before. */
(function () {
  var HOLD = 320, SLOP = 10, EDGE = 110;
  var press = null, drag = null, raf = 0;
  function rowsOf(list) { return Array.prototype.slice.call(list.querySelectorAll('.h3-lora-qrow')); }
  function pt(e) { var t = e.touches ? (e.touches[0] || e.changedTouches[0]) : e; return { x: t.clientX, y: t.clientY }; }
  function hints() {
    ['h3LoraQuick', 'h3LoraBatchQuick'].forEach(function (id) {
      var list = document.getElementById(id);
      if (list && !document.getElementById(id + 'Hint')) {
        var h = document.createElement('div'); h.id = id + 'Hint'; h.className = 'small h3-lora-quick-hint';
        h.textContent = '並べ替え: タイルを長押しして、そのままドラッグ';
        list.parentNode.insertBefore(h, list.nextSibling);
      }
    });
  }
  function start(e) {
    var row = e.target.closest && e.target.closest('.h3-lora-quick .h3-lora-qrow');
    if (!row || e.target.closest('button,input,select,textarea')) return;
    if (e.type === 'mousedown' && e.button !== 0) return;
    var p = pt(e);
    press = { row: row, list: row.parentNode, x: p.x, y: p.y, timer: setTimeout(function () { lift(p); }, HOLD) };
  }
  function lift(p) {
    if (!press) return;
    var row = press.row, list = press.list;
    drag = { row: row, list: list, id: row.dataset.loraId, sx: press.x, sy: press.y, sScroll: window.scrollY, x: p.x, y: p.y, target: null };
    press = null;
    row.classList.add('nx-lift'); list.classList.add('nx-dragging');
    if (navigator.vibrate) try { navigator.vibrate(12); } catch (err) {}
    loop();
  }
  function move(e) {
    if (press && !drag) {
      var p0 = pt(e);
      if (Math.abs(p0.x - press.x) > SLOP || Math.abs(p0.y - press.y) > SLOP) { clearTimeout(press.timer); press = null; }
      return;
    }
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    var p = pt(e); drag.x = p.x; drag.y = p.y; place();
  }
  function place() {
    var d = drag; if (!d) return;
    d.row.style.transform = 'translate(' + (d.x - d.sx) + 'px,' + (d.y - d.sy + window.scrollY - d.sScroll) + 'px) scale(1.03)';
    var el = document.elementFromPoint(d.x, d.y), over = el && el.closest && el.closest('.h3-lora-qrow');
    if (over && over.parentNode !== d.list) over = null;
    if (over === d.row) over = null;
    if (over !== d.target) {
      if (d.target) d.target.classList.remove('nx-target');
      d.target = over; if (over) over.classList.add('nx-target');
    }
  }
  function loop() {
    cancelAnimationFrame(raf);
    (function step() {
      if (!drag) return;
      var dy = 0, h = window.innerHeight;
      if (drag.y < EDGE) dy = -Math.ceil((EDGE - drag.y) / 6);
      else if (drag.y > h - EDGE - 40) dy = Math.ceil((drag.y - (h - EDGE - 40)) / 6);
      if (dy) { window.scrollBy(0, dy); place(); }
      raf = requestAnimationFrame(step);
    })();
  }
  function end() {
    if (press) { clearTimeout(press.timer); press = null; }
    if (!drag) return;
    var d = drag; drag = null; cancelAnimationFrame(raf);
    d.row.classList.remove('nx-lift'); d.row.style.transform = ''; d.list.classList.remove('nx-dragging');
    if (d.target) d.target.classList.remove('nx-target');
    if (!d.target) return;
    var rows = rowsOf(d.list), from = rows.indexOf(d.row), to = rows.indexOf(d.target);
    if (from < 0 || to < 0 || from === to) return;
    var cls = to < from ? '.lora-up' : '.lora-down', n = Math.abs(to - from), sel = '.h3-lora-qrow[data-lora-id="' + (window.CSS && CSS.escape ? CSS.escape(d.id) : d.id) + '"] ' + cls;
    for (var i = 0; i < n; i++) {
      var b = d.list.querySelector(sel); if (!b) break; b.click();
    }
  }
  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: false });
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  document.addEventListener('mousedown', start); document.addEventListener('mousemove', move); document.addEventListener('mouseup', end);
  document.addEventListener('contextmenu', function (e) { if (drag || (e.target.closest && e.target.closest('.h3-lora-quick .h3-lora-qrow') && !e.target.closest('input'))) e.preventDefault(); });
  var n = 0; (function tryHints() { hints(); if (n++ < 40 && !(document.getElementById('h3LoraQuickHint') && document.getElementById('h3LoraBatchQuickHint'))) setTimeout(tryHints, 300); })();
})();
