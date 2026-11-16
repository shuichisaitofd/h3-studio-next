/* H3 Studio β: Turbo LoRA test switch (for trying models that already contain Turbo, e.g. BETA72).
   OFF sets the I2V workflow's MiniMaxH3TurboLoRA strength to 0 right after the workflow is fetched.
   Steps stay at 4. The setting is per browser. */
(function(){
  var KEY='h3nextTurboOff';
  function off(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function set(v){try{localStorage.setItem(KEY,v?'1':'0');}catch(e){}paint();}
  var inner=window.fetch.bind(window);
  window.fetch=async function(input,init){
    var url=typeof input==='string'?input:(input&&input.url)||'';
    if(off()&&/\/h3-mobile\/api\/workflow\/i2v(?:[?#]|$)/.test(url)){
      var res=await inner(input,init);
      if(!res.ok)return res;
      try{
        var wf=await res.clone().json();
        Object.keys(wf).forEach(function(k){var n=wf[k];if(n&&n.class_type==='MiniMaxH3TurboLoRA'&&n.inputs)n.inputs.strength=0;});
        return new Response(JSON.stringify(wf),{status:res.status,statusText:res.statusText,headers:res.headers});
      }catch(e){return res;}
    }
    return inner(input,init);
  };
  function paint(){
    var c=document.getElementById('turboTestCard');if(!c)return;
    c.querySelectorAll('[data-turbo]').forEach(function(b){b.classList.toggle('active',(b.dataset.turbo==='off')===off());});
    var n=c.querySelector('.small');if(n)n.textContent=off()?'OFF：Turbo LoRA を外して作ります（4ステップのまま）。Turbo 入りのモデル（BETA72 など）を試すとき用です。':'ON：いつもどおり Turbo LoRA ありで作ります。';
  }
  function card(){
    var gen=document.getElementById('gen');var genCard=gen&&gen.closest('.card');
    if(!genCard||document.getElementById('turboTestCard'))return;
    var c=document.createElement('div');c.className='card';c.id='turboTestCard';
    c.innerHTML='<h2>Turbo LoRA（テスト）</h2><div class="mode" style="grid-template-columns:1fr 1fr"><button type="button" data-turbo="on">ON</button><button type="button" data-turbo="off">OFF</button></div><div class="small" style="margin-top:10px"></div>';
    genCard.parentNode.insertBefore(c,genCard);
    c.querySelectorAll('[data-turbo]').forEach(function(b){b.addEventListener('click',function(){set(b.dataset.turbo==='off');});});
    paint();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',card);else card();
  setTimeout(card,1500);
})();
