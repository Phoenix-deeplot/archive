// e2e: the public space ("发现世界") opens like an app: this browser keeps the directory (the text of directory.json, the data of /api/ops, the heat); the next visit shows the kept copy at once and the network only
// checks it (nothing changes on the screen when the answer is the same; a changed answer is put in its place; a network that fails leaves the copy); the operations data hides the hidden items from the first screen;
// the directory is asked for once, before the big script is read (window.__early); the font style sheet of Google does not stop the first paint
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const P = require('../paths');
const BASE = 'http://127.0.0.1:8820/', ORIGIN = 'http://127.0.0.1:8820', DIRF = P.DIST + '/dir/directory.json';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };
const b64 = s => Buffer.from(s, 'utf8').toString('base64');

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: false });
  const J = async expr => { try { return await c.js(`(()=>{ const {state,LS,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`); } catch (e) { throw new Error(e.message + '  IN: ' + expr.slice(0, 160)); } };
  const waitFor = async (expr, ms = 8000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(100); } };

  // what the made-up services say: the directory service of the rig (https://ops.test stands in for the operations / heat API of a real directory), and what is held or failed on purpose
  const ctl = { holdDir: false, failDir: false, held: [], dirCount: 0, ops: null, heat: null };
  const json = (requestId, o) => c.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: b64(JSON.stringify(o)) }).catch(() => {});
  c.on(m => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params, u = request.url;
    if (/^https:\/\/ops\.test\/api\/ops/.test(u)) return json(requestId, ctl.ops || { ok: false });
    if (/^https:\/\/ops\.test\/api\/stat/.test(u)) return json(requestId, ctl.heat || { ok: false });
    if (/\/dir\/directory\.json/.test(u)) {
      ctl.dirCount++;
      if (ctl.failDir) return c.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
      if (ctl.holdDir) { ctl.held.push(requestId); return; }
    }
    c.send('Fetch.continueRequest', { requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: 'https://ops.test/*' }, { urlPattern: '*/dir/directory.json*' }] });
  const release = async () => { const ids = ctl.held.splice(0); for (const id of ids) await c.send('Fetch.continueRequest', { requestId: id }).catch(() => {}); };

  // the made-up directory, as the page knows it: its operations service is a https one (so that the page asks it), a hidden item and a heat count are made up here
  const setDir = fn => { writeDir(); const d = JSON.parse(fs.readFileSync(DIRF, 'utf8')); d.submit_api = 'https://ops.test/api/submit'; if (fn) fn(d); fs.writeFileSync(DIRF, JSON.stringify(d)); return d; };
  const d0 = setDir();
  const HID = d0.items[0].id, HEAT = d0.items[1].id, TITLE0 = d0.items[1].title;
  const OPS = hidden => ({ ok: true, data: { version: 1, programs: [], items: hidden.map(id => ({ id, hidden: true })), modules: [], ads: [], subscriptions: [] } });
  const HEATDATA = { ok: true, configured: true, items: { [HEAT]: { h: 40, l: 7, d: 0 } }, shelves: {} };
  ctl.ops = OPS([HID]); ctl.heat = HEATDATA;

  // (the page starts in the public space, as a visit that left it there; no dialog of a first visit)
  const boot = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: "try{ localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22')); localStorage.setItem('archive.guideTipOff','1'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.space', JSON.stringify('dir')); }catch(e){}" });
  const visit = async (wait = 2500) => { ctl.dirCount = 0; await c.goto(BASE, 0); await sleep(wait); };
  const cache = () => J(`(async()=>{ const ks=await caches.keys(); if(!ks.includes('zt-dir')) return null; const c=await caches.open('zt-dir'), r=await c.match('https://dir.cache/'+encodeURIComponent(state.dirCfg)); return r ? await r.json() : null; })()`);
  const cards = () => J(`document.querySelectorAll('#dirReco .card, #dirReco .hero, #grid .card').length`);
  await c.desktop(1280, 900, 1);

  // ------------------------------------------------ the first visit: the network, and a copy is kept
  await c.goto('about:blank', 100); await c.clearSite(ORIGIN);
  ctl.holdDir = true;
  await visit(1800);
  ok('the first visit has nothing to show while the directory is on its way (the state of loading, no data)', (await J(`!state.dirData && state.dirState==='loading'`)) && ctl.held.length === 1, [await J(`[!!state.dirData, state.dirState]`), ctl.held.length]);
  ctl.holdDir = false; await release(); await waitFor(`!!state.dirData`, 8000); await sleep(600);
  ok('...then it comes and the page has it, without the item that the operations data hides', (await J(`!!state.dirData && !state.dirData.items.some(i=>i.id===${JSON.stringify(HID)})`)) && (await cards()) > 0, await cards());
  ok('the directory was asked for once (the early request of the small script at the top is the one that was used, not a second one)', ctl.dirCount === 1, ctl.dirCount);
  const kept1 = await cache();
  ok('a copy is kept: the text of directory.json and the data of the operations service', !!kept1 && kept1.v === 1 && typeof kept1.dirText === 'string' && kept1.dirText.includes(TITLE0) && kept1.ops && kept1.ops.items.length === 1 && kept1.ops.items[0].id === HID, kept1 && Object.keys(kept1));
  await sleep(500);
  const heatKept = await J(`(async()=>{ const c=await caches.open('zt-dir'), r=await c.match('https://dir.cache/heat/'+encodeURIComponent(state.dirCfg)); return r ? await r.json() : null; })()`);
  ok('the heat is kept too', !!heatKept && heatKept.heat && heatKept.heat.items && heatKept.heat.items[HEAT] && heatKept.heat.items[HEAT].l === 7, heatKept);

  // ------------------------------------------------ the next visit: the copy at once, the network only checks it
  ctl.holdDir = true; ctl.ops = null; ctl.heat = null;                                              // (the directory is held, the operations service and the heat do not answer: only the copy can show anything)
  await visit(0);
  const t0 = Date.now(); const got = await waitFor(`!!state.dirData`, 4000); const ms = Date.now() - t0;
  ok('the next visit: the page has the directory before the network has answered (the request is still held)', !!got && ctl.held.length >= 1 && ms < 2500, { got, held: ctl.held.length, ms });
  ok('...the heat of the last visit is there at once too', await J(`!!state.heat && state.heat.items[${JSON.stringify(HEAT)}] && state.heat.items[${JSON.stringify(HEAT)}].l===7`));
  ok('...and the item that the operations data hid is not shown (the operations data was kept with it)', await J(`!state.dirData.items.some(i=>i.id===${JSON.stringify(HID)})`));
  await J(`state.dView='all'; state.dShelf=''; state.dTab=''; render()`); await sleep(400);
  ok('...the list is on the screen: cards, no "loading"', (await cards()) > 0 && !(await J(`/读取|加载|Loading/.test(document.querySelector('#empty').hidden ? '' : document.querySelector('#empty').textContent)`)), await cards());
  const mark = await J(`window.__d0=state.dirData; 1`);
  ctl.holdDir = false; await release(); await sleep(1500);
  ok('the answer is the same as the copy: nothing is built again (the same data object stays)', await J(`state.dirData===window.__d0 && state.dirState==='ok'`));
  ok('...and the operations service that did not answer left what was known (the item is still hidden)', await J(`!state.dirData.items.some(i=>i.id===${JSON.stringify(HID)})`));

  // ------------------------------------------------ the directory changed: the new one is put in its place, and kept
  setDir(d => { d.items.unshift({ id: 'zznew00001', title: 'ZZ新来的一条', summary: 'new', url: 'http://127.0.0.1:8850/blog/zz', image: '', date: '2026-11-03', type: 'article', lang: 'zh', tags: [], shelf: d.items[2].shelf }); d.count = d.items.length; });
  ctl.ops = OPS([HID]); ctl.heat = HEATDATA;
  await visit(0);
  await waitFor(`!!state.dirData`, 4000);
  const early = await J(`state.dirData===undefined ? 0 : (state.dirData.items.some(i=>i.id==='zznew00001') ? 1 : 0)`);
  await waitFor(`state.dirData.items.some(i=>i.id==='zznew00001')`, 8000); await sleep(500);
  ok('a directory that changed: the new item is in the page after the answer, without a reload by hand', await J(`state.dirData.items.some(i=>i.id==='zznew00001')`));
  ok('...and in the copy that is kept', (await cache()).dirText.includes('ZZ新来的一条'));

  // ------------------------------------------------ the network fails: the copy stays
  ctl.failDir = true;
  await visit(0);
  await waitFor(`!!state.dirData`, 4000); await sleep(1500);
  ok('the directory cannot be reached: the copy is used, no error state, no "retry"', await J(`!!state.dirData && state.dirState==='ok' && !document.querySelector('[data-retry]') && state.dirData.items.some(i=>i.id==='zznew00001')`));
  ctl.failDir = false;

  // ------------------------------------------------ a copy that cannot be used is ignored
  for (const [what, body] of [['not JSON', '{ bad'], ['an old version', JSON.stringify({ v: 0, base: 'x', at: Date.now(), dirText: '{}' })], ['for another address', JSON.stringify({ v: 1, base: 'http://elsewhere.invalid/', at: Date.now(), dirText: '{}' })], ['too old', JSON.stringify({ v: 1, base: BASE + 'dir/', at: 1, dirText: '{}' })]]) {
    await J(`(async()=>{ const c=await caches.open('zt-dir'); await c.put('https://dir.cache/'+encodeURIComponent(${JSON.stringify(BASE + 'dir/')}), new Response(${JSON.stringify(body)})); })()`);
    await visit(0);
    await waitFor(`!!state.dirData`, 6000); await sleep(500);
    ok('a copy that is ' + what + ' is ignored: the network answers, the page has the directory', await J(`!!state.dirData && state.dirState==='ok' && state.dirData.items.length>10`));
  }

  // ------------------------------------------------ the font style sheet does not stop the first paint
  const head = await J(`(async()=>{ const html=await (await fetch(location.pathname,{cache:'no-store'})).text(), top=html.slice(0,html.indexOf('</head>')), noNs=top.replace(/<noscript>[\\s\\S]*?<\\/noscript>/g,''); return {pre:/<link rel="preload" as="style" href="https:\\/\\/fonts\\.googleapis\\.com[^>]*onload=/.test(noNs), blocking:/<link[^>]*rel="stylesheet"[^>]*fonts\\.googleapis\\.com|<link[^>]*fonts\\.googleapis\\.com[^>]*rel="stylesheet"/.test(noNs), noscript:/<noscript><link[^>]*fonts\\.googleapis\\.com[^>]*rel="stylesheet"/.test(top)}; })()`);
  ok('the Google font style sheet is asked for without stopping the page (a preload that becomes a style sheet when it is there), with a noscript fallback', head.pre && !head.blocking && head.noscript, head);

  await c.send('Fetch.disable').catch(() => {});
  await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: boot.identifier }).catch(() => {});
  writeDir();
  const mine = errs.filter(e => !/adsbygoogle|googlesyndication/.test(e));
  ok('no script errors in the whole run', mine.length === 0, mine);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
