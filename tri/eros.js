/* H3 Veda test: 10Eros-Max INT8 switch. A small "10Eros" button: pick the model, download it, turn it on/off.
   When a 10Eros model is selected, the I2V workflow's model file name is swapped in the browser right after it is fetched. */
(function () {
  'use strict';
  var KEY = 'h3eros_state_v1';
  var UNET_ID = '105:6';
  var SHORT = { beta7: 'beta7', v10: 'v1.0', b72s: 'B72', v2: '旧', triprism: 'TriPrism' };
  var st = { model: 'triprism' }; // 'beta7' | 'v2'
  var info = null; // { models: { key: {label, filename, status, downloaded, total, error} } } from the pod, or null
  var pill, panel, timer = null;
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.model && s.model !== 'off') st.model = String(s.model);
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function api(path) { return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path; }
  function models() { return (info && info.models) || {}; }
  function isInstalled(k) { var m = models()[k]; return !!(m && m.status === 'installed'); }
  function activeFile() {
    var m = models()[st.model];
    if (m && m.status === 'installed') return m.filename;
    var b = models().triprism; // chosen model is not ready: fall back to beta7 if it is ready
    return (b && b.status === 'installed') ? b.filename : null;
  }

  window.h3ErosApply = function (wf) {
    var file = activeFile();
    if (!wf || !file) return wf;
    var n = wf[UNET_ID];
    if (!n || n.class_type !== 'UNETLoader') {
      Object.keys(wf).forEach(function (k) { if (wf[k] && wf[k].class_type === 'UNETLoader') n = wf[k]; });
    }
    if (n && n.inputs) n.inputs.unet_name = file;
    return wf;
  };

  var prevFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/h3-mobile\/api\/workflow\/i2v(?:[?#]|$)/.test(url)) {
      var res = await prevFetch(input, init);
      if (!res.ok) return res;
      try {
        var wf = window.h3ErosApply(await res.clone().json());
        return new Response(JSON.stringify(wf), { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) { return res; }
    }
    return prevFetch(input, init);
  };

  function gb(n) { return (n / 1073741824).toFixed(1); }
  function label() {
    if (info && !isInstalled(st.model)) return '10Eros 未導入';
    return '10Eros ' + (SHORT[st.model] || st.model);
  }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function refresh() {
    prevFetch(api('/h3-mobile/api/eros/status')).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      info = j && j.models ? j : null;
      if (info && !info.models[st.model]) { st.model = 'triprism'; save(); }
      render();
      var busy = info && Object.keys(info.models).some(function (k) { return ['downloading', 'verifying', 'queued'].indexOf(info.models[k].status) >= 0; });
      clearTimeout(timer);
      if (busy && panel && panel.style.display !== 'none') timer = setTimeout(refresh, 3000);
    }).catch(function () { info = null; render(); });
  }

  function css() {
    var s = document.createElement('style');
    s.textContent = '#erosPill{position:fixed;right:130px;bottom:76px;z-index:99999;padding:10px 14px;border-radius:22px;border:0;font:600 14px/1 system-ui,sans-serif;color:#fff;background:#555;box-shadow:0 2px 8px rgba(0,0,0,.4)}#erosPill.on{background:#8a4fd6}' +
      '#erosPanel{position:fixed;right:10px;bottom:128px;z-index:99999;width:min(320px,calc(100vw - 20px));padding:14px;border-radius:14px;background:#1c1c1e;color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.6);display:none;max-height:calc(100vh - 150px);overflow-y:auto}' +
      '#erosPanel h3{margin:0 0 8px;font-size:15px}#erosPanel .row{display:flex;gap:8px;align-items:center;margin:8px 0}#erosPanel .box{border:1px solid #444;border-radius:10px;padding:10px;margin:8px 0}' +
      '#erosPanel button{padding:10px 12px;border-radius:10px;border:1px solid #666;background:#2c2c2e;color:#fff;font-size:14px}#erosPanel button.sel{background:#8a4fd6;border-color:#8a4fd6}#erosPanel button:disabled{opacity:.4}' +
      '#erosPanel .note{font-size:12px;color:#bbb}#erosPanel .warn{font-size:13px;color:#ffb4a8}#erosPanel .bar{height:8px;border-radius:4px;background:#444;overflow:hidden}#erosPanel .bar>div{height:100%;background:#8a4fd6}';
    document.head.appendChild(s);
  }

  function modelBox(k) {
    var m = models()[k]; if (!m) return '';
    var stat = m.status, body;
    if (stat === 'installed') body = '<div>状態: <b>導入済み</b></div>';
    else if (stat === 'downloading' || stat === 'queued' || stat === 'verifying') {
      var pct = m.total ? Math.min(100, Math.round(m.downloaded / m.total * 100)) : 0;
      body = '<div>状態: <b>' + (stat === 'verifying' ? '確認中…(数分かかります)' : 'ダウンロード中 ' + pct + '%') + '</b></div><div class="bar"><div style="width:' + (stat === 'verifying' ? 100 : pct) + '%"></div></div><div class="note">' + gb(m.downloaded) + ' / ' + gb(m.total || 0) + ' GB。この画面を開いたままで大丈夫です。</div>';
    } else {
      body = '<div>状態: <b>未導入</b>(約' + gb(m.total || 0) + 'GB)</div>' + (stat === 'error' ? '<div class="warn">失敗: ' + esc(m.error) + '</div>' : '') +
        '<div class="row"><button data-dl="' + k + '">ダウンロード</button></div>';
    }
    return '<div class="box"><b>' + esc(m.label) + '</b>' + body +
      '<div class="row"><button data-use="' + k + '" class="' + (st.model === k ? 'sel' : '') + '"' + (stat === 'installed' ? '' : ' disabled') + '>' + (st.model === k ? '使用中' : 'これを使う') + '</button></div></div>';
  }

  function render() {
    if (!pill) return;
    pill.textContent = label(); pill.className = (info && isInstalled(st.model)) ? 'on' : '';
    if (panel.style.display === 'none') return;
    var body = info ? Object.keys(info.models).map(modelBox).join('') : '<div class="warn">Pod の状態を確認できません。Pod が起動してから開いてください。</div>';
    panel.innerHTML = '<h3>10Eros-Max INT8(画像から動画のみ)</h3>' + body +
      '<div class="note">TriPrism は起動時に自動でダウンロードします。他のモデルは必要時にダウンロードしてください。「これを使う」で選んだ方で生成します(Vedaの設定もそのまま使えます)。このイメージには通常のH3の本体モデルは入れていません。</div>';
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-dl]'), function (b) {
      b.onclick = function () {
        b.disabled = true;
        prevFetch(api('/h3-mobile/api/eros/prepare'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: b.getAttribute('data-dl') }) })
          .then(function () { refresh(); }).catch(function () { refresh(); });
      };
    });
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-use]'), function (b) {
      b.onclick = function () { if (isInstalled(b.getAttribute('data-use'))) { st.model = b.getAttribute('data-use'); save(); render(); } };
    });
  }

  function init() {
    css();
    pill = document.createElement('button'); pill.id = 'erosPill'; pill.type = 'button';
    panel = document.createElement('div'); panel.id = 'erosPanel'; panel.style.display = 'none';
    pill.onclick = function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; if (panel.style.display !== 'none') refresh(); render(); };
    document.body.appendChild(panel); document.body.appendChild(pill);
    render(); refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
