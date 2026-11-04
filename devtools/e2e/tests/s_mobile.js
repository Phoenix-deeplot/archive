// e2e: sort by publication date; two columns of cards on a phone (buttons behind the three dots); swipes in the reader and on the shelf (real touch events)
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const settle = await require('../settle')(c);
  const J = expr => c.js(`(()=>{ const {state,idb,LS,loadAll,render,addCollection,openReader}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const swipe = async (x1, y1, x2, y2, steps = 8, gap = 12) => {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= steps; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }] }); await sleep(gap); }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(500);
  };
  const fresh = async (lang, w, h, phone) => {
    if (phone) await c.mobile(w, h, 2); else await c.desktop(w, h, 1);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`);
    await c.goto(BASE, 0); await settle(2500);
  };
  const seed = () => J(`(async()=>{
    const cid=addCollection('三篇'); const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'一段摘要，手机上的两列卡片里不显示。',keywords:['k1','k2'],lang:'zh',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',collection:cid,...extra});
    await idb.put(mk('local:a',{type:'md',filename:'a.md',title:'甲：发布于一月，最先加入',date:'2026-01-05',added:300,data:'# 甲\\n\\n'+'甲的正文。'.repeat(80)}));
    await idb.put(mk('local:b',{type:'md',filename:'b.md',title:'乙：发布于三月，最后加入，标题很长很长很长很长很长很长很长很长很长很长很长很长很长很长',date:'2026-03-01',added:100,data:'# 乙\\n\\n乙的正文。\\n\\n\`\`\`\\n'+'x'.repeat(420)+'\\n\`\`\`\\n\\n'+'乙的正文。'.repeat(80)}));
    await idb.put(mk('local:c',{type:'md',filename:'c.md',title:'丙：发布于上一年',date:'2025-12-01',added:200,data:'# 丙\\n\\n'+'丙的正文。'.repeat(80)}));
    await loadAll(); state.col=cid; LS.set('col',cid); render(); return cid; })()`);
  const order = () => J(`state.visible.map(id=>({'local:a':'甲','local:b':'乙','local:c':'丙'}[id]||id)).join('')`);

  // ------------------------------------------------ the sort order "publication date"
  await fresh('zh', 375, 812, true);
  await seed(); await sleep(600);
  ok('default order: recently added (甲 300, 丙 200, 乙 100)', await order() === '甲丙乙', await order());
  const opts = await J(`[...document.querySelector('#sort').options].filter(o=>!o.hidden).map(o=>o.value+':'+o.textContent+(o.disabled?'!':''))`);          // (the heat option exists but is hidden on my shelf)
  ok('the select offers publication date between recently added and recently read', opts.join(',') === 'recent:最近添加,date:发布日期,read:最近阅读,title:标题', opts);
  await J(`const s=document.querySelector('#sort'); s.value='date'; s.dispatchEvent(new Event('change',{bubbles:true}))`); await sleep(400);
  ok('publication date: 乙 (3-01), 甲 (1-05), 丙 (last year)', await order() === '乙甲丙', await order());
  await c.goto(BASE, 0); await settle(2000);
  ok('...and it is remembered after a reload', await J(`document.querySelector('#sort').value`) === 'date' && await order() === '乙甲丙', await order());
  await J(`localStorage.setItem('archive.lang', JSON.stringify('en'))`); await c.goto(BASE, 0); await settle(2000);
  ok('English label', await J(`[...document.querySelector('#sort').options].find(o=>o.value==='date').textContent`) === 'Publication date');
  await J(`localStorage.setItem('archive.lang', JSON.stringify('zh'))`); await c.goto(BASE, 0); await settle(2000);

  // ------------------------------------------------ two columns on a phone
  await J(`localStorage.setItem('archive.sort', JSON.stringify('recent'))`); await c.goto(BASE, 0); await settle(2000);
  const g = await J(`(()=>{ const grid=document.querySelector('#grid'), cs=getComputedStyle(grid), cards=[...document.querySelectorAll('.card')].map(x=>x.getBoundingClientRect()); const k=document.querySelector('.card');
    const vis=sel=>[...k.querySelectorAll(sel)].filter(b=>b.offsetParent!==null);
    return {cols:cs.gridTemplateColumns.split(' ').length, w:cards.map(r=>Math.round(r.width)), tops:cards.map(r=>Math.round(r.top)), sum:getComputedStyle(k.querySelector('.sum')||document.body).display, chips:getComputedStyle(k.querySelector('.chips')||document.body).display,
      acts:vis('.acts .ibtn').map(b=>b.dataset.act), pageX:document.documentElement.scrollWidth>innerWidth+1, titleLines:Math.round(k.querySelector('.card-title').getBoundingClientRect().height/parseFloat(getComputedStyle(k.querySelector('.card-title')).lineHeight)), fontPx:getComputedStyle(k.querySelector('.card-title')).fontSize}; })()`);
  ok('phone card view: two equal columns, the page does not scroll sideways', g.cols === 2 && g.w[0] === g.w[1] && g.w[0] > 150 && !g.pageX && g.tops[0] === g.tops[1], g);
  ok('a compact card: no summary, no keyword chips; only the star and the three dots are shown; the title has at most three lines', g.sum === 'none' && g.chips === 'none' && g.acts.join() === 'star,more' && g.titleLines <= 3, g);
  await c.shot(require('../paths').SHOTS + '/m_cards.png');
  await J(`document.querySelector('.card [data-act="more"]').click()`); await sleep(300);
  const more = await J(`(()=>{ const k=document.querySelector('.card.acts-open'); if(!k) return null; const kb=k.getBoundingClientRect(), bs=[...k.querySelectorAll('.acts .ibtn')].filter(b=>b.offsetParent!==null).map(b=>({a:b.dataset.act||'ext', r:b.getBoundingClientRect()}));
    return {acts:bs.map(b=>b.a), inside:bs.every(b=>b.r.left>=kb.left-0.5 && b.r.right<=kb.right+0.5 && b.r.bottom<=kb.bottom+0.5 && b.r.top>=kb.top), expanded:k.querySelector('[data-act="more"]').getAttribute('aria-expanded'), h:Math.round(kb.height), only:document.querySelectorAll('.card.acts-open').length}; })()`);
  ok('the three dots show every button of the card inside it (star, pin, hide, move, shuffle, delete ...)', more && more.acts.length >= 6 && more.inside && more.expanded === 'true' && more.only === 1, more);
  await c.shot(require('../paths').SHOTS + '/m_cards_more.png');
  await J(`document.querySelectorAll('.card')[1].querySelector('[data-act="more"]').click()`); await sleep(200);
  ok('opening another card closes the first one', await J(`[...document.querySelectorAll('.card')].map(k=>k.classList.contains('acts-open'))`).then(a => a.join() === 'false,true,false'));
  await J(`document.querySelector('.top .search input').click()`); await sleep(200);
  ok('a tap anywhere else closes it', await J(`document.querySelectorAll('.card.acts-open').length`) === 0);
  await J(`document.querySelector('.card [data-act="more"]').click()`); await sleep(200);
  await J(`document.querySelector('.card.acts-open [data-act="star"]').click()`); await sleep(400);
  ok('a button inside works (the star), and the overlay is gone after the redraw', await J(`state.items.find(x=>x.id===document.querySelector('.card').dataset.id) && document.querySelectorAll('.card.acts-open').length`) === 0 && await J(`document.querySelector('.card [data-act="star"]').getAttribute('aria-pressed')`) === 'true');
  // the list view is one column with all its buttons
  await J(`document.querySelector('#viewBtn').click()`); await sleep(400);
  const lv = await J(`(()=>{ const grid=document.querySelector('#grid'), k=document.querySelector('.card'); return {cols:getComputedStyle(grid).gridTemplateColumns.split(' ').length, more:getComputedStyle(k.querySelector('[data-act="more"]')).display, vis:[...k.querySelectorAll('.acts .ibtn')].filter(b=>b.offsetParent!==null).length}; })()`);
  ok('list view on a phone stays one column, without the three dots', lv.cols === 1 && lv.more === 'none' && lv.vis >= 5, lv);
  await c.shot(require('../paths').SHOTS + '/m_list.png');
  await J(`document.querySelector('#viewBtn').click()`); await sleep(300);

  // ------------------------------------------------ the public directory in two columns
  await J(`(()=>{ const d=state.dirData; for(let i=0;i<4;i++) d.items.unshift({id:'zz'+i,url:'https://example.org/a'+i,title:'目录里的第'+i+'篇文章，标题有一点长，看看两列里怎么排',summary:'摘要',image:'',date:'2026-10-2'+i,lang:'zh',shelf:'',type:'article',tags:['标签'+i]}); document.querySelector('[data-space="dir"]').click(); })()`); await sleep(700);
  const dd = await J(`(()=>{ const g=document.querySelector('#grid'), cs=[...g.querySelectorAll('.xcard')], k=cs[0], bm=k.querySelector('.card-foot [data-d="save"]').getBoundingClientRect(), r=x=>x.getBoundingClientRect(); return {cols:getComputedStyle(g).gridTemplateColumns.split(' ').length, aligned:Math.abs(r(cs[0]).width-r(cs[1]).width)<1 && Math.abs(r(cs[0]).top-r(cs[1]).top)<1, heart:!!k.querySelector('.card-foot .heart'), bm:[Math.round(bm.width),Math.round(bm.height)], ext:!!k.querySelector('.ext'), inside:bm.right<=r(k).right+0.5, viewBtn:getComputedStyle(document.querySelector('#viewBtn')).display, over:document.documentElement.scrollWidth-document.documentElement.clientWidth, sort:[...document.querySelector('#sort').options].map(o=>o.value+(o.disabled?'!':'')).join(','), sortVal:document.querySelector('#sort').value}; })()`);
  ok('directory on a phone: cards two in a row, aligned; the footer of a card has the heart and a bookmark of at least 44px inside it (no open arrow: title and cover open it); no sideways scroll; the card / list button is there', dd.cols === 2 && dd.aligned && dd.bm[0] >= 44 && dd.bm[1] >= 44 && dd.heart && !dd.ext && dd.inside && dd.viewBtn !== 'none' && dd.over <= 0, dd);
  ok('directory: "publication date" is not offered (it is newest first by itself), "recently read" is; heat only with counters (not here); the order is the newest first', dd.sort === 'recent,date!,heat!,read,title' && dd.sortVal === 'recent', dd);
  await c.shot(require('../paths').SHOTS + '/m_dir.png');
  await J(`document.querySelector('[data-space="mine"]').click()`); await sleep(500);

  // ------------------------------------------------ swipes on the shelf: the left list
  ok('the left list is closed at the start', await J(`!document.body.classList.contains('drawer')`));
  await swipe(150, 520, 330, 530);
  ok('swipe right: the left list opens', await J(`document.body.classList.contains('drawer')`));
  await c.shot(require('../paths').SHOTS + '/m_drawer.png');
  await swipe(300, 120, 90, 125);
  ok('swipe left (on the list, not on an entry): it closes', await J(`!document.body.classList.contains('drawer')`));
  await swipe(150, 520, 190, 525);
  ok('a short swipe does nothing', await J(`!document.body.classList.contains('drawer')`));
  await swipe(150, 400, 190, 700, 10);
  ok('a mostly vertical move (scrolling) does nothing', await J(`!document.body.classList.contains('drawer')`));
  await swipe(150, 520, 300, 700, 10);
  ok('a diagonal move does nothing', await J(`!document.body.classList.contains('drawer')`));
  await swipe(6, 520, 200, 525);
  ok('a swipe from the very edge (the system back gesture) does nothing', await J(`!document.body.classList.contains('drawer')`));
  await J(`document.querySelector('#addBtn').click()`); await sleep(400);
  await swipe(150, 520, 330, 530);
  ok('with a dialog open nothing happens behind it', await J(`!document.body.classList.contains('drawer')`));
  await J(`document.querySelector('#addCancel').click()`); await sleep(300);
  await J(`document.body.classList.add('drawer')`); await sleep(300);
  const rowY = await J(`(()=>{ const r=document.querySelector('.dir-row'); if(!r) return 0; const b=r.getBoundingClientRect(); return Math.round(b.top+b.height/2); })()`);
  if (rowY) { await swipe(280, rowY, 80, rowY); ok('a swipe left on an entry of the list shows its action instead of closing the list', await J(`document.body.classList.contains('drawer')`)); }
  await J(`document.body.classList.remove('drawer')`);

  // ------------------------------------------------ swipes in the reader
  await J(`localStorage.removeItem('archive.swipeHint')`);
  const coarse = await J(`matchMedia('(pointer:coarse)').matches`);
  await J(`document.querySelector('.card-title a').click()`); await settle(1800);
  const first = await J(`({id:state.readingId, vis:state.visible.length, hint:LS.get('swipeHint',0), toast:document.querySelector('#toastMsg').textContent, coarse:matchMedia('(pointer:coarse)').matches})`);
  ok('reader opened on the first card (甲, newest added)', first.id === 'local:a' && first.vis === 3, first);
  ok('first time: the hint toast is shown once (touch screens only)', !coarse || (first.hint === 1 && /滑动/.test(first.toast)), first);
  const where = () => J(`state.readingId`);
  const frameRect = await J(`(()=>{ const r=document.querySelector('#frame').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const mid = frameRect.y + 300;
  await swipe(300, mid, 70, mid + 6);
  ok('swipe left: the next article (丙)', await where() === 'local:c', await where());
  ok('the toast says where we are: 2 / 3 and the title', /^2 \/ 3 · 丙/.test(await J(`document.querySelector('#toastMsg').textContent`)));
  await sleep(1200);
  await c.shot(require('../paths').SHOTS + '/m_reader_c.png');
  await swipe(70, mid, 300, mid - 6);
  ok('swipe right: the previous one (甲)', await where() === 'local:a', await where());
  await sleep(1000);
  await swipe(70, mid, 300, mid - 6);
  ok('swipe right on the first: it says so and stays', await where() === 'local:a' && /第一篇/.test(await J(`document.querySelector('#toastMsg').textContent`)));
  console.log('  dbg:', JSON.stringify(await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {sel:String(d.getSelection()).length, vv:window.visualViewport.scale, w:d.defaultView.innerWidth, panel:[document.querySelector('#rTocPanel').hidden], ready:d.readyState, url:d.location.href.slice(0,20)}; })()`)));
  await swipe(300, mid, 70, mid); console.log('  after 1st:', await where()); await sleep(900); await swipe(300, mid, 70, mid); console.log('  after 2nd:', await where()); await sleep(900);
  ok('two swipes left: the last one (乙)', await where() === 'local:b', await where());
  await swipe(300, mid, 70, mid);
  ok('swipe left on the last: it says so and stays', await where() === 'local:b' && /最后一篇/.test(await J(`document.querySelector('#toastMsg').textContent`)));
  await sleep(900);
  // 乙 has a code block wider than the screen: a swipe on it scrolls it, it must not turn the page
  const pre = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument, p=d.querySelector('pre'); if(!p) return null; p.scrollIntoView({block:'center'}); const r=p.getBoundingClientRect(), f=document.querySelector('#frame').getBoundingClientRect(); return {y:Math.round(f.y+r.y+r.height/2), wide:p.scrollWidth>p.clientWidth+2}; })()`);
  await sleep(300);
  if (pre && pre.wide) { await swipe(300, pre.y, 70, pre.y); ok('a swipe on a code block wider than the screen does not turn the page', await where() === 'local:b', await where()); }
  else ok('the test article has a code block wider than the screen', false, pre);
  await swipe(300, mid - 120, 70, mid - 120);
  await sleep(300);
  // text selected: no turning
  await J(`document.querySelector('#toastMsg').textContent=''`);
  await swipe(70, mid, 300, mid);                                                   // back to 丙 or 甲: whichever is previous
  const prevId = await where();
  await sleep(1500);
  await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; d.getSelection().selectAllChildren(d.querySelector('p')); })()`);
  await swipe(300, mid, 70, mid);
  ok('with text selected a swipe does nothing', await where() === prevId, [prevId, await where()]);
  await J(`document.querySelector('#frame').contentDocument.getSelection().removeAllRanges()`);
  // a panel is open: no turning
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);
  await swipe(300, mid + 150, 70, mid + 150);
  ok('with the contents panel open a swipe on the page does nothing', await where() === prevId, [prevId, await where()]);
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);
  await swipe(8, mid, 300, mid);
  ok('from the screen edge: nothing', await where() === prevId);
  await swipe(300, mid, 70, mid + 140, 10);
  ok('a diagonal move: nothing', await where() === prevId);
  // the buttons in the contents panel still work (for what cannot be swiped)
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);
  const hasBtns = await J(`getComputedStyle(document.querySelector('#rtNext')).display !== 'none'`);
  ok('previous / next stay available in the contents panel', hasBtns);
  await J(`document.querySelector('#readerToc').click()`);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ------------------------------------------------ a tablet and a desktop do not get the compact cards or the swipes
  for (const [name, w, h] of [['tablet', 768, 1024], ['desktop', 1280, 900]]) {
    await fresh('zh', w, h, false); await seed(); await sleep(500);
    const d = await J(`(()=>{ const k=document.querySelector('.card'); return {sum:getComputedStyle(k.querySelector('.sum')).display, more:getComputedStyle(k.querySelector('[data-act="more"]')).display, vis:[...k.querySelectorAll('.acts .ibtn')].filter(b=>b.offsetParent!==null).length, cols:getComputedStyle(document.querySelector('#grid')).gridTemplateColumns.split(' ').length}; })()`);
    ok(name + ': full cards (summary, all buttons, no three dots)', d.sum !== 'none' && d.more === 'none' && d.vis >= 6, d);
    await c.shot(require('../paths').SHOTS + '/m_' + name + '.png');
  }
  await c.desktop(1280, 900, 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
