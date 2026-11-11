/* H3 Studio β: long-video test (needs the h3-longtest Pod image).
   When ON, a "ComfyUIで生成" press of 画像から動画 is sent to /h3-mobile/api/long/run instead of /prompt.
   The Pod makes clip 1, then the continuation clip(s), then joins them into one MP4 (history: "N本つなぎ").
   Progress is shown on the 作成 page (long card) and on the 実行中 page (top card). */
(function(){
  // Settings are kept per 案件 (project): h3next.long.<projectId>.clips / .p2 / .p3
  let clips=0;
  let armedUntil=0;
  const MAXP=3; // prompt boxes for clip 2..3

  function store(k,v){try{localStorage.setItem(k,v);}catch(e){}}
  function load(k){try{return localStorage.getItem(k)||'';}catch(e){return '';}}
  function pid(){try{return (typeof getActiveProjectId==='function'&&getActiveProjectId())||'none';}catch(e){return 'none';}}
  // The long settings live inside the 案件 (project) object as p.h3long = {clips, p2, p3},
  // so they follow the 案件 and are included in 全設定バックアップ / 復元.
  function projList(){try{return typeof getProjects==='function'?getProjects():[];}catch(e){return [];}}
  function projGet(){const id=pid();const p=projList().find(x=>x.id===id);return (p&&p.h3long)||{};}
  // Second copy in IndexedDB (much larger quota than localStorage). On phones the 案件 list in
  // localStorage can hit the ~5MB limit with long prompts; then saving there fails silently and
  // the 2本目/3本目 prompts were gone after reopening the app.
  function idb(){return new Promise((res,rej)=>{const r=indexedDB.open('h3next-long',1);r.onupgradeneeded=()=>r.result.createObjectStore('p');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function idbPut(k,v){try{const db=await idb();await new Promise((res,rej)=>{const tx=db.transaction('p','readwrite');tx.objectStore('p').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}catch(e){}}
  async function idbGet(k){try{const db=await idb();return await new Promise(res=>{const r=db.transaction('p').objectStore('p').get(k);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);});}catch(e){return null;}}
  let cur={},saveFail=false;
  function projSet(patch){
    const id=pid();
    cur=Object.assign({},cur,patch,{t:Date.now()});
    idbPut(id,cur);
    try{
      if(typeof saveProjects!=='function')return;
      const list=projList(),p=list.find(x=>x.id===id);if(!p)return;
      p.h3long=Object.assign({},p.h3long||{},cur);saveProjects(list);
      if(saveFail){saveFail=false;paint();}
    }catch(e){if(!saveFail){saveFail=true;paint();}}
  }
  // once: move the older storage (shared keys, then per-project keys) into the project objects
  function migrate(){
    try{
      if(typeof saveProjects!=='function')return;
      const list=projList();let changed=false;const rm=[];
      for(const p of list){
        const k='h3next.long.'+p.id+'.';const c=localStorage.getItem(k+'clips'),a=localStorage.getItem(k+'p2'),b=localStorage.getItem(k+'p3');
        if(c!=null||a!=null||b!=null){rm.push(k+'clips',k+'p2',k+'p3');if(!p.h3long){p.h3long={clips:parseInt(c||'0',10)||0,p2:a||'',p3:b||''};changed=true;}}
      }
      const oc=localStorage.getItem('h3next.longClips'),o2=localStorage.getItem('h3next.longPrompt2'),o3=localStorage.getItem('h3next.longPrompt3');
      if(oc!=null||o2!=null||o3!=null){
        rm.push('h3next.longClips','h3next.longPrompt2','h3next.longPrompt3');
        const p=list.find(x=>x.id===pid());if(p&&!p.h3long){p.h3long={clips:parseInt(oc||'0',10)||0,p2:o2||'',p3:o3||''};changed=true;}
      }
      if(changed)saveProjects(list);
      rm.forEach(k=>localStorage.removeItem(k));
    }catch(e){}
  }
  async function loadProject(){
    const id=pid();
    let h=projGet();
    const b=await idbGet(id);
    if(id!==pid())return;
    if(b&&(b.t||0)>(h.t||0))h=b;
    cur=Object.assign({},h);
    clips=parseInt(h.clips||0,10)||0;
    for(let n=2;n<=MAXP;n++){const t=document.getElementById('longPrompt'+n);if(t)t.value=h['p'+n]||'';}
    paint();
  }

  function card(){
    const gen=document.getElementById('gen');
    const genCard=gen&&gen.closest('.card');
    if(!genCard||document.getElementById('longCard'))return;
    const c=document.createElement('div');
    c.className='card';c.id='longCard';
    let boxes='';
    for(let n=2;n<=MAXP;n++){
      const hint=n===2?'空欄なら1本目と同じ':'空欄なら2本目と同じ';
      boxes+=`<div class="longPWrap hidden" data-n="${n}" style="margin-top:12px"><label>${n}本目のプロンプト（${hint}）</label><textarea id="longPrompt${n}" placeholder="${n}本目で起きることだけを書く"></textarea></div>`;
    }
    c.innerHTML='<h2>長尺（テスト）</h2>'+
      '<div class="mode mode3" id="longMode">'+
      '<button type="button" data-long="0">OFF</button>'+
      '<button type="button" data-long="2">2本つなぐ</button>'+
      '<button type="button" data-long="3">3本つなぐ</button></div>'+boxes+
      '<div class="small" id="longNote" style="margin-top:10px"></div>'+
      '<div class="small longStatus" style="margin-top:8px"></div>';
    genCard.parentNode.insertBefore(c,genCard);
    c.querySelectorAll('[data-long]').forEach(b=>b.addEventListener('click',()=>{
      clips=parseInt(b.dataset.long,10)||0;
      projSet({clips});
      paint();
    }));
    for(let n=2;n<=MAXP;n++){
      const t=document.getElementById('longPrompt'+n);
      ['input','change','blur'].forEach(ev=>t.addEventListener(ev,()=>{if((cur['p'+n]||'')!==t.value)projSet({['p'+n]:t.value});}));
    }
    migrate();
    loadProject();
    window.addEventListener('h3:project-changed',e=>{setTimeout(loadProject,0);});
    runCard();
    setTimeout(()=>{migrate();loadProject();try{if(typeof apiUrl==='function'){lastBase=apiUrl('');poll();}}catch(e){}},1500);
  }

  function runCard(){
    const sec=document.querySelector('section[data-page="running"]');
    if(!sec||document.getElementById('longRunCard'))return;
    const c=document.createElement('div');
    c.className='card hidden';c.id='longRunCard';
    c.innerHTML='<h2>長尺（テスト）の進み具合</h2><div class="small longStatus"></div>';
    sec.insertBefore(c,sec.firstChild);
  }

  function paint(){
    document.querySelectorAll('#longMode [data-long]').forEach(b=>b.classList.toggle('active',(parseInt(b.dataset.long,10)||0)===clips));
    document.querySelectorAll('#longCard .longPWrap').forEach(w=>w.classList.toggle('hidden',clips<(parseInt(w.dataset.n,10)||99)));
    const note=document.getElementById('longNote');if(!note)return;
    const sec=parseFloat((document.getElementById('sec')||{}).value)||0;
    note.textContent=(saveFail?'⚠ この端末の保存容量がいっぱいで案件には保存できませんでした（端末内の予備には保存しています）。':'')+(clips?`画像から動画のみ。秒数×${clips}本 ≒ ${Math.round(sec*clips)}秒の動画を自動でつなぎます（時間も約${clips}倍）。テスト用Podが必要です。`:'OFF：いつもどおり1本だけ作ります。');
  }

  document.addEventListener('input',e=>{if(e.target&&e.target.id==='sec')paint();});
  document.addEventListener('click',e=>{
    const t=e.target&&e.target.closest&&e.target.closest('#gen');
    if(t)armedUntil=Date.now()+60000;
    else if(lastBase)setTimeout(poll,300); // e.g. switching to 実行中
  },true);

  function apiBase(url){const i=url.indexOf('/prompt');return url.slice(0,i);}
  const origFetch=window.fetch.bind(window);
  window.fetch=async function(input,opts){
    try{
      const url=typeof input==='string'?input:(input&&input.url)||'';
      const method=((opts&&opts.method)||'GET').toUpperCase();
      if(clips>=2&&method==='POST'&&/\/prompt$/.test(url.split('?')[0])&&Date.now()<armedUntil&&opts&&typeof opts.body==='string'){
        const body=JSON.parse(opts.body);
        const g=body&&body.prompt;
        if(g&&g['105:104']&&g['105:104'].class_type==='MiniMaxH3ImageToVideo'){
          armedUntil=0;
          const prompts=[];
          for(let n=2;n<=clips;n++)prompts.push(((document.getElementById('longPrompt'+n)||{}).value||'').trim());
          const r=await origFetch(apiBase(url)+'/h3-mobile/api/long/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:g,extra_data:body.extra_data||{},clips,prompts,prompt2:prompts[0]||''})});
          if(r.status===404||r.status===405)throw new Error('このPodは長尺テスト用のイメージではありません（h3-longtest のPodで使ってください）。長尺をOFFにすると通常どおり作れます。');
          lastBase=apiBase(url);setTimeout(poll,500);
          return r;
        }
      }
    }catch(err){
      if(err&&/長尺/.test(err.message||''))throw err;
    }
    return origFetch(input,opts);
  };

  let lastBase='';let timer=null;let busy=false;
  const esc=s=>String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  const m=s=>`${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`;
  async function poll(){
    if(busy||!lastBase)return;
    busy=true;clearTimeout(timer);
    try{
      const r=await origFetch(lastBase+'/h3-mobile/api/long/status',{cache:'no-store'});
      longApi=r.ok?true:(r.status===404?false:longApi);
      if(r.ok){
        const j=await r.json();
        const runs=(j.runs||[]).slice(0,3);
        const html=runs.map(x=>{
          const tag=x.custom_prompts?`・別プロンプト${x.custom_prompts}本`:(x.prompt2?'・2本目以降は別プロンプト':'');
          const done=x.done&&!x.error?'<br>履歴の「'+x.clips+'本つなぎ」が完成版です':'';
          const err=x.error?'<br><span style="color:#ff6b6b">'+esc(x.error)+'</span>':'';
          return `<div style="margin-top:4px">・${x.clips}本つなぎ：<b>${esc(x.stage)}</b>（${m(x.elapsed||0)}）${tag}${err}${done}</div>`;
        }).join('');
        document.querySelectorAll('.longStatus').forEach(b=>b.innerHTML=html);
        const rc=document.getElementById('longRunCard');
        if(rc)rc.classList.toggle('hidden',!runs.length);
        timer=setTimeout(poll,runs.some(x=>!x.done)?8000:30000);
      }
    }catch(e){timer=setTimeout(poll,20000);}
    busy=false;
  }


  // ---- パーツ (long-video parts): hidden from 履歴, shown in their own view; split downloads ----
  let longApi=null; // true when this Pod has the long-video API
  const PART_RE=/filename=[^&]*_part\d+_\d+_\.mp4(&|$)/;
  function base(){try{return typeof apiUrl==='function'?apiUrl(''):lastBase;}catch(e){return lastBase;}}
  function viewUrl(f){return base()+`/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder||'')}&type=${encodeURIComponent(f.type||'output')}`;}
  const PARTS_DIR_RE=/subfolder=video%2Fh3long%2Fparts(&|$)/;
  function srcFile(src){try{return new URL(src,location.href).searchParams.get('filename')||'';}catch(e){return '';}}
  let partsCache=null,partsAt=0;
  async function partsData(){
    if(partsCache&&Date.now()-partsAt<15000)return partsCache;
    const r=await origFetch(base()+'/h3-mobile/api/long/parts',{cache:'no-store'});
    if(!r.ok)return null;partsCache=(await r.json()).runs||[];partsAt=Date.now();return partsCache;
  }
  function fmtSec(s){s=Math.max(0,Math.round(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+'時間':'')+(h||m?m+'分':'')+x+'秒';}
  async function markJoined(cards){
    if(longApi!==true||!cards.length)return;
    let runs;try{runs=await partsData();}catch(e){return;}if(!runs)return;
    const byFile={};runs.forEach(r=>{if(r.joined&&r.elapsed)byFile[r.joined.filename]=r;});
    cards.forEach(c=>{
      const m=c.querySelector('.history-media');const run=byFile[srcFile(m&&m.getAttribute('src')||'')];if(!run)return;
      const txt='生成 '+fmtSec(run.elapsed)+'（'+run.clips+'本の合計）';
      let sp=c.querySelector('.duration-good');
      if(!sp){const meta=c.querySelector('.meta');if(!meta)return;sp=document.createElement('span');sp.className='duration-good';meta.appendChild(sp);}
      if(sp.textContent!==txt)sp.textContent=txt;
    });
  }
  function hideParts(){
    const root=document.getElementById('historyList');if(!root)return;
    const cards=[...root.querySelectorAll('.history-card')];
    cards.forEach(c=>{
      const m=c.querySelector('.history-media');const src=(m&&(m.getAttribute('src')||''))||'';
      if(PART_RE.test(src)||PARTS_DIR_RE.test(src))c.classList.add('hidden');
    });
    markJoined(cards.filter(c=>!c.classList.contains('hidden')));
  }
  function partsUi(){
    const tools=document.querySelector('section[data-page="history"] .history-tools');
    const list=document.getElementById('historyList');
    if(!tools||!list||document.getElementById('longPartsBtn'))return;
    const b=document.createElement('button');b.className='secondary';b.id='longPartsBtn';b.type='button';b.textContent='パーツ';
    tools.insertBefore(b,tools.firstChild);
    const v=document.createElement('div');v.id='longPartsView';v.className='hidden';
    v.innerHTML='<div class="row" style="flex-wrap:wrap;gap:8px;margin:12px 0 4px;align-items:center"><div class="small" style="flex:1;min-width:160px">長尺のパーツ（1本目・2本目…）。つないだ完成版は「履歴」にあります。</div><button class="secondary" type="button" id="longPartsDl">パーツを一括ダウンロード</button></div><div id="longPartsMsg" class="small"></div><div id="longPartsList"></div>';
    list.parentNode.insertBefore(v,list.nextSibling);
    b.addEventListener('click',()=>showParts(v.classList.contains('hidden')));
    v.querySelector('#longPartsDl').addEventListener('click',()=>{
      if(longApi!==true){v.querySelector('#longPartsMsg').textContent='このPodは長尺テスト用ではありません。';return;}
      v.querySelector('#longPartsMsg').textContent='ダウンロードを開始しました。準備に少し時間がかかります。Safariのアドレスバーのダウンロード表示（↓）で確認できます。';
      location.href=base()+'/h3-mobile/api/long/download?kind=parts';
    });
    new MutationObserver(hideParts).observe(list,{childList:true,subtree:true});
    hideParts();
  }
  function showParts(on){
    const v=document.getElementById('longPartsView'),list=document.getElementById('historyList'),b=document.getElementById('longPartsBtn');
    if(!v||!list)return;
    v.classList.toggle('hidden',!on);list.classList.toggle('hidden',!!on);
    if(b){b.textContent=on?'履歴に戻る':'パーツ';b.classList.toggle('active',!!on);}
    if(on)loadParts();
  }
  async function loadParts(){
    const root=document.getElementById('longPartsList');if(!root)return;
    root.innerHTML='<div class="small" style="margin-top:12px">読込中...</div>';
    try{
      const r=await origFetch(base()+'/h3-mobile/api/long/parts',{cache:'no-store'});
      if(r.status===404){root.innerHTML='<div class="small" style="margin-top:12px">このPodは長尺テスト用ではありません。</div>';return;}
      if(!r.ok)throw new Error(r.status+' '+r.statusText);
      const runs=(await r.json()).runs||[];
      if(!runs.length){root.innerHTML='<div class="small" style="margin-top:12px">パーツはまだありません。</div>';return;}
      root.innerHTML='';
      for(const run of runs){
        const box=document.createElement('div');box.className='long-parts-run';box.style.marginTop='16px';
        const when=new Date((run.mtime||0)*1000);const ts=isNaN(when)?'':`${when.getMonth()+1}/${when.getDate()} ${String(when.getHours()).padStart(2,'0')}:${String(when.getMinutes()).padStart(2,'0')}`;
        box.innerHTML=`<div><b>${esc(run.title||run.id)}</b> <span class="badge">${run.clips}本つなぎ</span>${run.seconds?`<span class="badge">各${esc(run.seconds)}秒</span>`:''}</div><div class="meta small"><span>${ts}</span><span>${esc(run.stage||(run.joined?'完成':'つなぐ前'))}</span></div>`;
        for(const f of run.parts){
          const url=viewUrl(f);
          const c=document.createElement('div');c.className='history-card';c.style.marginTop='8px';
          c.innerHTML=`<div class="thumbrow"><video class="thumb history-media" muted playsinline preload="metadata" src="${url}"></video><div class="history-content"><div><b>${f.n}本目</b></div><div class="meta small"><span>${(f.size/1048576).toFixed(1)} MB</span></div><div class="history-actions"><button class="secondary open-popup" type="button">開く</button><a class="secondary linkbtn" href="${url}" download>ダウンロード</a></div></div></div>`;
          const open=()=>{try{openMedia(url,true);}catch(e){window.open(url,'_blank');}};
          c.querySelector('.history-media').onclick=open;c.querySelector('.open-popup').onclick=open;
          box.appendChild(c);
        }
        root.appendChild(box);
      }
    }catch(e){root.innerHTML=`<div class="notice danger" style="margin-top:12px">パーツの取得に失敗: ${esc(e.message)}</div>`;}
  }
  // 履歴の「一括ダウンロード」: on the long-video Pod, download everything except the parts
  document.addEventListener('click',e=>{
    const t=e.target&&e.target.closest&&e.target.closest('#downloadAll');
    if(t&&longApi===true){
      e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
      const msg=document.getElementById('downloadMessage');
      if(msg)msg.textContent='ダウンロードを開始しました（長尺のパーツは含みません。パーツは「パーツ」から）。準備に少し時間がかかります。Safariのアドレスバーのダウンロード表示（↓）で確認できます。';
      location.href=base()+'/h3-mobile/api/long/download?kind=main';
      return;
    }
    const nav=e.target&&e.target.closest&&e.target.closest('.nav[data-target="history"],#refreshHistory');
    if(nav)showParts(false);
  },true);

  function init(){card();partsUi();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
