/* Shared by the Chinese page (index.html) and the English one (en/index.html): the two tabs, the in-page links, the copy buttons, and the hint to the other language. */
(function(){
  var zh=(document.documentElement.lang||'').toLowerCase().indexOf('zh')===0;
  var tabs=[].slice.call(document.querySelectorAll('[data-tab]')), panels={usage:document.getElementById('usage'),deploy:document.getElementById('deploy')};
  var note=document.getElementById('tabnote');                        // the line beside the tabs: its text for each tab is in data-usage / data-deploy
  function show(name, anchor, keepHash){
    if(!panels[name]) name='usage';
    tabs.forEach(function(b){ b.setAttribute('aria-selected', String(b.dataset.tab===name)); });
    for(var k in panels) panels[k].hidden = (k!==name);
    if(note) note.textContent=note.dataset[name]||'';
    if(!keepHash){ try{ history.replaceState(null,'', '#'+(anchor||name)); }catch(e){} }
    if(anchor){ var el=document.getElementById(anchor); if(el) el.scrollIntoView(); } else if(!keepHash){ window.scrollTo(0,0); }
  }
  function fromHash(){
    var h=(location.hash||'').slice(1);
    if(!h) return show('usage',null,true);
    var el=document.getElementById(h);
    if(h==='usage'||h==='deploy') return show(h,null,true);
    if(el){ var p=el.closest('section.panel'); if(p) return show(p.id,h,true); }
    show('usage',null,true);
  }
  tabs.forEach(function(b){ b.addEventListener('click',function(){ show(b.dataset.tab); }); });
  document.addEventListener('click',function(e){
    var o=e.target.closest('[data-open]'); if(o){ e.preventDefault(); show(o.dataset.open); return; }
    var a=e.target.closest('a[href^="#"]'); if(!a) return;
    var id=a.getAttribute('href').slice(1), el=document.getElementById(id); if(!el) return;
    var p=el.closest('section.panel'); if(p && p.hidden){ e.preventDefault(); show(p.id,id); }
  });
  window.addEventListener('hashchange',fromHash);
  fromHash();
  var label=zh?['复制','已复制']:['Copy','Copied'];
  document.querySelectorAll('pre').forEach(function(pre){
    var b=document.createElement('button'); b.type='button'; b.className='copy'; b.textContent=label[0];
    b.addEventListener('click',function(){
      var t=pre.querySelector('code')?pre.querySelector('code').innerText:pre.innerText;
      var done=function(){ b.textContent=label[1]; setTimeout(function(){ b.textContent=label[0]; },1500); };
      if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done,function(){});
    });
    pre.appendChild(b);
  });
  /* A hint, never a redirect (a crawler must see each language page as it is): "English version" for a reader whose browser is not Chinese, "中文版" for one whose is. */
  var bar=document.getElementById('langbar');
  if(bar){
    var langs=(navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||'']), prefersZh=/^zh/i.test(langs[0]||'');
    var dismissed=false; try{ dismissed=sessionStorage.getItem('guide.langbar')==='1'; }catch(e){}
    if(!dismissed && prefersZh!==zh) bar.hidden=false;
    var x=bar.querySelector('button'); if(x) x.addEventListener('click',function(){ bar.hidden=true; try{ sessionStorage.setItem('guide.langbar','1'); }catch(e){} });
  }
})();
