// e2e: the language follows the system: "自动 / Auto" (the default), an explicit 中文 / EN wins and is remembered, the system's language changing while the page is open is followed
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const settle = await require('../settle')(c);
  await c.desktop(1280, 900, 1);
  const J = expr => c.js(`(()=>{ const {state,LS}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const intro = () => J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`);
  await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 0); await settle(1200);
  const ua = await J(`navigator.userAgent`);
  const system = async lang => { await c.send('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: lang }); };
  const view = () => J(`({html:document.documentElement.lang, auto:state.langAuto, lang:state.lang, stored:localStorage.getItem('archive.lang'), pressed:[...document.querySelectorAll('.side-foot .seg button')].map(b=>(b.dataset.lang||'btn')+':'+(b.dataset.lang ? b.getAttribute('aria-pressed') : b.textContent)).join(','), autoLabel:document.querySelector('[data-lang="auto"]').textContent, nav:navigator.languages.join()})`);
  const load = async (url) => { if (url === 'about:blank') { await c.goto(url, 300); return; } await c.goto(url || BASE, 0); await settle(2200); };

  // 1. nothing chosen: the system's language
  await system('en-US,en'); await c.clearSite('http://127.0.0.1:8820'); await load('about:blank'); await load(); await intro(); await load();
  let v = await view();
  ok('an English system: the page is English, "Auto" is the choice that is on, the one button says EN, nothing is stored', v.html === 'en' && v.auto === true && v.stored === null && v.pressed === 'auto:true,btn:EN' && v.autoLabel === 'Auto', v);
  await system('zh-CN,zh'); await load();
  v = await view();
  ok('a Chinese system: the page is Chinese ("自动" is on, the button says 中), with nothing stored', v.html === 'zh-CN' && v.lang === 'zh' && v.auto === true && v.stored === null && v.pressed === 'auto:true,btn:中' && v.autoLabel === '自动', v);
  await system('ja-JP,ja'); await load();
  v = await view();
  ok('another language: English (the page has no other)', v.lang === 'en' && v.auto === true, v);
  await system('zh-TW,zh,en'); await load();
  v = await view();
  ok('traditional Chinese counts as Chinese (the page has one Chinese)', v.lang === 'zh' && v.auto === true, v);

  // 2. a choice wins and is remembered
  await system('zh-CN,zh'); await load();
  await J(`document.querySelector('#langBtn').click()`); await sleep(400);
  v = await view();
  ok('the one button is tapped on a Chinese system: English, remembered, "Auto" is off, the button says EN', v.lang === 'en' && v.auto === false && v.stored === '"en"' && v.pressed === 'auto:false,btn:EN', v);
  await load();
  v = await view();
  ok('after a reload it is still English although the system says Chinese', v.lang === 'en' && v.auto === false, v);
  // 3. back to automatic
  await J(`document.querySelector('[data-lang="auto"]').click()`); await sleep(400);
  v = await view();
  ok('"Auto" again: the system’s language (Chinese), the stored choice is removed', v.lang === 'zh' && v.auto === true && v.stored === null && v.pressed === 'auto:true,btn:中', v);

  // 4. the system's language changes while the page is open
  const setNav = langs => J(`Object.defineProperty(navigator,'languages',{get:()=>${JSON.stringify(langs)},configurable:true}); window.dispatchEvent(new Event('languagechange')); 1`);
  await setNav(['en-US']); await sleep(400);
  v = await view();
  ok('while the page is open the system changes to English: the page follows (it is on "Auto")', v.lang === 'en' && v.auto === true && v.html === 'en', v);
  await setNav(['zh-CN']); await sleep(400);
  v = await view();
  ok('and back to Chinese', v.lang === 'zh' && v.auto === true, v);
  await J(`document.querySelector('#langBtn').click()`); await sleep(300); await J(`document.querySelector('#langBtn').click()`); await sleep(300);          // (EN and back: an explicit 中)
  ok('two taps on the button: 中 again, as a choice (stored), not automatic', (await view()).lang === 'zh' && (await view()).auto === false && (await view()).stored === '"zh"', await view());
  await setNav(['en-US']); await sleep(400);
  v = await view();
  ok('with an explicit choice a change of the system does nothing', v.lang === 'zh' && v.auto === false, v);

  // 5. a link with ?lang= is a choice
  await system('en-US,en'); await c.clearSite('http://127.0.0.1:8820'); await load('about:blank'); await load(); await intro(); await load(BASE + '?lang=zh');
  v = await view();
  ok('a link with ?lang=zh opens in Chinese on an English system, as a choice (remembered, not automatic)', v.lang === 'zh' && v.auto === false && v.stored === '"zh"', v);

  // 6. the rest of the page follows the language at once
  await J(`document.querySelector('[data-lang="auto"]').click()`); await sleep(400);
  ok('the title of the page and its buttons are in the system’s language after "Auto"', await J(`state.lang==='en' && /Add|Submit/.test(document.querySelector('#addLbl').textContent) && document.documentElement.lang==='en'`));
  await c.send('Emulation.setUserAgentOverride', { userAgent: '' });                                          // (no override any more)

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
