/* H3 Studio β: long-video test (needs the h3-longtest Pod image).
   When ON, a "ComfyUIで生成" press of 画像から動画 is sent to /h3-mobile/api/long/run instead of /prompt.
   The Pod makes clip 1, then the continuation clip(s), then joins them into one MP4 (history: "N本つなぎ"). */
(function(){
  const KEY='h3next.longClips';
  let clips=0;try{clips=parseInt(localStorage.getItem(KEY)||'0',10)||0;}catch(e){}
  let armedUntil=0;

  function card(){
    const gen=document.getElementById('gen');
    const genCard=gen&&gen.closest('.card');
    if(!genCard||document.getElementById('longCard'))return;
    const c=document.createElement('div');
    c.className='card';c.id='longCard';
    c.innerHTML='<h2>長尺（テスト）</h2>'+
      '<div class="mode mode3" id="longMode">'+
      '<button type="button" data-long="0">OFF</button>'+
      '<button type="button" data-long="2">2本つなぐ</button>'+
      '<button type="button" data-long="3">3本つなぐ</button></div>'+
      '<div class="small" id="longNote" style="margin-top:10px"></div>'+
      '<div class="small" id="longStatus" style="margin-top:8px"></div>';
    genCard.parentNode.insertBefore(c,genCard);
    c.querySelectorAll('[data-long]').forEach(b=>b.addEventListener('click',()=>{
      clips=parseInt(b.dataset.long,10)||0;
      try{localStorage.setItem(KEY,String(clips));}catch(e){}
      paint();
    }));
    paint();
    setTimeout(()=>{try{if(typeof apiUrl==='function'){lastBase=apiUrl('');poll();}}catch(e){}},1500);
  }

  function paint(){
    document.querySelectorAll('#longMode [data-long]').forEach(b=>b.classList.toggle('active',(parseInt(b.dataset.long,10)||0)===clips));
    const note=document.getElementById('longNote');if(!note)return;
    const sec=parseFloat((document.getElementById('sec')||{}).value)||0;
    note.textContent=clips?`画像から動画のみ。秒数×${clips}本 ≒ ${Math.round(sec*clips)}秒の動画を自動でつなぎます（時間も約${clips}倍）。テスト用Podが必要です。`:'OFF：いつもどおり1本だけ作ります。';
  }

  document.addEventListener('input',e=>{if(e.target&&e.target.id==='sec')paint();});
  document.addEventListener('click',e=>{const t=e.target&&e.target.closest&&e.target.closest('#gen');if(t)armedUntil=Date.now()+60000;},true);

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
          const r=await origFetch(apiBase(url)+'/h3-mobile/api/long/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:g,extra_data:body.extra_data||{},clips})});
          if(r.status===404||r.status===405)throw new Error('このPodは長尺テスト用のイメージではありません（h3-longtest のPodで使ってください）。長尺をOFFにすると通常どおり作れます。');
          lastBase=apiBase(url);poll();
          return r;
        }
      }
    }catch(err){
      if(err&&/長尺/.test(err.message||''))throw err;
    }
    return origFetch(input,opts);
  };

  let lastBase='';let timer=null;
  async function poll(){
    clearTimeout(timer);
    const box=document.getElementById('longStatus');
    if(!lastBase||!box)return;
    try{
      const r=await origFetch(lastBase+'/h3-mobile/api/long/status',{cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();
      const runs=(j.runs||[]).slice(0,3);
      const m=s=>`${Math.floor(s/60)}分${String(s%60).padStart(2,'0')}秒`;
      box.innerHTML=runs.map(x=>`<div>・${x.clips}本つなぎ：<b>${x.stage}</b>（${m(x.elapsed||0)}）${x.error?'<br><span style="color:#ff6b6b">'+String(x.error).replace(/[<>&]/g,'')+'</span>':''}${x.done&&!x.error?'<br>履歴の「'+x.clips+'本つなぎ」が完成版です':''}</div>`).join('');
      if(runs.some(x=>!x.done))timer=setTimeout(poll,10000);
    }catch(e){timer=setTimeout(poll,20000);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',card);else card();
})();
