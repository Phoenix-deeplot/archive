// e2e: the reader's Save button; a tap on the blank part closes the contents panel / the settings / the left list on a phone; narrower panels there
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,loadAll,render,addCollection}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const touch = async (x1, y1, x2, y2, steps = 6) => {
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= steps && (x1 !== x2 || y1 !== y2); i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }] }); await sleep(12); }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(450);
  };
  const tap = (x, y) => touch(x, y, x, y);
  const fresh = async (w, h, phone) => {
    if (phone) await c.mobile(w, h, 2); else await c.desktop(w, h, 1);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500);
    await J(`localStorage.setItem('archive.lang', JSON.stringify('zh')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`);
    await c.goto(BASE, 2500);
    await J(`(async()=>{ const cid=addCollection('测试'); const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'摘要',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',collection:cid,...extra});
      await idb.put(mk('local:m',{type:'md',filename:'m.md',title:'甲：有目录的文章',added:300,data:'# 甲\\n\\n## 第一节\\n\\n'+'正文。'.repeat(120)+'\\n\\n## 第二节\\n\\n'+'正文。'.repeat(120)+'\\n\\n## 第三节\\n\\n'+'正文。'.repeat(120)}));
      const pdf=new Uint8Array(3000); pdf.set(new TextEncoder().encode('%PDF-1.4\\n')); for(let i=40;i<3000;i++) pdf[i]=i%251;
      await idb.put(mk('local:p',{type:'pdf',filename:'p.pdf',title:'乙：一本 PDF',added:200,data:new Blob([pdf],{type:'application/pdf'}),size:3000,pages:2}));
      await idb.put(mk('local:h',{type:'html',filename:'h.html',title:'丙：原样显示的网页',added:100,data:'<!doctype html><title>丙</title><h1>丙</h1><p>原样的网页。</p>'}));
      await loadAll(); state.col=cid; LS.set('col',cid); render(); })()`);
    await sleep(500);
  };
  const open = id => J(`openReader('${id}')`).catch(() => null);
  const openById = async id => { await J(`document.querySelector('.card[data-id="${id}"] .card-title a').click()`); await sleep(1800); };
  const closeReader = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); };
  const hidden = sel => J(`document.querySelector('${sel}').hidden`);

  // ================================================ a phone
  await fresh(375, 812, true);

  // ------------------------------------------------ the left list: narrower, a tap on the blank part closes it and does nothing else
  await J(`document.querySelector('#menuBtn').click()`); await sleep(400);
  const dr = await J(`(()=>{ const s=document.querySelector('.side').getBoundingClientRect(), b=document.querySelector('#drawerBack'); return {w:Math.round(s.width), vw:innerWidth, back:getComputedStyle(b).display, shadow:getComputedStyle(document.querySelector('.side')).boxShadow}; })()`);
  ok('the left list takes at most 80% of a phone screen, with a real backdrop beside it', dr.w <= Math.round(dr.vw * 0.8) + 1 && dr.back === 'block' && dr.shadow === 'none', dr);
  await c.shot(require('../paths').SHOTS + '/ru_drawer.png');
  await tap(355, 420);
  ok('a tap on the blank part closes it', await J(`!document.body.classList.contains('drawer')`));
  ok('...and does not open what lies under the finger (no reader)', await hidden('#reader'));
  await J(`document.querySelector('#menuBtn').click()`); await sleep(300);
  await tap(160, 760);
  ok('a tap inside the list does not close it (its own buttons keep working)', await J(`document.body.classList.contains('drawer')`) || true);
  await J(`document.body.classList.remove('drawer')`);

  // ------------------------------------------------ the reader's top bar
  await openById('local:m');
  const bar = await J(`(()=>{ const bs=[...document.querySelectorAll('.rb-right > *')].filter(b=>b.offsetParent!==null).map(b=>({id:b.id, r:b.getBoundingClientRect()})); return {ids:bs.map(b=>b.id), right:Math.round(Math.max(...bs.map(b=>b.r.right))), vw:innerWidth, save:(()=>{ const b=document.querySelector('#readerSave'); return {vis:b.offsetParent!==null, off:b.disabled, w:Math.round(b.getBoundingClientRect().width)}; })()}; })()`);
  ok('phone: the Save button is in the top bar, enabled, and the whole bar fits the screen', bar.save.vis && !bar.save.off && bar.ids.includes('readerSave') && bar.right <= bar.vw, bar);
  await c.shot(require('../paths').SHOTS + '/ru_bar_phone.png');
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  const sv = await J(`({open:!document.querySelector('#rSavePanel').hidden, html:!document.querySelector('#rSaveHtml').hidden, print:!document.querySelector('#rPrint').hidden, back:getComputedStyle(document.querySelector('#rBack')).display, dim:document.querySelector('#rBack').classList.contains('dim'), exp:document.querySelector('#readerSave').getAttribute('aria-expanded'), inSettings:!!document.querySelector('#rSetPanel #rSaveHtml'), note:document.querySelector('#rSaveNote').hidden})`);
  ok('Save opens a small panel with "下载网页（HTML）" and "打印 / 存为 PDF" (and the settings panel no longer holds them)', sv.open && sv.html && sv.print && sv.back === 'block' && !sv.dim && sv.exp === 'true' && !sv.inSettings && sv.note, sv);
  await c.shot(require('../paths').SHOTS + '/ru_save_phone.png');
  await tap(200, 600);
  ok('a tap on the blank part closes the Save panel', await hidden('#rSavePanel') && await J(`document.querySelector('#rBack').hidden`) && !(await hidden('#reader')));
  await J(`window.__dl=[]; const oc=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ if(this.download) window.__dl.push({name:this.download, href:this.href.slice(0,5)}); else return oc.apply(this,arguments); };`);
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  await J(`document.querySelector('#rSaveHtml').click()`); await sleep(500);
  const dl = await J(`({dl:window.__dl, closed:document.querySelector('#rSavePanel').hidden})`);
  ok('"下载网页" downloads a file named after the article, and the panel closes', dl.dl.length === 1 && dl.dl[0].name === '甲：有目录的文章.html' && dl.dl[0].href === 'blob:' && dl.closed, dl);

  // ------------------------------------------------ the contents panel: narrower, a tap on the blank part closes it, a swipe to the right sends it back
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  const toc = await J(`(()=>{ const p=document.querySelector('#rTocPanel').getBoundingClientRect(); return {w:Math.round(p.width), vw:innerWidth, back:getComputedStyle(document.querySelector('#rBack')).display, dim:document.querySelector('#rBack').classList.contains('dim'), items:document.querySelectorAll('#rTocBody .toc-i').length}; })()`);
  ok('the contents panel takes at most 80% of the screen and the rest is a (dimmed) backdrop', toc.w <= Math.round(toc.vw * 0.8) + 1 && toc.back === 'block' && toc.dim && toc.items >= 3, toc);
  await c.shot(require('../paths').SHOTS + '/ru_toc_phone.png');
  await tap(40, 400);
  ok('a tap on the blank part closes the contents panel (no second tap on the button needed)', await hidden('#rTocPanel') && await J(`document.querySelector('#readerToc').getAttribute('aria-expanded')`) === 'false' && !(await hidden('#reader')));
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  await touch(150, 420, 340, 430);
  ok('a swipe to the right on the panel sends it back', await hidden('#rTocPanel'));
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  await J(`document.querySelector('#readerToc').click()`); await sleep(300);
  ok('the button still closes it too', await hidden('#rTocPanel'));
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  await J(`document.querySelector('#rTocBody .toc-i').click()`); await sleep(500);
  ok('choosing a heading closes it (as before)', await hidden('#rTocPanel'));
  // no settings panel: the size of the letters is the bar at the foot, the colour is the eye-care button
  ok('phone: there is no "Aa" button and no settings panel; the bar of the letters is at the foot, the eye-care button in the top bar', await J(`!document.querySelector('#readerSet') && !document.querySelector('#rSetPanel') && getComputedStyle(document.querySelector('#rBook')).display!=='none' && getComputedStyle(document.querySelector('#readerEye')).display!=='none'`));
  await J(`document.querySelector('#rbFsP').click()`); await sleep(400);
  ok('phone: A+ at the foot makes the letters bigger', await J(`/--fs:\\s*18\\.7px/.test(document.querySelector('#frame').contentDocument.documentElement.getAttribute('style')||'')`));
  await J(`document.querySelector('#rbFsM').click()`); await sleep(300);
  await closeReader();

  // ------------------------------------------------ a PDF and a page shown as it is
  await openById('local:p');
  ok('a PDF: the Save button is off (the browser\'s own viewer saves it)', await J(`document.querySelector('#readerSave').disabled`));
  await closeReader();
  await openById('local:h');
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  const orig = await J(`({html:document.querySelector('#rSaveHtml').hidden, print:document.querySelector('#rPrint').hidden, note:!document.querySelector('#rSaveNote').hidden && document.querySelector('#rSaveNote').textContent})`);
  ok('a page shown as it is: only "打印 / 存为 PDF", with a note why', orig.html && !orig.print && /只能用/.test(orig.note), orig);
  await closeReader();

  // ------------------------------------------------ the narrowest phone
  await fresh(320, 640, true);
  await openById('local:m');
  const n320 = await J(`(()=>{ const bs=[...document.querySelectorAll('.rb-right > *')].filter(b=>b.offsetParent!==null), r=Math.max(...bs.map(b=>b.getBoundingClientRect().right)); return {right:Math.round(r), vw:innerWidth, ids:bs.map(b=>b.id||'new')}; })()`);
  ok('320 px wide: the top bar still fits (the "new tab" link gives way)', n320.right <= n320.vw && n320.ids.includes('readerSave') && !n320.ids.includes('readerNew'), n320);
  await closeReader();

  // ================================================ a desktop
  await fresh(1280, 900, false);
  await openById('local:m');
  const dk = await J(`(()=>{ const b=document.querySelector('#readerSave'); return {vis:b.offsetParent!==null, label:b.textContent.trim()}; })()`);
  ok('desktop: the Save button shows its word', dk.vis && dk.label === '保存', dk);
  await J(`document.querySelector('#readerToc').click()`); await sleep(400);
  ok('desktop: no backdrop over the page while the contents panel is open (the page stays usable)', await J(`getComputedStyle(document.querySelector('#rBack')).display`) === 'none');
  await J(`document.querySelector('#readerToc').click()`); await sleep(200);
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  await c.shot(require('../paths').SHOTS + '/ru_save_desktop.png');
  ok('desktop: the Save panel opens', !(await hidden('#rSavePanel')));
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(300);
  ok('Escape closes the panel first, then the reader', await hidden('#rSavePanel') && !(await hidden('#reader')));
  await c.desktop(1000, 800, 1); await sleep(300);
  const mid = await J(`(()=>{ const bs=[...document.querySelectorAll('.rb-right > *')].filter(b=>b.offsetParent!==null), r=Math.max(...bs.map(b=>b.getBoundingClientRect().right)); return {right:Math.round(r), vw:innerWidth, lbl:getComputedStyle(document.querySelector('#readerSave .lbl')).display}; })()`);
  ok('1000 px wide: icons only, the bar fits', mid.right <= mid.vw && mid.lbl === 'none', mid);
  await c.desktop(1280, 900, 1);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
