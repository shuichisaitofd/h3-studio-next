/* H3 Studio β: one-tap RunPod start / delete.
   Uses the RunPod API key already saved for the balance display (設定 → 残高).
   The phone cannot call the RunPod API directly (CORS), so requests go through the H3 Modal page server,
   which passes them on and keeps nothing. */
(function () {
  var RELAY = 'https://shuichisaitofd--h3-modal-web.us-east.modal.run/h3modal/runpod';
  var IMAGE = 'ghcr.io/shuichisaitofd/runpod-h3-mobile:h3-longtest-599587cfb064c01b806e951192d8b7b6bc66776d';
  var GPUS = [['both', 'どちらでも（先に空いた方）'], ['NVIDIA RTX A6000', 'A6000（$0.59/時・ふつう）'], ['NVIDIA L40S', 'L40S（$1.12/時・速い）']];
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

  // The watch runs on the Modal server (5 minutes, every 10 s), so this page can be closed.
  // The watch id is kept in this browser; when the page opens again it picks up the result.
  var WATCH_KEY = 'h3nextRunpodWatch', NTFY_KEY = 'h3nextNtfyTopic';
  var wtimer = null;
  function setBtn() { btn.textContent = load(WATCH_KEY, null) ? 'やめる' : '起動'; }
  function watchPoll() {
    wtimer = null;
    var w = load(WATCH_KEY, null);
    setBtn();
    if (!w) return;
    fetch(RELAY + '/watch-status', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ watch: w.id }), cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'status');
        if (d.status === 'ok') {
          save(WATCH_KEY, null); setBtn();
          if (!load(PENDING_KEY, null)) save(PENDING_KEY, { id: d.id, gpu: d.gpu, started: (d.at || Date.now() / 1000) * 1000 });
          msg(gpuLabel(d.gpu) + ' を確保しました（' + d.id + '）。起動を待っています…');
          refreshList();
          if (!timer) poll();
          return;
        }
        if (d.status === 'timeout') { save(WATCH_KEY, null); setBtn(); msg('5分間、空きがありませんでした。もう一度「起動」を押すと、また5分見張ります。'); return; }
        if (d.status === 'stopped') { save(WATCH_KEY, null); setBtn(); msg('見張りをやめました。'); return; }
        if (d.status === 'error') { save(WATCH_KEY, null); setBtn(); msg('起動できませんでした: ' + (d.error || '')); return; }
        var left = Math.max(0, Math.ceil(300 - (Date.now() / 1000 - d.started)));
        msg('空き待ち…（' + (d.gpus || []).map(gpuLabel).join(' / ') + '、' + (d.tries || 0) + '回目、残り約' + Math.floor(left / 60) + '分' + (left % 60) + '秒）。この画面は閉じても大丈夫です。');
        wtimer = setTimeout(watchPoll, 10000);
      })
      .catch(function (e) {
        if (Date.now() - w.at > 8 * 60000) { save(WATCH_KEY, null); setBtn(); msg('見張りの結果がわかりませんでした。下の一覧を確認してください。'); refreshList(); return; }
        wtimer = setTimeout(watchPoll, 10000);
      });
  }
  function start() {
    var w = load(WATCH_KEY, null);
    if (w) {
      fetch(RELAY + '/watch-stop', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ watch: w.id }) }).catch(function () {});
      msg('見張りを止めています…');
      if (!wtimer) watchPoll();
      return;
    }
    if (load(PENDING_KEY, null)) { msg('いま起動中の Pod があります。終わるまで待ってください。'); return; }
    var choice = sel.value;
    save(GPU_KEY, choice);
    var order = choice === 'both' ? ['NVIDIA RTX A6000', 'NVIDIA L40S'] : [choice];
    btn.disabled = true;
    msg('見張りを始めています…');
    var topic = '';
    try { topic = localStorage.getItem(NTFY_KEY) || ''; } catch (e) {}
    relay('/watch', { gpus: order, image: IMAGE, ntfy: topic })
      .then(function (d) {
        save(WATCH_KEY, { id: d.watch, at: Date.now() });
        setBtn();
        msg('見張りを始めました。この画面は閉じても大丈夫です。');
        if (!wtimer) wtimer = setTimeout(watchPoll, 3000);
      })
      .catch(function (e) { msg('始められませんでした: ' + (e.message || e)); })
      .then(function () { btn.disabled = false; });
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
      '<div class="small">GPU を選んで「起動」を押すと、Pod を作って、準備ができたら自動で登録・切り替えします。空きがないときは、5分間見張って空いたら確保します（画面を閉じても見張ります）。使い終わったら下の一覧で「削除」を押してください（削除するまでお金がかかります）。</div>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><select id="nxRpGpu" style="flex:1"></select><button id="nxRpStart">起動</button></div>' +
      '<div style="display:flex;gap:8px;margin-top:8px;align-items:center"><span class="small" style="white-space:nowrap">通知（ntfy）</span><input id="nxRpNtfy" type="password" autocomplete="off" placeholder="トピック名（空欄なら通知なし）" style="flex:1;min-width:0"></div>' +
      '<div class="small" id="nxRpMsg" style="margin-top:8px"></div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px"><b style="font-size:14px">動いている Pod</b><button class="secondary" id="nxRpReload">更新</button></div>' +
      '<div id="nxRpList" style="margin-top:4px"></div>';
    var first = page.querySelector('.card');
    if (first && first.nextSibling) page.insertBefore(card, first.nextSibling); else page.appendChild(card);
    sel = q('#nxRpGpu'); btn = q('#nxRpStart'); msgEl = q('#nxRpMsg'); listEl = q('#nxRpList');
    GPUS.forEach(function (g) { var o = document.createElement('option'); o.value = g[0]; o.textContent = g[1]; sel.appendChild(o); });
    var last = load(GPU_KEY, null); if (last) sel.value = last;
    btn.onclick = start;
    var nt = q('#nxRpNtfy');
    try { nt.value = localStorage.getItem(NTFY_KEY) || ''; } catch (e) {}
    nt.onchange = function () { try { localStorage.setItem(NTFY_KEY, nt.value.trim()); } catch (e) {} };
    setBtn();
    if (load(WATCH_KEY, null) && !wtimer) watchPoll();
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
