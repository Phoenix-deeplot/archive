// e2e: the "translate" button of the reader. The directory's /api/translate is the real translateapi.py behind the fake services (sync_dev.py, :8840; ?mode=ok|off|limit|quota|fail), its providers are fake.
// Needs SHELF_DIRECTORY to point at a shelf-directory that has translateapi.py (the rig is started with it).
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const get = p => fetch(SVC + p).then(r => r.json());

const EN = '# A short history of tea\n\n' + ['Tea was first drunk in China, as a medicine, thousands of years ago.', 'It reached Europe by ship in the seventeenth century and soon became a habit.',
  '## The leaf\n\nThe same plant gives green, black and white tea; the difference is in the making.', 'A cup of tea needs water that is hot but not boiling, and a little patience.',
  '- Green tea is steamed or pan-fired.\n- Black tea is fully oxidised.'].join('\n\n');
const LONG = '# A very long walk\n\n' + Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. ` + 'The road went on and on across the quiet hills, and nobody was there to see it. '.repeat(10)).join('\n\n');
const ZH = '# 茶的简史\n\n茶最早在中国被当作药来喝，已经有几千年了。\n\n十七世纪茶经海路传到欧洲，很快成了一种习惯。';

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,idb,loadAll,render,openReader,transApi,trAvailable,TR}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fdoc = expr => J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return ${expr}; })()`);
  const fresh = async (mode = 'ok', lang = 'zh') => {
    await get('/__trans?mode=' + mode + '&reset=1');
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2800);
    await J(`(async()=>{ const mk=(id,title,data,lang)=>({id,path:'',category:'notes',filename:id.slice(6)+'.md',hash:'',title,summary:'s',keywords:[],lang,minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',type:'md',data});
      await idb.put(mk('local:en','A short history of tea',${JSON.stringify(EN)},'en')); await idb.put(mk('local:long','A very long walk',${JSON.stringify(LONG)},'en')); await idb.put(mk('local:zh','茶的简史',${JSON.stringify(ZH)},'zh')); await loadAll(); render(); })()`);
    await waitFor(`!!state.dirData && !!transApi()`);
  };
  const toastText = () => J(`document.querySelector('#toastMsg').textContent`);
  const open = async id => { await J(`openReader(${JSON.stringify(id)})`); await waitFor(`!document.querySelector('#reader').hidden`); await waitFor(`(()=>{ const d=document.querySelector('#frame').contentDocument; return d && d.querySelector('p'); })()`); await sleep(500); };
  const btn = () => J(`({hidden:document.querySelector('#readerTrans').hidden, lbl:document.querySelector('#readerTransLbl').textContent, on:document.querySelector('#readerTrans').classList.contains('on')})`);
  const shut = async () => { await J(`document.querySelector('#readerBack').click()`); await sleep(500); };

  writeDir();

  // ---- the button, the question, the translation
  await c.desktop(1280, 900, 1);
  await fresh();
  await open('local:en');
  const b0 = await btn();
  ok('an English article: the button "翻译" is there (the service says it is set up)', !b0.hidden && b0.lbl === '翻译' && !b0.on, b0);
  await J(`document.querySelector('#readerTrans').click()`); await sleep(500);
  ok('the first click asks (the text goes to a translation service) and sends nothing yet', (await J(`document.querySelector('#trDlg').open`)) && (await get('/__trans_log')).length === 0);
  await J(`document.querySelector('#trNo').click()`); await sleep(400);
  ok('"取消": nothing was sent, nothing changed', (await get('/__trans_log')).length === 0 && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === 0 && (await btn()).lbl === '翻译');
  await J(`document.querySelector('#readerTrans').click()`); await sleep(400);
  await J(`document.querySelector('#trYes').click()`);
  await waitFor(`TR.mode==='both'`);
  const n = await fdoc(`d.querySelectorAll('.zt-tr').length`), blocks = await fdoc(`[...d.querySelectorAll('p,li,h1,h2,h3')].filter(e=>!e.closest('.zt-tr,.doc-meta,.doc-src,.doc-lic')).length`);
  const log = await get('/__trans_log');
  ok('"翻译": every paragraph, item and heading has its translation under it; one request, in Chinese', n >= 7 && n === blocks && log.length === 1 && log[0].to === 'zh' && log[0].n === n, { n, blocks, log });
  ok('the translations are the service\'s answers, in the page, in Chinese, under their text', await fdoc(`(()=>{ const p=d.querySelector('p:not(.doc-meta):not(.doc-src):not(.doc-lic)'); return !!p.querySelector(':scope > .zt-src') && /^译:/.test(p.querySelector(':scope > .zt-tr').textContent) && p.querySelector('.zt-tr').lang==='zh-CN'; })()`));
  const b1 = await btn();
  ok('the button says 双语 and is on', b1.lbl === '双语' && b1.on, b1);
  ok('the contents of the page keep the headings as they were (the translation is not in them)', await J(`state.toc.length>0 && state.toc.every(x=>!/^译:/.test(x.text))`), await J(`state.toc`));

  await J(`document.querySelector('#readerTrans').click()`); await sleep(300);
  ok('a click: 译文 (the original is hidden, the translation alone)', (await btn()).lbl === '译文' && await fdoc(`d.documentElement.classList.contains('zt-only') && getComputedStyle(d.querySelector('.zt-src')).display==='none' && getComputedStyle(d.querySelector('.zt-tr')).display!=='none'`));
  await J(`document.querySelector('#readerTrans').click()`); await sleep(300);
  ok('a click: 原文 (the translation is hidden)', (await btn()).lbl === '原文' && await fdoc(`getComputedStyle(d.querySelector('.zt-tr')).display==='none' && getComputedStyle(d.querySelector('.zt-src')).display!=='none'`));
  await J(`document.querySelector('#readerTrans').click()`); await sleep(300);
  ok('and round to 双语 again, without another request', (await btn()).lbl === '双语' && (await get('/__trans_log')).length === 1);

  // ---- the same page again: nothing is asked, nothing is paid
  await shut();
  await open('local:en');
  const b2 = await btn();
  ok('the same article opened again: the button is "翻译" again (a new page)', !b2.hidden && b2.lbl === '翻译' && !b2.on && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === 0, b2);
  await J(`document.querySelector('#readerTrans').click()`); await waitFor(`TR.mode==='both'`); await sleep(300);
  ok('it is not asked again (the question once, the answer from this browser\'s cache): no dialog, the same translations, no new request', !(await J(`document.querySelector('#trDlg').open`)) && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === n && (await get('/__trans_log')).length === 1, await get('/__trans_log'));

  // ---- a page that is in the language already
  await shut();
  await open('local:zh');
  await J(`document.querySelector('#readerTrans').click()`); await sleep(500);
  ok('a Chinese article for a Chinese interface: "已经是你界面的语言了", no request', /已经是/.test(await toastText()) && (await get('/__trans_log')).length === 1 && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === 0);

  // ---- the allowance of the day is used up: what came is kept, the reason is told
  await fresh('limit');
  await J(`LS.set('trOk',1)`);
  await open('local:long');
  await J(`document.querySelector('#readerTrans').click()`); await waitFor(`!TR.busy && TR.seq>1 || TR.mode!=='off'`, 12000); await sleep(800);
  const lim = await btn();
  ok('a reader whose day is used up: the reason is told ("今天的翻译字数用完了"), the button is "翻译" again or shows what was translated before it stopped', /用完/.test(await toastText()) && (lim.lbl === '翻译' || lim.lbl === '双语'), { t: await toastText(), lim });

  // ---- the service has no allowance / is down
  for (const [mode, re] of [['quota', /额度/], ['fail', /暂时不可用/]]) {
    await fresh(mode); await J(`LS.set('trOk',1)`);
    await open('local:en');
    await J(`document.querySelector('#readerTrans').click()`); await sleep(1500);
    ok(`the service says "${mode}": the reader is told, nothing is half done`, re.test(await toastText()) && (await btn()).lbl === '翻译' && (await fdoc(`d.querySelectorAll('.zt-tr').length`)) === 0, { t: await toastText() });
  }

  // ---- not set up: no button
  await fresh('off');
  await open('local:en');
  ok('the service is not set up: there is no button', (await btn()).hidden);

  // ---- an English interface: a Chinese article goes into English
  await fresh('ok', 'en');
  await J(`LS.set('trOk',1)`);
  await open('local:zh');
  const be = await btn();
  await J(`document.querySelector('#readerTrans').click()`); await waitFor(`TR.mode==='both'`);
  const loge = await get('/__trans_log');
  ok('an English interface: the button says "Translate" and a Chinese article is translated into English', be.lbl === 'Translate' && loge.length === 1 && loge[0].to === 'en' && (await fdoc(`/^EN:/.test(d.querySelector('.zt-tr').textContent) && d.querySelector('.zt-tr').lang==='en'`)), { be, loge });

  // ---- a phone: the bar has no room for one more button; a round button at the corner of the page translates
  await c.mobile(375, 812, 2);
  await fresh();
  await J(`LS.set('trOk',1)`);
  await open('local:en');
  const bar = await J(`(()=>{ const b=document.querySelector('#readerTrans'); const r=document.querySelector('.reader-bar').getBoundingClientRect(); const ids=[...document.querySelectorAll('.rb-right .rbtn')].filter(x=>x.offsetParent!==null).map(x=>x.id); return {shown:getComputedStyle(b).display!=='none', ids, right:Math.round(Math.max(...[...document.querySelectorAll('.rb-right .rbtn')].filter(x=>x.offsetParent!==null).map(x=>x.getBoundingClientRect().right))), vw:innerWidth}; })()`);
  ok('a phone: the bar is as it was (no translate button in it, it fits the screen)', !bar.shown && !bar.ids.includes('readerTrans') && bar.right <= bar.vw, bar);
  await waitFor(`!document.querySelector('#trFab').hidden`);
  const fab = await J(`(()=>{ const f=document.querySelector('#trFab'), r=f.getBoundingClientRect(), pill=document.querySelector('#rBook').getBoundingClientRect(); return {shown:getComputedStyle(f).display!=='none', w:Math.round(r.width), h:Math.round(r.height), right:Math.round(r.right), left:Math.round(r.left), pillRight:Math.round(pill.right), vw:innerWidth}; })()`);
  ok('a phone: a round button at the corner of the page (the text has no "Aa" panel any more), at least 44 px, inside the screen and beside the bar of the letters', fab.shown && fab.w >= 44 && fab.h >= 44 && fab.right <= fab.vw && fab.left >= fab.pillRight, fab);
  await J(`document.querySelector('#trFab').click()`); await waitFor(`TR.mode==='both'`);
  ok('it translates the page at once (no menu: the menu is for a book)', (await fdoc(`d.querySelectorAll('.zt-tr').length`)) >= 7 && (await J(`document.querySelector('#trMenu').hidden`)), await get('/__trans_log'));
  await c.desktop(1280, 900, 1);

  ok('no script errors in the whole run', errs.length === 0, errs);
  await get('/__trans?mode=ok&reset=1');
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
