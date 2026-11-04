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
  function pkey(name,id){return 'h3next.long.'+(id||pid())+'.'+name;}
  // once: the old shared values (before per-project) go to the project that is open now
  function migrate(){
    try{
      const old={clips:localStorage.getItem('h3next.longClips'),p2:localStorage.getItem('h3next.longPrompt2'),p3:localStorage.getItem('h3next.longPrompt3')};
      if(old.clips==null&&old.p2==null&&old.p3==null)return;
      for(const n of ['clips','p2','p3'])if(old[n]!=null&&localStorage.getItem(pkey(n))==null)localStorage.setItem(pkey(n),old[n]);
      localStorage.removeItem('h3next.longClips');localStorage.removeItem('h3next.longPrompt2');localStorage.removeItem('h3next.longPrompt3');
    }catch(e){}
  }
  function loadProject(){
    clips=parseInt(load(pkey('clips'))||'0',10)||0;
    for(let n=2;n<=MAXP;n++){const t=document.getElementById('longPrompt'+n);if(t)t.value=load(pkey('p'+n));}
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
      store(pkey('clips'),String(clips));
      paint();
    }));
    for(let n=2;n<=MAXP;n++){
      const t=document.getElementById('longPrompt'+n);
      t.addEventListener('input',()=>store(pkey('p'+n),t.value));
    }
    migrate();
    loadProject();
    window.addEventListener('h3:project-changed',e=>{setTimeout(loadProject,0);});
    runCard();
    setTimeout(()=>{loadProject();try{if(typeof apiUrl==='function'){lastBase=apiUrl('');poll();}}catch(e){}},1500);
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
    note.textContent=clips?`画像から動画のみ。秒数×${clips}本 ≒ ${Math.round(sec*clips)}秒の動画を自動でつなぎます（時間も約${clips}倍）。テスト用Podが必要です。`:'OFF：いつもどおり1本だけ作ります。';
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

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',card);else card();
})();
