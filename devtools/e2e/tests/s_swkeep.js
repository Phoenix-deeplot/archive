// e2e: the page opens at once from the copy that the service worker (sw.js) keeps and the network is asked behind it; a changed page is kept and a bar offers a refresh (never a reload by itself);
// the public space looks again when the page comes back after a while, with the "↻" of the update note, and with a pull down on a phone; what is unchanged is not drawn again.
// The service worker is registered in the test browser by the switch localStorage 'zt.sw' = '1' (a page without it registers none, as on serve.py).
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', ORIGIN = 'http://127.0.0.1:8820', INDEX = P.DIST + '/index.html';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const orig = fs.readFileSync(INDEX, 'utf8');
  let mt = Math.floor(Date.now() / 1000);
  const mark = v => { fs.writeFileSync(INDEX, orig.replace(/<head[^>]*>/, m => m + `<meta name="zt-test" content="${v}">`)); mt += 5; fs.utimesSync(INDEX, mt, mt); };          // (the "new version" of the page: the same page with a marker; its time moves on by whole seconds, the server of the rig only knows seconds)
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  const ctl = { dirCount: 0 };
  c.on(m => { if (m.method === 'Network.requestWillBeSent' && /\/dir\/directory\.json/.test(m.params.request.url)) ctl.dirCount++; });
  await c.send('Network.enable');
  const J = async expr => { try { return await c.js(`(()=>{ const {state}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is being replaced */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const flags = sw => `try{ localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.space', JSON.stringify('dir')); ${sw ? "localStorage.setItem('zt.sw','1');" : ''} }catch(e){}`;
  const kept = () => J(`(async()=>{ const out={}; for(const k of await caches.keys()){ const c=await caches.open(k); out[k]=(await c.keys()).map(r=>{ const u=new URL(r.url); return u.pathname+u.search; }); } return out; })()`);
  const shellKeys = async () => { const k = await kept(), n = Object.keys(k).find(x => /^shell-/.test(x)); return n ? k[n] : []; };
  const copyHas = s => J(`caches.keys().then(ks=>caches.open(ks.find(k=>/^shell-/.test(k)))).then(c=>c.match('/index.html')).then(r=>r?r.text():'').then(x=>x.includes(${JSON.stringify(s)}))`);
  const hasMark = () => J(`(document.querySelector('meta[name=zt-test]')||{}).content||''`);
  const barShown = () => J(`!document.querySelector('#newVer').hidden`);
  const note = () => J(`document.querySelector('#updNote').textContent`);
  const ready = (url = BASE) => c.goto(url, 0).then(() => waitFor(`!!window.__zt && !!state && !!state.dirCfg`, 10000));
  await c.desktop(1280, 900, 1);

  try {
    // ------------------------------------------------ without the switch: no service worker (serve.py and every other visitor of http)
    const s0 = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: flags(false) });
    await c.goto('about:blank', 100); await c.clearSite(ORIGIN);
    await ready(); await sleep(1200);
    ok('a page without the switch registers no service worker', await J(`navigator.serviceWorker.getRegistration().then(r=>!r)`));
    await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: s0.identifier });

    // ------------------------------------------------ the first visit: the network, the worker is installed and keeps the page
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: flags(true) });
    await c.goto('about:blank', 100); await c.clearSite(ORIGIN);
    await ready();
    ok('the first visit registers sw.js', await J(`navigator.serviceWorker.ready.then(r=>!!r.active)`));
    ok('...and it keeps the page (the first visit was answered by the network, nothing was kept before)', (await shellKeys()).includes('/index.html'), await shellKeys());

    // ------------------------------------------------ the second visit, nothing changed: the kept copy, manifest.js kept too, no bar
    await ready();
    ok('the second visit is controlled by the worker', await J(`!!navigator.serviceWorker.controller`));
    ok('manifest.js (the file list the page loads first) is kept as well', await waitFor(`caches.keys().then(ks=>ks.find(k=>/^shell-/.test(k))).then(k=>caches.open(k)).then(c=>c.keys()).then(r=>r.some(x=>new URL(x.url).pathname==='/manifest.js'))`, 5000));
    await sleep(1500);
    ok('nothing changed on the network: no bar for a new version', !(await barShown()));

    // ------------------------------------------------ the page changed on the network: the kept copy opens at once, the new one is kept, a bar offers it
    mark('v2');
    await ready();
    ok('the page that opens is the kept copy (the network has a newer one already: the answer did not wait for it)', (await hasMark()) === '', await hasMark());
    ok('a bar offers the new version once the worker has it', await waitFor(`!document.querySelector('#newVer').hidden`, 8000));
    ok('...saying so, with a button to refresh', (await J(`document.querySelector('#newVerMsg').textContent`)) === '有新版本了' && (await J(`document.querySelector('#newVerGo').textContent`)) === '刷新');
    ok('the new page was kept behind the answer', await copyHas('name="zt-test" content="v2"'));
    await J(`document.querySelector('#newVerX').click()`);
    ok('✕ closes the bar', !(await barShown()));
    mark('v3');
    await J(`navigator.serviceWorker.controller.postMessage({type:'zt-check-shell'})`);
    ok('the page asks the worker to look now (zt-check-shell) and the worker keeps what it finds', await waitFor(`caches.keys().then(ks=>caches.open(ks.find(k=>/^shell-/.test(k)))).then(c=>c.match('/index.html')).then(r=>r.text()).then(x=>x.includes('content="v3"'))`, 8000));
    await sleep(800);
    ok('a bar that was closed stays closed on this page', !(await barShown()));

    // ------------------------------------------------ the next visit has the new page; then "refresh" in the bar
    await ready();
    ok('the next visit opens the new page', (await hasMark()) === 'v3', await hasMark());
    await sleep(1500);
    ok('...and the bar does not come again (nothing newer)', !(await barShown()));
    mark('v4');
    await J(`navigator.serviceWorker.controller.postMessage({type:'zt-check-shell'})`);
    ok('a newer page: the worker tells the open page and the bar shows', await waitFor(`!document.querySelector('#newVer').hidden`, 8000));
    await J(`document.querySelector('#newVerGo').click()`);
    ok('"refresh" loads the new page and the bar is gone', (await waitFor(`!!window.__zt && document.querySelector('meta[name=zt-test]') && document.querySelector('meta[name=zt-test]').content==='v4'`, 8000)) && !(await barShown()), await hasMark());

    // ------------------------------------------------ the network cannot give the page: the kept copy is used, quietly
    fs.renameSync(INDEX, INDEX + '.off');
    try {
      await ready(); await sleep(1500);
      ok('the page file is gone from the server (404): the kept copy opens, no bar, no error state', (await hasMark()) === 'v4' && !(await barShown()) && !!(await J(`state.dirData`)), await hasMark());
    } finally { fs.renameSync(INDEX + '.off', INDEX); }
    await c.goto(BASE + '?x=1&y=2', 0); await waitFor(`!!window.__zt`, 8000); await sleep(800);
    ok('an address with something after it is the same page: it gets no copy of its own', !(await shellKeys()).some(k => /\?/.test(k)), await shellKeys());

    // ------------------------------------------------ the public space: the update note, coming back after a while
    await ready(); await waitFor(`!!state.dirData`, 8000); await sleep(800);
    ok('the public space says when it was updated, with a button to update now', /^已更新 \d\d:\d\d$/.test((await note()).replace('↻', '').trim()) && (await J(`!!document.querySelector('#updNote [data-dirrefresh]')`)), await note());
    ok('...the browser\'s own pull to reload is switched off there (html.ptr)', await J(`document.documentElement.classList.contains('ptr')`));
    await J(`(()=>{ window.__t={off:0,vs:'visible'}; const R=Date.now.bind(Date); Date.now=()=>R()+window.__t.off; Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.__t.vs}); })()`);
    const away = min => J(`(()=>{ window.__t.vs='hidden'; document.dispatchEvent(new Event('visibilitychange')); window.__t.off+=${min}*60000; window.__t.vs='visible'; document.dispatchEvent(new Event('visibilitychange')); })()`);
    const asked = async (n, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms && ctl.dirCount < n) await sleep(100); return ctl.dirCount; };
    await J(`window.__node=[document.querySelector('#dirReco').firstElementChild, document.querySelector('#grid').firstElementChild]`);
    ctl.dirCount = 0; await away(3); await sleep(1500);
    ok('back after 3 minutes: nothing is asked', ctl.dirCount === 0, ctl.dirCount);
    const t0 = await note();
    await away(11);
    ok('back after 11 minutes: the directory is looked at again', (await asked(1)) === 1, ctl.dirCount);
    ok('...and the time of the note moves on', await waitFor(`document.querySelector('#updNote').textContent!==${JSON.stringify(t0)}`, 6000), [t0, await note()]);
    ok('...nothing was different, so nothing was drawn again', await J(`window.__node.some(Boolean) && window.__node[0]===document.querySelector('#dirReco').firstElementChild && window.__node[1]===document.querySelector('#grid').firstElementChild`));
    ctl.dirCount = 0;
    const txt = await J(`(()=>{ document.querySelector('#updNote [data-dirrefresh]').click(); return document.querySelector('#updNote').textContent; })()`);
    ok('the button of the note looks at once and says it is updating', /更新中/.test(txt) && await J(`document.querySelector('#updNote').classList.contains('spin')`), txt);
    const spun = await waitFor(`!document.querySelector('#updNote').classList.contains('spin')`, 6000);
    ok('...asks the directory once and goes back to the time', spun && (await asked(1, 1500)) === 1 && /已更新 \d\d:\d\d/.test(await note()), [ctl.dirCount, await note(), await J(`[state.dirBusy, state.dirRefreshing]`)]);

    // ------------------------------------------------ a phone: pull down at the top
    await c.mobile(375, 812, 2);
    await ready(); await waitFor(`!!state.dirData`, 8000); await sleep(1200);
    const tStart = (x, y) => c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    const tMove = (x, y) => c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    const tEnd = () => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const hint = () => J(`(()=>{ const h=document.querySelector('#pullHint'); return {text:h.textContent, on:getComputedStyle(h).opacity==='1'}; })()`);
    ctl.dirCount = 0;
    await tStart(180, 200); await sleep(50); await tMove(180, 215); await sleep(50); await tMove(180, 240); await sleep(80);
    const h1 = await hint();
    ok('a short pull: a bar follows the finger and says "pull to refresh"', h1.on && h1.text === '下拉刷新', h1);
    await tEnd(); await sleep(700);
    ok('...let go too early: it goes back and nothing is asked', !(await hint()).on && ctl.dirCount === 0, [await hint(), ctl.dirCount]);
    await tStart(300, 200); await sleep(50); await tMove(250, 212); await sleep(50); await tMove(140, 240); await sleep(50); await tEnd(); await sleep(600);
    ok('a movement sideways is not a pull', !(await hint()).on && ctl.dirCount === 0, [await hint(), ctl.dirCount]);
    await J(`document.body.classList.remove('drawer')`);                                         // (a swipe to the right on the phone opens the left list; the pull stays out of the way while it is open)
    await tStart(180, 200); await sleep(50); await tMove(180, 220); await sleep(50); await tMove(180, 260); await sleep(50); await tMove(180, 310); await sleep(80);
    const h2 = await hint();
    ok('a long pull: the bar says "release to refresh"', h2.on && h2.text === '松开刷新', h2);
    await tEnd();
    ok('...let go: the directory is looked at again', (await asked(1)) === 1, ctl.dirCount);
    ok('...the bar says "updated" and then goes away', (await waitFor(`document.querySelector('#pullHint').textContent==='已更新'`, 6000)) && (await waitFor(`getComputedStyle(document.querySelector('#pullHint')).opacity==='0'`, 4000)));
    await J(`window.scrollTo(0, 500)`); await sleep(300);
    const sc = await J(`(document.scrollingElement||document.documentElement).scrollTop`);
    ctl.dirCount = 0;
    await tStart(180, 200); await sleep(50); await tMove(180, 260); await sleep(50); await tMove(180, 330); await sleep(80);
    ok('not at the top of the page: a pull down is the page scrolling, no bar', sc > 100 && !(await hint()).on, [sc, await hint()]);
    await tEnd(); await sleep(500);
    ok('...and nothing is asked', ctl.dirCount === 0, ctl.dirCount);
    await J(`window.scrollTo(0, 0)`);
  } finally {
    fs.writeFileSync(INDEX, orig); mt += 5; fs.utimesSync(INDEX, mt, mt);                  // (the page as it was, with the newest time; the worker and its copies are taken away so that no other test meets them)
    try { await c.js(`(async()=>{ for(const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for(const k of await caches.keys()) await caches.delete(k); localStorage.removeItem('zt.sw'); })()`); } catch (e) { /* the page is gone */ }
    await c.desktop(1280, 900, 1); await c.goto('about:blank', 100); await c.clearSite(ORIGIN);
    writeDir();
  }
  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); try { fs.writeFileSync(P.DIST + '/index.html', fs.readFileSync(P.DIST + '/index.html', 'utf8').replace(/<meta name="zt-test"[^>]*>/, '')); } catch (x) { /* nothing to put back */ } process.exit(2); });
