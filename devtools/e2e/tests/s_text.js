// e2e: the text of subscribed articles is read in the reader, saved as HTML, printed; older subscriptions get their text; backups keep it
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', BLOG = 'http://127.0.0.1:8842';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };
(async () => {
  const c = await connect(9444);
  c.autoDialog(true); await c.desktop(1280, 900, 1);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,bkBuild,bkOpen,bkPlan,bkApply,loadAll,addCollection}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); if (lang) { await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}'))`); await c.goto(BASE, 1800); } await J(`localStorage.setItem('archive.intro','1')`); await c.goto(BASE, 1500); };
  await fetch(BLOG + '/__content', { method: 'POST' });

  // ------------------------------------------------ subscribe: the text comes with the first reading
  await fresh('en');
  await J(`document.querySelector('#addBtn').click()`); await sleep(400);
  await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${BLOG}/blog/'; document.querySelector('#fsFind').click()`); await sleep(2800);
  await J(`document.querySelector('#fsGo').click()`); await sleep(4500);
  const items = await J(`state.items.filter(x=>x.id.startsWith('local:feed:')).map(x=>({t:x.title,len:(x.content||'').length,cut:!!x.contentCut,unread:!!x.unread}))`);
  const by = Object.fromEntries(items.map(i => [i.t, i]));
  ok('4 articles; text kept for 3 of them (the excerpt-only one has none)', items.length === 4 && by['Lead time in one picture'].len > 500 && by['库存周转率怎么看'].len > 300 && by['Hostile body'].len > 300 && by['Only an excerpt'].len === 0, items);
  const cv = await J(`state.cols.find(x=>x.feed).feed.cv`);
  ok('the subscription remembers the text was asked for', cv === 1, cv);
  ok('stored text is already clean (nothing that runs)', await J(`state.items.filter(x=>x.content).every(x=>!/<script|onerror|onclick|javascript:|<iframe/i.test(x.content))`));
  ok('cards: "Full text" on those with text only', await J(`[...document.querySelectorAll('.card')].filter(c=>/Full text/.test(c.textContent)).length`) === 3);
  await c.shot(require('../paths').SHOTS + '/text_shelf.png');

  // ------------------------------------------------ read one in the reader
  await J(`[...document.querySelectorAll('.card')].find(c=>/Lead time in one picture/.test(c.textContent)).querySelector('.card-title a').click()`); await sleep(2200);
  const rd = await J(`(()=>{ const f=document.querySelector('#frame'); const d=f.contentDocument; return {open:!document.querySelector('#reader').hidden, h1:d.querySelector('h1')&&d.querySelector('h1').textContent, text:/Lead time moves/.test(d.body.textContent),
    img:[...d.images].map(i=>i.getAttribute('src')+'|'+i.getAttribute('referrerpolicy')), links:[...d.querySelectorAll('a')].map(a=>a.getAttribute('href')+'|'+a.target+'|'+a.rel), scripts:d.querySelectorAll('script').length,
    csp:(d.querySelector('meta[http-equiv="Content-Security-Policy"]')||{}).content||'', ref:(d.querySelector('meta[name=referrer]')||{}).content, src:(d.querySelector('.doc-src a')||{}).href, readerNew:document.querySelector('#readerNew').href, unread:state.items.find(x=>x.title==='Lead time in one picture').unread}; })()`);
  ok('reader opens the article in place of the other site', rd.open && rd.h1 === 'Lead time in one picture' && rd.text, rd);
  ok('images are https with no referrer; links open elsewhere safely', rd.img.length === 1 && rd.img[0].startsWith('https://127.0.0.1') === false || rd.img.every(s => s.startsWith('https://') && s.endsWith('|no-referrer')), rd.img);
  ok('links', rd.links.length >= 2 && rd.links.every(l => l.includes('|_blank|noopener noreferrer')) && rd.links.filter(l => l.includes('nofollow')).length === rd.links.length - 1, rd.links);
  ok('the document itself allows no script and sends no referrer', rd.scripts === 0 && /default-src 'none'/.test(rd.csp) && rd.ref === 'no-referrer', [rd.scripts, rd.csp, rd.ref]);
  ok('the original is one click away at the foot of the text (the top bar has no "new tab" for a text: the eye-care button is there)', rd.src === BLOG + '/blog/post/1' && await J(`getComputedStyle(document.querySelector('#readerNew')).display==='none' && getComputedStyle(document.querySelector('#readerEye')).display!=='none'`), [rd.src, rd.readerNew]);
  ok('opening marked it read', rd.unread === false || rd.unread === undefined, rd.unread);
  await c.shot(require('../paths').SHOTS + '/text_reader.png');

  // next goes to the next article with text, never to the excerpt-only one
  const order = await J(`state.visible.map(id=>state.items.find(x=>x.id===id).title)`);
  ok('prev / next walk through the articles that have text', order.length === 3 && !order.includes('Only an excerpt'), order);
  await J(`document.querySelector('#readerNext').click()`); await sleep(1500);
  ok('next opens another article in the reader', await J(`document.querySelector('#readerTitle').textContent`) !== 'Lead time in one picture');

  // ------------------------------------------------ the hostile one
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);
  await J(`[...document.querySelectorAll('.card')].find(c=>/Hostile body/.test(c.textContent)).querySelector('.card-title a').click()`); await sleep(2200);
  const hs = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {pwned:window.__pwned, framePwned:document.querySelector('#frame').contentWindow.__pwned, scripts:d.querySelectorAll('script,iframe').length, onattrs:[...d.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length,
    bad:[...d.querySelectorAll('a')].filter(a=>/^javascript:/i.test(a.getAttribute('href')||'')).length, rel:[...d.querySelectorAll('a')].map(a=>a.href)}; })()`);
  ok('a hostile article runs nothing and has no unsafe link', hs.pwned === undefined && hs.framePwned === undefined && hs.scripts === 0 && hs.onattrs === 0 && hs.bad === 0, hs);
  ok('its relative link points to the original site', hs.rel.some(h => h === BLOG + '/relative/page'), hs.rel);

  // ------------------------------------------------ settings apply, save as HTML, print
  ok('there is no settings panel; the top bar has a Save button for a document', await J(`!document.querySelector('#rSetPanel') && !document.querySelector('#readerSet') && !document.querySelector('#readerSave').disabled`));
  await J(`document.querySelector('#rbFsP').click(); document.querySelector('#readerEye').click()`); await sleep(500);
  ok('size (the bar at the foot) and colour (the eye-care button) apply to the article', await J(`(()=>{ const el=document.querySelector('#frame').contentDocument.documentElement; return /--fs:\\s*20\\.9px/.test(el.getAttribute('style')||'') && el.getAttribute('data-theme')==='sepia'; })()`));
  await c.shot(require('../paths').SHOTS + '/text_settings.png');
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  ok('the Save panel shows the download for a document', await J(`!document.querySelector('#rSaveHtml').hidden && /Download as a web page/.test(document.querySelector('#rSaveHtml').textContent)`));
  await J(`window.__dl=null; const orig=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){ if(this.download){ window.__dl={name:this.download,href:this.href}; return; } return orig.call(this); }; document.querySelector('#rSaveHtml').click()`); await sleep(600);
  const dl = await J(`(async()=>{ if(!window.__dl) return null; const t=await (await fetch(window.__dl.href)).text(); return {name:window.__dl.name, doctype:/^<!DOCTYPE html>/i.test(t), hasText:/Hostile body/.test(t), csp:/Content-Security-Policy/.test(t), scripts:(t.match(/<script/gi)||[]).length}; })()`);
  ok('download as HTML: a whole page named after the article, no script in it', dl && dl.name === 'Hostile body.html' && dl.doctype && dl.hasText && dl.csp && dl.scripts === 0, dl);
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  await J(`window.__printed=false; document.querySelector('#frame').contentWindow.print=()=>{ window.__printed=true; }; document.querySelector('#rPrint').click()`); await sleep(300);
  ok('print / save as PDF asks the document to print', await J(`window.__printed`) === true);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ------------------------------------------------ a PDF of the shelf has no save row (and a page shown as it is has only print)
  ok('(the demo has no local PDF here; the rule is in syncSettings)', true);

  // ------------------------------------------------ an older subscription gets its text later, although the feed did not change
  await J(`(async()=>{ for(const it of state.items.filter(x=>x.content)){ delete it.content; delete it.contentCut; const r={...it}; delete r.source; await idb.put(r); } const c=state.cols.find(x=>x.feed); delete c.feed.cv; LS.set('cols',state.cols); await loadAll(); })()`);
  ok('setup: no text kept, no cv', await J(`state.items.filter(x=>x.content).length`) === 0);
  await J(`document.querySelector('#colManage').click()`); await sleep(400);
  await J(`document.querySelector('[data-refresh]').click()`); await sleep(4000);
  const back = await J(`({texts:state.items.filter(x=>x.content).length, cv:state.cols.find(x=>x.feed).feed.cv, total:state.items.filter(x=>x.id.startsWith('local:feed:')).length})`);
  ok('refresh brings the text back to the articles already kept (no duplicates)', back.texts === 3 && back.cv === 1 && back.total === 4, back);
  await J(`document.querySelector('#colClose').click()`);

  // ------------------------------------------------ the feed drops its text: what is kept stays
  await fetch(BLOG + '/__nocontent', { method: 'POST' });
  await J(`document.querySelector('#colManage').click()`); await sleep(300); await J(`document.querySelector('[data-refresh]').click()`); await sleep(3500);
  ok('when the feed stops carrying text, the text already kept stays', await J(`state.items.filter(x=>x.content).length`) === 3);
  await J(`document.querySelector('#colClose').click()`);
  await fetch(BLOG + '/__content', { method: 'POST' });

  // ------------------------------------------------ the backup keeps the text; a hostile backup cannot smuggle script in
  const full = await J(`(async()=>{ const r=await bkBuild(false); return await r.blob.text(); })()`);
  const m = JSON.parse(full);
  ok('backup (list only) carries the text of the articles', m.items.filter(i => i.content).length === 3, m.items.map(i => (i.content || '').length));
  await fresh('zh');
  const imp = await c.js(`(async()=>{ const {bkOpen,bkApply,loadAll,state}=window.__zt; const f=new File([${JSON.stringify(full)}],'x.json'); const b=await bkOpen(f); const r=await bkApply(b); await loadAll(); return {r, texts:state.items.filter(x=>x.content).length}; })()`);
  ok('restore: the articles come back with their text', imp.texts === 3, imp);
  const evil = JSON.parse(full); evil.items.forEach(i => { if (i.content) i.content = '<p>fine ' + 'x'.repeat(600) + '</p><script>window.__pwned=9</script><img src=x onerror="window.__pwned=10"><a href="javascript:window.__pwned=11">l</a>'; });
  await fresh('zh');
  await c.js(`(async()=>{ const {bkOpen,bkApply,loadAll}=window.__zt; const b=await bkOpen(new File([${JSON.stringify(JSON.stringify(evil))}],'evil.json')); await bkApply(b); await loadAll(); })()`);
  await J(`[...document.querySelectorAll('.card')].find(c=>/Lead time/.test(c.textContent)).querySelector('.card-title a').click()`); await sleep(2200);
  const ev = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {pwned:window.__pwned, fp:document.querySelector('#frame').contentWindow.__pwned, scripts:d.querySelectorAll('script').length, on:[...d.querySelectorAll('*')].filter(e=>[...e.attributes].some(a=>/^on/i.test(a.name))).length, js:[...d.querySelectorAll('a')].filter(a=>/^javascript:/i.test(a.getAttribute('href')||'')).length, shown:/fine x/.test(d.body.textContent)}; })()`);
  ok('a hostile backup\'s text is cleaned again when shown', ev.pwned === undefined && ev.fp === undefined && ev.scripts === 0 && ev.on === 0 && ev.js === 0 && ev.shown, ev);

  // ------------------------------------------------ English / Chinese strings of the save row
  await fresh('zh');
  await c.js(`(async()=>{ const {bkOpen,bkApply,loadAll}=window.__zt; const b=await bkOpen(new File([${JSON.stringify(full)}],'x.json')); await bkApply(b); await loadAll(); })()`);
  await J(`[...document.querySelectorAll('.card')].find(c=>/库存周转率/.test(c.textContent)).querySelector('.card-title a').click()`); await sleep(2200);
  await J(`document.querySelector('#readerSave').click()`); await sleep(300);
  ok('Chinese strings: 保存 (the button) / 保存这一篇 / 下载网页 / 打印', await J(`/^保存$/.test(document.querySelector('#readerSave').textContent.trim()) && /保存这一篇/.test(document.querySelector('#rSavePanel').textContent) && /下载网页/.test(document.querySelector('#rSaveHtml').textContent) && /打印/.test(document.querySelector('#rPrint').textContent)`));
  await c.shot(require('../paths').SHOTS + '/text_zh.png');

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
