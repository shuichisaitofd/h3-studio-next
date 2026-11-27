/* TriPrism I2V only: choose the dedicated eight-step graph when TriPrism is selected. */
(function () {
  'use strict';
  function selected() {
    try { var s = JSON.parse(localStorage.getItem('h3eros_state_v1') || 'null'); return s && s.model || 'triprism'; }
    catch (e) { return 'triprism'; }
  }
  var inner = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (selected() === 'triprism' && /\/h3-mobile\/api\/workflow\/i2v(?:[?#]|$)/.test(url)) {
      var target = typeof window.apiUrl === 'function' ? window.apiUrl('/h3-mobile/api/triprism/workflow') : '/h3-mobile/api/triprism/workflow';
      var response = await inner(target, init);
      if (!response.ok) return response;
      var graph = await response.json();
      if (typeof window.h3VedaApply === 'function') graph = window.h3VedaApply(graph);
      return new Response(JSON.stringify(graph), {status: response.status, statusText: response.statusText, headers: response.headers});
    }
    return inner(input, init);
  };
  function setup() {
    var ref = document.querySelector('[data-mode="ref"]');
    var batch = document.querySelector('.nav[data-target="batch"]');
    if (ref) ref.hidden = true;
    if (batch) batch.hidden = true;
    var note = document.createElement('div');
    note.className = 'notice';
    note.textContent = 'TriPrism テストは画像から動画のみ対応。長尺・参照から動画・一括は未対応です。';
    var mode = document.querySelector('#i2v');
    if (mode && mode.parentNode) mode.parentNode.insertBefore(note, mode);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup();
  // Compare the published page with this page, including its versioned scripts.
  var own = document.documentElement.outerHTML;
  inner(location.origin + location.pathname + '?t=' + Date.now(), {cache:'no-store'}).then(function (r) { return r.text(); }).then(function (latest) {
    var scripts = function (s) { return (s.match(/<script[^>]*src="[^"]+"[^>]*>/g) || []).join('\n'); };
    if (scripts(latest) !== scripts(own)) {
      var bar = document.createElement('div'); bar.className = 'notice';
      bar.textContent = '新しい版があります。ページを再読み込みしてください。';
      document.body.prepend(bar);
    }
  }).catch(function () {});
})();
