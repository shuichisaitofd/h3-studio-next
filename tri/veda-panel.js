/* H3 Veda test panel (I2V only). Adds a Veda on/off switch and a sparsity setting to the H3 Mobile page.
   It rewrites the I2V workflow in the browser right after it is fetched; no server file is changed. */
(function () {
  'use strict';
  var KEY = 'h3veda_state_v1';
  var NODE_ID = '105:200';
  var GUIDER_ID = '105:16';
  var st = { on: false, pct: 90, ref: null, steps: '', layers: '' }; // ref: null = same as pct; steps/layers: full-attention steps / DiT blocks (text)
  var opts = null;      // allowed sparsity values from ComfyUI (array of strings like "90%"), or null for free numbers
  var refOpts = null;   // allowed reference_sparsity values from ComfyUI, or null
  var predictor = null; // predictor file name from ComfyUI
  var nodeState = 'checking'; // checking | ok | missing
  var setup = null;     // background Veda setup progress from /h3-mobile/api/veda/status (null = not available on this Pod)
  var setupTimer = null, setupTries = 0;

  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) { st.on = !!saved.on; st.pct = Number(saved.pct) || 90; st.ref = (saved.ref === null || saved.ref === undefined || isNaN(Number(saved.ref))) ? null : Number(saved.ref); st.steps = String(saved.steps || ''); st.layers = String(saved.layers || ''); } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function api(path) { return typeof window.apiUrl === 'function' ? window.apiUrl(path) : path; }
  function cleanList(v) { var t = String(v == null ? '' : v).trim(); return /^[0-9,\-\s]*$/.test(t) ? t : null; }
  function refValue(s) { return (s.ref === null || s.ref === undefined) ? s.pct : s.ref; }
  function label() {
    if (nodeState !== 'ok' && setup && setup.state === 'working') return 'Veda 準備中' + (setup.pct != null ? ' ' + setup.pct + '%' : '');
    if (nodeState !== 'ok' && setup && setup.state === 'failed') return 'Veda 準備失敗';
    if (!st.on) return 'Veda OFF';
    var t = 'Veda ' + st.pct + '%';
    if (refValue(st) !== st.pct) t += ' 参' + refValue(st);
    if (cleanList(st.steps)) t += ' S' + cleanList(st.steps).replace(/\s+/g, '');
    if (cleanList(st.layers)) t += ' L';
    return t;
  }

  // Rewrites an I2V API workflow so that it has Veda at st.pct, or none. Same shape as i2v.json.vedaNN.
  window.h3VedaApply = function (wf, state) {
    var s = state || st;
    var guider = wf && wf[GUIDER_ID];
    if (!guider || !guider.inputs) return wf;
    var src = guider.inputs.model;
    Object.keys(wf).forEach(function (id) {
      var n = wf[id];
      if (n && n.class_type === 'VedaSparseAttention') {
        if (guider.inputs.model && guider.inputs.model[0] === id) src = n.inputs.model;
        delete wf[id];
      }
    });
    guider.inputs.model = src;
    if (!s.on) return wf;
    wf[NODE_ID] = {
      inputs: { model: src, predictor: s.predictor || predictor || 'minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors',
        generated_sparsity: s.pct + '%', reference_sparsity: refValue(s) + '%', full_attention_layers: cleanList(s.layers) || '', full_attention_steps: cleanList(s.steps) || '', verbose: false },
      class_type: 'VedaSparseAttention', _meta: { title: 'Veda Sparse Attention (MiniMax H3)' }
    };
    guider.inputs.model = [NODE_ID, 0];
    return wf;
  };

  var baseFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/h3-mobile\/api\/workflow\/i2v(?:[?#]|$)/.test(url)) {
      var res = await baseFetch(input, init);
      if (!res.ok) return res;
      try {
        var wf = window.h3VedaApply(await res.clone().json());
        return new Response(JSON.stringify(wf), { status: res.status, statusText: res.statusText, headers: res.headers });
      } catch (e) { return res; }
    }
    if (isHistoryList(url)) {
      var hres = await baseFetch(input, init);
      if (hres.ok) {
        try {
          var hd = await hres.clone().json();
          lastHistory = Object.entries(hd || {}).reverse().slice(0, 50);
          scheduleAnnotate();
        } catch (e) {}
      }
      return hres;
    }
    return baseFetch(input, init);
  };

  // ---- History: show which Veda value each clip was generated with (read from the workflow that actually ran) ----
  var lastHistory = null; // [[prompt_id, item], ...] in the same order as the history cards
  var annotateTimer = null;
  function isHistoryList(url) {
    try { return new URL(url, location.href).pathname === '/history'; } catch (e) { return false; }
  }
  function pctText(v) {
    var t = String(v == null ? '' : v).trim();
    return /^\d+(\.\d+)?$/.test(t) ? t + '%' : t;
  }
  function vedaInfo(item) {
    var wf = item && item.prompt && item.prompt[2];
    if (!wf || typeof wf !== 'object') return null;
    var veda = null, i2v = false;
    Object.keys(wf).forEach(function (k) {
      var n = wf[k];
      if (!n || !n.class_type) return;
      if (n.class_type === 'VedaSparseAttention') veda = n.inputs || {};
      if (n.class_type === 'MiniMaxH3ImageToVideo') i2v = true;
    });
    if (veda) {
      var g = pctText(veda.generated_sparsity), r = pctText(veda.reference_sparsity);
      var fs = String(veda.full_attention_steps == null ? '' : veda.full_attention_steps).trim();
      var fl = String(veda.full_attention_layers == null ? '' : veda.full_attention_layers).trim();
      var sh = g === r ? 'Veda ' + g : 'Veda 生成' + g + ' / 参照' + r;
      var lg = 'Veda: ON(生成部分 ' + g + '、参照部分 ' + r;
      if (fs) { sh += ' / 全注意ステップ ' + fs; lg += '、最初から全部計算するステップ ' + fs; }
      if (fl) { sh += ' / 全注意層 ' + fl; lg += '、全部計算する層 ' + fl; }
      return { on: true, short: sh, long: lg + ')' };
    }
    return i2v ? { on: false, short: 'Veda OFF', long: 'Veda: OFF(使っていない)' } : null;
  }
  function annotate() {
    var root = document.getElementById('historyList');
    if (!root || !lastHistory) return;
    var cards = root.querySelectorAll('.history-card');
    if (!cards.length || cards.length !== lastHistory.length) return;
    Array.prototype.forEach.call(cards, function (card, i) {
      if (card.getAttribute('data-vedamark')) return;
      var ent = lastHistory[i], item = ent[1] || {};
      var p3 = item && item.prompt && item.prompt[3];
      var extra = (p3 && (p3.h3_mobile || (p3.extra_data && p3.extra_data.h3_mobile))) || (item.prompt && item.prompt.extra_data && item.prompt.extra_data.h3_mobile) || (item.extra_data && item.extra_data.h3_mobile) || {};
      var b = card.querySelector('.history-content b');
      if (!b || b.textContent !== String(extra.title || ent[0])) return; // not the same card: do nothing
      card.setAttribute('data-vedamark', '1');
      var info = vedaInfo(item);
      if (!info) return;
      var meta = card.querySelector('.meta');
      if (meta) {
        var chip = document.createElement('span');
        chip.textContent = info.short;
        chip.style.cssText = info.on ? 'color:#fff;background:#0a7d3b;border-radius:10px;padding:2px 8px;font-weight:600' : 'color:#bbb;border:1px solid #666;border-radius:10px;padding:1px 7px';
        meta.appendChild(chip);
      }
      var det = card.querySelector('details > div');
      if (det) { det.appendChild(document.createElement('br')); det.appendChild(document.createTextNode(info.long)); }
    });
  }
  function scheduleAnnotate() { clearTimeout(annotateTimer); annotateTimer = setTimeout(annotate, 0); }

  function loadNodeInfo() {
    baseFetch(api('/object_info/VedaSparseAttention')).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      var req = j && j.VedaSparseAttention && j.VedaSparseAttention.input && j.VedaSparseAttention.input.required;
      if (!req) { nodeState = 'missing'; render(true); return; }
      nodeState = 'ok';
      var p = req.predictor && req.predictor[0];
      if (Array.isArray(p) && p.length) predictor = p.indexOf('minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors') >= 0 ? 'minimax_h3_t2va_veda_8nfe_600step_preview_fp8.safetensors' : p[0];
      if (Array.isArray(p) && !p.length) nodeState = 'nopredictor';
      var g = req.generated_sparsity && req.generated_sparsity[0];
      if (Array.isArray(g) && g.length) { opts = g.slice(); }
      var rg = req.reference_sparsity && req.reference_sparsity[0];
      if (Array.isArray(rg) && rg.length) { refOpts = rg.slice(); }
      render(true);
    }).catch(function () { nodeState = 'missing'; render(true); });
  }

  function loadSetup() {
    clearTimeout(setupTimer);
    baseFetch(api('/h3-mobile/api/veda/status')).then(function (r) {
      if (r.status === 404) return 'none';
      return r.ok ? r.json() : null;
    }).then(function (j) {
      if (j === 'none') { setup = null; render(true); return; }
      if (j) setup = j;
      render(true);
      if (j && j.state === 'ok' && nodeState !== 'ok') { loadNodeInfo(); return; }
      if (!j || j.state === 'working' || j.state === 'unknown') { if (setupTries++ < 1200) setupTimer = setTimeout(loadSetup, 3000); }
    }).catch(function () { if (setupTries++ < 1200) setupTimer = setTimeout(loadSetup, 5000); });
  }
  function mb(n) { return Math.round((n || 0) / 1048576); }
  function mmss(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function setupBox() {
    if (nodeState === 'ok' || !setup) return '';
    if (setup.state === 'failed') return '<div class="warn">Vedaの準備に失敗しました: ' + esc(setup.step.replace(/^失敗: /, '')) + '</div>';
    var pct = setup.pct;
    var line = esc(setup.step) + (pct != null ? ' <b>' + pct + '%</b>' : '');
    if (setup.total) line += '<br>' + mb(setup.downloaded) + ' / ' + mb(setup.total) + ' MB';
    if (setup.since != null && setup.state === 'working') line += '<br><span class="note">この段階になってから ' + mmss(setup.since) + '</span>';
    return '<div class="vsetup"><div>' + line + '</div>' + (pct != null ? '<div class="vbar"><div style="width:' + pct + '%"></div></div>' : '') +
      '<div class="note">準備が終わるとこの表示が消えて、ONで使えるようになります(途中でComfyUIが一度再起動します)。</div></div>';
  }

  var pill, panel;
  function css() {
    var s = document.createElement('style');
    s.textContent = '#vedaPill{position:fixed;right:10px;bottom:76px;z-index:99999;padding:10px 14px;border-radius:22px;border:0;font:600 14px/1 system-ui,sans-serif;color:#fff;background:#555;box-shadow:0 2px 8px rgba(0,0,0,.4)}' +
      '#vedaPill.on{background:#0a7d3b}' +
      '#vedaPanel{position:fixed;right:10px;bottom:128px;z-index:99999;width:min(320px,calc(100vw - 20px));padding:14px;border-radius:14px;background:#1c1c1e;color:#fff;font:14px/1.5 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.6);display:none;max-height:calc(100vh - 150px);overflow-y:auto}' +
      '#vedaPanel input[type=text]{flex:1;min-width:0;padding:9px 10px;border-radius:10px;border:1px solid #666;background:#2c2c2e;color:#fff;font-size:15px}#vedaPanel .sub{font-weight:600;margin-top:12px}' +
      '#vedaPanel h3{margin:0 0 8px;font-size:15px}#vedaPanel .row{display:flex;gap:8px;align-items:center;margin:8px 0}' +
      '#vedaPanel button{padding:10px 12px;border-radius:10px;border:1px solid #666;background:#2c2c2e;color:#fff;font-size:14px}' +
      '#vedaPanel button.sel{background:#0a7d3b;border-color:#0a7d3b}#vedaPanel input[type=range]{flex:1;height:32px}' +
      '#vedaPanel .note{font-size:12px;color:#bbb}#vedaPanel .warn{font-size:13px;color:#ffb4a8}' +
      '#vedaPanel .vsetup{border:1px solid #444;border-radius:10px;padding:10px;margin:8px 0}#vedaPanel .vbar{height:8px;border-radius:4px;background:#444;overflow:hidden;margin:8px 0 6px}#vedaPanel .vbar>div{height:100%;background:#0a7d3b;transition:width .4s}';
    document.head.appendChild(s);
  }
  function snap(v, list, lo0) {
    list = list === undefined ? opts : list;
    if (!list) return Math.min(99, Math.max(lo0 === undefined ? 1 : lo0, Math.round(v)));
    var nums = list.map(function (o) { return parseInt(o, 10); }).filter(function (n) { return !isNaN(n); });
    if (!nums.length) return Math.round(v);
    var best = nums[0];
    nums.forEach(function (n) { if (Math.abs(n - v) < Math.abs(best - v)) best = n; });
    return best;
  }
  function rangeOf(list, dlo, dhi) {
    if (list) {
      var n = list.map(function (o) { return parseInt(o, 10); }).filter(function (x) { return !isNaN(x); });
      if (n.length) return [Math.min.apply(null, n), Math.max.apply(null, n)];
    }
    return [dlo, dhi];
  }
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function refText() { return st.ref === null ? '生成と同じ(' + st.pct + '%)' : st.ref + '%'; }
  function render(fromAsync) {
    if (!pill) return;
    pill.textContent = label();
    pill.className = st.on ? 'on' : '';
    if (panel.style.display === 'none') return;
    var ae = document.activeElement;
    if (fromAsync && ae && ae.tagName === 'INPUT' && ae.type === 'text' && panel.contains(ae)) return;
    var gr = rangeOf(opts, 10, 99), rr = rangeOf(refOpts, 0, 99);
    var refPos = st.ref === null ? snap(st.pct, refOpts || null, 0) : st.ref;
    var sb = setupBox();
    var warn = sb ? sb : nodeState === 'missing' ? '<div class="warn">この Pod には Veda ノードが入っていません(起動して数分は、自動で入れている途中のことがあります)。ONにすると生成が失敗します。</div>' :
      nodeState === 'nopredictor' ? '<div class="warn">Veda の予測モデルファイルが見つかりません。</div>' :
      nodeState === 'checking' ? '<div class="note">Vedaの確認中…</div>' : '';
    panel.innerHTML = '<h3>Veda テスト(画像から動画のみ)</h3>' + warn +
      '<div class="row"><button id="vOff" class="' + (st.on ? '' : 'sel') + '">OFF</button><button id="vOn" class="' + (st.on ? 'sel' : '') + '">ON</button></div>' +
      '<div class="sub">① 生成する動画のスパース率 <b id="vVal">' + st.pct + '%</b></div>' +
      '<div class="row"><input id="vRange" type="range" min="' + gr[0] + '" max="' + gr[1] + '" step="1" value="' + st.pct + '"></div>' +
      '<div class="row">' + [35, 40, 70, 90].map(function (n) { return '<button data-p="' + n + '">' + n + '</button>'; }).join('') + '</div>' +
      '<div class="sub">② 最初の画像(参照)のスパース率 <b id="vRefVal">' + refText() + '</b></div>' +
      '<div class="row"><input id="vRefRange" type="range" min="' + rr[0] + '" max="' + rr[1] + '" step="1" value="' + refPos + '"></div>' +
      '<div class="row"><button id="vRefSame" class="' + (st.ref === null ? 'sel' : '') + '">生成と同じ</button>' + [0, 50].map(function (n) { return '<button data-r="' + n + '" class="' + (st.ref === n ? 'sel' : '') + '">' + n + '%</button>'; }).join('') + '</div>' +
      '<div class="sub">③ 最初から全部計算するステップ</div>' +
      '<div class="row"><input id="vSteps" type="text" inputmode="numeric" placeholder="例: 0(空欄=なし)" value="' + esc(st.steps) + '"><button data-s="">なし</button><button data-s="0">0</button></div>' +
      '<div class="sub">④ 全部計算する層</div>' +
      '<div class="row"><input id="vLayers" type="text" placeholder="例: 0, 1, 47-49(空欄=なし)" value="' + esc(st.layers) + '"><button data-l="">なし</button><button data-l="0, 1, 47-49">例</button></div><div id="vBad"></div>' +
      '<div class="note">次の生成から反映されます(生成中のものは変わりません)。スパース率が大きいほど計算を多く省きます(速くなる代わりに、画質や体の形が崩れることがあります)。②は、小さいほど最初の画像を丁寧に見ます。③④は「その部分だけ省かずに全部計算する」設定です。履歴の各動画に、使われた設定が出ます。</div>';
    panel.querySelector('#vOff').onclick = function () { st.on = false; save(); render(); };
    panel.querySelector('#vOn').onclick = function () { st.on = true; save(); render(); };
    panel.querySelector('#vRange').oninput = function (e) {
      st.pct = snap(Number(e.target.value)); panel.querySelector('#vVal').textContent = st.pct + '%';
      panel.querySelector('#vRefVal').textContent = refText(); save(); pill.textContent = label();
    };
    panel.querySelector('#vRefRange').oninput = function (e) {
      st.ref = snap(Number(e.target.value), refOpts || null, 0); panel.querySelector('#vRefVal').textContent = refText(); save(); pill.textContent = label();
    };
    panel.querySelector('#vRefSame').onclick = function () { st.ref = null; save(); render(); };
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-p]'), function (b) { b.onclick = function () { st.pct = snap(Number(b.getAttribute('data-p'))); st.on = true; save(); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-r]'), function (b) { b.onclick = function () { st.ref = snap(Number(b.getAttribute('data-r')), refOpts || null, 0); save(); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-s]'), function (b) { b.onclick = function () { st.steps = b.getAttribute('data-s'); save(); render(); }; });
    Array.prototype.forEach.call(panel.querySelectorAll('button[data-l]'), function (b) { b.onclick = function () { st.layers = b.getAttribute('data-l'); save(); render(); }; });
    function showBad() {
      panel.querySelector('#vBad').innerHTML = (cleanList(st.steps) === null || cleanList(st.layers) === null) ? '<div class="warn">ステップと層の欄には、数字・カンマ・ハイフンだけを入れてください(間違いのある欄は使われません)。</div>' : '';
    }
    showBad();
    panel.querySelector('#vSteps').oninput = function (e) { st.steps = e.target.value; save(); pill.textContent = label(); showBad(); };
    panel.querySelector('#vLayers').oninput = function (e) { st.layers = e.target.value; save(); pill.textContent = label(); showBad(); };
  }
  function init() {
    css();
    pill = document.createElement('button'); pill.id = 'vedaPill'; pill.type = 'button';
    panel = document.createElement('div'); panel.id = 'vedaPanel'; panel.style.display = 'none';
    pill.onclick = function () { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; render(); };
    document.body.appendChild(panel); document.body.appendChild(pill);
    render(); loadNodeInfo(); loadSetup();
    var hl = document.getElementById('historyList');
    if (hl && window.MutationObserver) new MutationObserver(scheduleAnnotate).observe(hl, { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
