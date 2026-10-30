// e2e: two small reminders. (1) the directory's home page has a dismissible line that leads to the illustrated guide; (2) the "收录" window says that the same address can be
// subscribed to for oneself (a button takes the address to "添加 → 订阅"), and a checked feed offers it too
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,render,openSubmit,guideItem}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.dirIntroOff','1')`); await c.goto(BASE, 2500); };      // (the question card of the first visit would take the tip's place)
  const toDir = async () => { await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1800); };
  writeDir();
  await c.desktop(1280, 900, 1);

  // ================================================ A. the line to the guide
  await fresh('zh'); await toDir();
  ok('the site has its guide among the built-in items', await J(`!!guideItem()`));
  const tip = await J(`(()=>{ const t=document.querySelector('#dirReco .dr-tip'); const h=document.querySelector('#dirReco h2'); return t ? {text:t.textContent.trim(), first:t===document.querySelector('#dirReco').firstElementChild || (t.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING)>0, link:!!t.querySelector('[data-dr-guide]'), x:!!t.querySelector('[data-dr-tipx]')} : null; })()`);
  ok('the home page of the directory starts with a tip that names the guide, with a link and a close button', tip && /使用指南/.test(tip.text) && tip.first && tip.link && tip.x, tip);
  await J(`document.querySelector('#dirReco [data-dr-guide]').click()`); await sleep(1200);
  ok('the link opens the guide in the reader', await J(`/^#read\\//.test(location.hash) && !document.querySelector('#reader').hidden`), await J(`location.hash`));
  ok('having opened it, the tip is not shown again', await J(`LS.get('guideTipOff',0)`) === 1);
  await fresh('zh'); await J(`LS.set('guideTipOff',1)`); await c.goto(BASE, 2500); await toDir();
  ok('and it stays gone after a reload', !(await J(`!!document.querySelector('#dirReco .dr-tip')`)));

  await fresh('zh'); await toDir();
  await J(`document.querySelector('#dirReco [data-dr-tipx]').click()`); await sleep(400);
  ok('the close button removes the tip and remembers it', !(await J(`!!document.querySelector('#dirReco .dr-tip')`)) && await J(`LS.get('guideTipOff',0)`) === 1);
  ok('the rest of the home page is whole (hot, picks, stream, everything)', (await J(`[...document.querySelectorAll('#dirReco h2')].map(h=>h.childNodes[0].textContent).join('|')`)) !== '', await J(`[...document.querySelectorAll('#dirReco h2')].length`));
  await c.goto(BASE, 2500); await toDir();
  ok('closed once, it does not come back after a reload', !(await J(`!!document.querySelector('#dirReco .dr-tip')`)));

  await fresh('en'); await toDir();
  ok('English: the tip is in English', /guide/i.test(await J(`(document.querySelector('#dirReco .dr-tip')||{textContent:''}).textContent`)) && !/[\u4e00-\u9fff]/.test(await J(`(document.querySelector('#dirReco .dr-tip')||{textContent:''}).textContent`)));
  await J(`document.querySelector('#dirReco [data-dr-tipx]').title`);
  await J(`document.querySelector('#dirReco [data-dr-tipx]').click()`); await sleep(300);

  // ================================================ B. the "收录" window
  await fresh('zh'); await toDir();
  await J(`openSubmit()`); await sleep(500);
  ok('the window of "收录": the reminder is there (with the submission service)', await J(`!document.querySelector('#submitSubTip').hidden && /订阅到你的书架/.test(document.querySelector('#submitSubTip').textContent)`));
  await J(`(()=>{ const u=document.querySelector('#submitUrl'); u.value='http://127.0.0.1:8841/blog/'; u.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(200);
  await J(`document.querySelector('#submitToSub').click()`); await sleep(1500);
  const st = await J(`({submitOpen:document.querySelector('#submitDlg').open, addOpen:document.querySelector('#addDlg').open,subPane:!document.querySelector('#addSubPane').hidden, url:document.querySelector('#fsUrl').value, found:!document.querySelector('#fsResult').hidden})`);
  ok('"改为订阅这个网址": the window closes, "添加 → 订阅" opens with the address filled in and looked up', !st.submitOpen && st.addOpen && st.subPane && /127\.0\.0\.1:8841\/blog\//.test(st.url) && st.found, st);
  await J(`document.querySelector('#addSubPane').closest('dialog').close()`); await sleep(200);

  // a checked feed offers it too; a repository does not
  await J(`openSubmit()`); await sleep(400);
  await J(`(()=>{ const u=document.querySelector('#submitUrl'); u.value='http://127.0.0.1:8841/blog/feed.xml'; u.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(200);
  await J(`document.querySelector('#submitGo').click()`); await sleep(1200);
  const off = await J(`({btn:!!document.querySelector('#submitCheck [data-sub-this]'), shown:!document.querySelector('#submitCheck').hidden, text:document.querySelector('#submitCheck').textContent})`);
  ok('a checked feed: the result says it can be subscribed to just for oneself, with a button', off.shown && off.btn && /订阅到我的书架/.test(off.text), off);
  await J(`document.querySelector('#submitCheck [data-sub-this]').click()`); await sleep(1500);
  const st2 = await J(`({submitOpen:document.querySelector('#submitDlg').open, subPane:!document.querySelector('#addSubPane').hidden, url:document.querySelector('#fsUrl').value, found:!document.querySelector('#fsResult').hidden})`);
  ok('the button takes the feed address to "添加 → 订阅"', !st2.submitOpen && st2.subPane && /feed\.xml/.test(st2.url) && st2.found, st2);
  await J(`document.querySelector('#addSubPane').closest('dialog').close()`); await sleep(200);

  await J(`openSubmit()`); await sleep(400);
  await J(`(()=>{ const u=document.querySelector('#submitUrl'); u.value='https://github.com/someone/some-repo'; u.dispatchEvent(new Event('input',{bubbles:true})); })()`); await sleep(200);
  await J(`document.querySelector('#submitGo').click()`); await sleep(1200);
  ok('a repository: checked, but no "subscribe" offer (it is not a feed)', await J(`!document.querySelector('#submitCheck').hidden && !document.querySelector('#submitCheck [data-sub-this]')`));
  await J(`document.querySelector('#submitDlg').close()`);

  // English
  await fresh('en'); await toDir();
  await J(`openSubmit()`); await sleep(400);
  ok('English: the reminder and its button', await J(`/shelf/i.test(document.querySelector('#submitSubTip').textContent) && /Subscribe/i.test(document.querySelector('#submitToSub').textContent) && !/[\u4e00-\u9fff]/.test(document.querySelector('#submitSubTip').textContent)`), await J(`document.querySelector('#submitSubTip').textContent`));
  await c.mobile(390, 844, 2);
  await sleep(300);
  const fit = await J(`(()=>{ const t=document.querySelector('#submitSubTip').getBoundingClientRect(); const d=document.querySelector('#submitDlg').getBoundingClientRect(); return {inside:t.left>=d.left-0.5 && t.right<=d.right+0.5, over:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()`);
  ok('phone: the reminder fits inside the window', fit.inside && fit.over <= 0, fit);
  await J(`document.querySelector('#submitDlg').close()`);
  await c.desktop(1280, 900, 1);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
