/* H3 Studio β: one-tap RunPod start / delete.
   Uses the RunPod API key already saved for the balance display (設定 → 残高).
   The phone cannot call the RunPod API directly (CORS), so requests go through the H3 Modal page server,
   which passes them on and keeps nothing. */
(function () {
  var RELAY = 'https://shuichisaitofd--h3-modal-web.us-east.modal.run/h3modal/runpod';
  var IMAGE = 'ghcr.io/shuichisaitofd/runpod-h3-mobile:h3-longtest-0978eb3f2e9e0ccca76848d1081bbac98ffba145';
  var GPUS = [['both', 'どちらでも（先に空いた方）'], ['NVIDIA RTX A6000', 'A6000（$0.59/時・ふつう）'], ['NVIDIA L40S', 'L40S（$1.12/時・速い）']];
  var WATCH_MS = 5 * 60000, RETRY_MS = 10000;
  var PENDING_KEY = 'h3nextRunpodPending';
  var GPU_KEY = 'h3nextRunpodGpu';

  function q(s) { return document.querySelector(s); }
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function apiKey() {
    var list = load('h3RunPodBillingAccountsV1', []);
    if (!Array.isArray(list) || !list.length) return '';
    var id = localStorage.getItem('h3RunPodBillingActiveAccountV1');
    var a = list.filter(function (x) { return x && x.id === id; })[0] || list[0];
    return (a && a.key) || '';
  }
  function relay(path, body) {
    body.key = apiKey();
    if (!body.key) return Promise.reject(new Error('API キーがありません（設定の「残高」で RunPod の API キーを登録してください）'));
    return fetch(RELAY + path, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.ok) throw new Error(d.error || '失敗しました'); return d; });
  }
  function podUrl(id) { return 'https://' + id + '-8188.proxy.runpod.net'; }
  function gpuLabel(g) { var m = GPUS.filter(function (x) { return x[0] === g; })[0]; return m ? m[1].split('（')[0] : g; }

  var card, msgEl, listEl, btn, sel, timer = null;
  function msg(t) { if (msgEl) msgEl.textContent = t; }

  function registerPod(p) {
    if (typeof getPods !== 'function' || typeof savePods !== 'function') return;
    var pods = getPods();
    var url = podUrl(p.id);
    var have = pods.filter(function (x) { return x.baseUrl === url; })[0];
    if (!have) {
      have = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(), name: 'RunPod ' + gpuLabel(p.gpu) + ' ' + p.id, baseUrl: url, runpodId: p.id };
      pods.push(have);
      savePods(pods);
    }
    if (typeof setActivePod === 'function') setActivePod(have.id);
    if (typeof renderPods === 'function') renderPods();
    if (typeof reconnectPod === 'function') reconnectPod();
  }
  function unregisterPod(id) {
    if (typeof getPods !== 'function') return;
    var url = podUrl(id);
    var pods = getPods();
    var left = pods.filter(function (x) { return x.baseUrl !== url; });
    if (left.length === pods.length) return;
    savePods(left);
    var active = typeof getActivePod === 'function' ? getActivePod() : null;
    if (!active && typeof setActivePod === 'function') setActivePod(left.length ? left[0].id : null);
    if (typeof renderPods === 'function') renderPods();
    if (typeof reconnectPod === 'function') reconnectPod();
  }

  function poll() {
    var p = load(PENDING_KEY, null);
    if (!p) { timer = null; return; }
    var mins = Math.floor((Date.now() - p.started) / 60000);
    fetch(podUrl(p.id) + '/system_stats', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('not ready'); return r.json(); })
      .then(function () {
        save(PENDING_KEY, null);
        registerPod(p);
        msg('起動しました（' + mins + '分）。Pod に登録して切り替えました。モデルの準備が終わるまで、もう少し待つことがあります。');
        refreshList();
        timer = null;
      })
      .catch(function () {
        if (Date.now() - p.started > 30 * 60000) {
          save(PENDING_KEY, null);
          msg('30分たっても起動しませんでした。下の一覧から削除して、もう一度試してください。');
          timer = null;
          return;
        }
        msg('起動中…（' + mins + '分たちました。ふつう5〜10分かかります。この画面を閉じても大丈夫です）');
        timer = setTimeout(poll, 15000);
      });
  }

  // Try to create a Pod; when there is no free GPU, keep trying every 10 s for 5 minutes (while this page is open).
  var watching = null;
  function stopWatch(text) {
    if (watching && watching.t) clearTimeout(watching.t);
    watching = null;
    btn.textContent = '起動';
    if (text) msg(text);
  }
  function tryOnce() {
    if (!watching) return;
    var w = watching;
    var gpu = w.order[w.n % w.order.length];
    w.n++;
    relay('/create', { gpu: gpu, image: IMAGE, name: 'h3-' + gpuLabel(gpu).toLowerCase() })
      .then(function (d) {
        if (watching !== w) return;
        stopWatch();
        save(PENDING_KEY, { id: d.id, gpu: gpu, started: Date.now() });
        msg(gpuLabel(gpu) + ' を確保しました（' + d.id + '）。起動を待っています…');
        refreshList();
        if (!timer) poll();
      })
      .catch(function (e) {
        if (watching !== w) return;
        var t = String(e.message || e);
        if (!/no (longer any|available)|instances available|not available|capacity|insufficient/i.test(t)) {
          stopWatch('起動できませんでした: ' + t);
          return;
        }
        var left = WATCH_MS - (Date.now() - w.started);
        if (left <= 0) {
          stopWatch('5分間、空きがありませんでした。もう一度「起動」を押すと、また5分見張ります。');
          return;
        }
        var s = Math.ceil(left / 1000);
        msg('空き待ち…（' + w.order.map(gpuLabel).join(' / ') + '、' + w.n + '回目、残り ' + Math.floor(s / 60) + '分' + (s % 60) + '秒）。この画面を開いたままにしてください。');
        w.t = setTimeout(tryOnce, RETRY_MS);
      });
  }
  function start() {
    if (watching) { stopWatch('見張りをやめました。'); return; }
    if (load(PENDING_KEY, null)) { msg('いま起動中の Pod があります。終わるまで待ってください。'); return; }
    var choice = sel.value;
    save(GPU_KEY, choice);
    var order = choice === 'both' ? ['NVIDIA RTX A6000', 'NVIDIA L40S'] : [choice];
    watching = { order: order, n: 0, started: Date.now(), t: null };
    btn.textContent = 'やめる';
    msg('Pod を作っています…');
    tryOnce();
  }

  function del(p) {
    if (!confirm('Pod「' + (p.name || p.id) + '」を削除（Terminate）します。中の動画も消えます。よろしいですか？')) return;
    msg('削除しています…');
    relay('/delete', { id: p.id })
      .then(function () {
        var pend = load(PENDING_KEY, null);
        if (pend && pend.id === p.id) save(PENDING_KEY, null);
        unregisterPod(p.id);
        msg('削除しました。お金はもうかかりません。');
        refreshList();
      })
      .catch(function (e) { msg('削除できませんでした: ' + (e.message || e)); });
  }

  function refreshList() {
    if (!listEl) return;
    if (!apiKey()) { listEl.innerHTML = '<div class="small">設定の「残高」で RunPod の API キーを登録すると使えます。</div>'; return; }
    relay('/pods', {})
      .then(function (d) {
        listEl.innerHTML = '';
        if (!d.pods.length) { listEl.innerHTML = '<div class="small">動いている Pod はありません（お金はかかっていません）。</div>'; return; }
        d.pods.forEach(function (p) {
          var row = document.createElement('div');
          row.className = 'nx-rp-row';
          row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 0';
          var info = document.createElement('div');
          info.style.cssText = 'flex:1;min-width:0;font-size:13px';
          info.textContent = (p.name || p.id) + ' / ' + (p.gpu || '') + ' / ' + (p.desiredStatus || '') + (p.costPerHr != null ? ' / $' + Number(p.costPerHr).toFixed(2) + '/時' : '');
          var b = document.createElement('button');
          b.className = 'secondary';
          b.textContent = '削除';
          b.onclick = function () { del(p); };
          row.appendChild(info);
          row.appendChild(b);
          listEl.appendChild(row);
        });
      })
      .catch(function (e) { listEl.innerHTML = '<div class="small">一覧を読めませんでした: ' + String(e.message || e).replace(/</g, '&lt;') + '</div>'; });
  }

  function place() {
    var page = q('section[data-page="settings"]');
    if (!page) return false;
    if (q('#nxRunpodCard')) return true;
    card = document.createElement('div');
    card.className = 'card'; card.id = 'nxRunpodCard';
    card.innerHTML = '<h2>RunPod をワンタップで起動（テスト）</h2>' +
      '<div class="small">GPU を選んで「起動」を押すと、Pod を作って、準備ができたら自動で登録・切り替えします。空きがないときは、5分間見張って空いたら確保します。使い終わったら下の一覧で「削除」を押してください（削除するまでお金がかかります）。</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><select id="nxRpGpu" style="flex:1"></select><button id="nxRpStart">起動</button></div>' +
      '<div class="small" id="nxRpMsg" style="margin-top:8px"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px"><b style="font-size:14px">動いている Pod</b><button class="secondary" id="nxRpReload">更新</button></div>' +
      '<div id="nxRpList" style="margin-top:4px"></div>';
    var first = page.querySelector('.card');
    if (first && first.nextSibling) page.insertBefore(card, first.nextSibling); else page.appendChild(card);
    sel = q('#nxRpGpu'); btn = q('#nxRpStart'); msgEl = q('#nxRpMsg'); listEl = q('#nxRpList');
    GPUS.forEach(function (g) { var o = document.createElement('option'); o.value = g[0]; o.textContent = g[1]; sel.appendChild(o); });
    var last = load(GPU_KEY, null); if (last) sel.value = last;
    btn.onclick = start;
    q('#nxRpReload').onclick = refreshList;
    refreshList();
    if (load(PENDING_KEY, null) && !timer) poll();
    return true;
  }

  if (!place()) {
    var tries = 0;
    var iv = setInterval(function () { if (place() || ++tries > 40) clearInterval(iv); }, 250);
  }
})();
