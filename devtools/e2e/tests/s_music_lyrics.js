// e2e: the words of a song in the "now playing" popup. A tab "歌词" beside the list when the song has words (they come with "resolve", or are asked for once when the popup is opened); a line sung now is lit and kept in the
// middle; a click on a line goes there; a song without words has no tab; the switch in the settings turns them off (and nothing is asked then); the Douyin chart (songs with no address) plays through "resolve".
// (demo app :8820, fake services :8840 and :8843; headless Edge)
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,render}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await J(expr); } catch (e) { /* the page is busy */ } if (v || Date.now() - t0 > ms) return v; await sleep(100); } };
  const svc = q => fetch(SVC + '/__listen?mode=ok&' + q).then(r => r.json());
  const log2 = () => fetch(SVC + '/__listen_log2').then(r => r.json());
  const fresh = async (q = 'v2=1') => {
    await svc('reset=1&' + q);
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=zh', 1200);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2500);
    await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
    await waitFor(`document.querySelector('#cats [data-dlisten]')`, 8000);
    await J(`document.querySelector('#cats [data-dlisten]').click()`);
    await waitFor(`document.querySelector('#lpRoot .lp-tabs') && document.querySelector('#lpRoot .lp-forrows .ls-row')`, 9000); await sleep(300);
  };
  const popup = async () => { await J(`document.querySelector('#player [data-pl="menu"]').click()`); await waitFor(`document.querySelector('#plDlg').open`, 3000); await sleep(250); };
  const popClose = () => J(`document.querySelector('#plDlg').open && document.querySelector('#plDlg').close()`);
  await c.desktop(1280, 900, 1);
  await fresh();

  // ------------------------------------------------ the Douyin chart: songs with no address
  await J(`window.scrollTo(0,0); document.querySelector('#lpRoot [data-lp-tab="chart"]').click()`); await sleep(500);
  const picks = await J(`[...document.querySelectorAll('#lpRoot .lp-cgs [data-lp-cgb]')].map(b=>b.dataset.lpCgb).join()`);
  ok('the charts of China: the Douyin chart is one of them (a service that knows the newer questions gives it)', /dy-hot/.test(picks), picks);
  await J(`document.querySelector('#lpRoot [data-lp-cgb="dy-hot"]').click()`);
  await waitFor(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length>=30`, 8000);
  const dy = await J(`({rows:document.querySelectorAll('#lpRoot .lp-rows .ls-row').length, first:document.querySelector('#lpRoot .lp-rows .ls-row .ls-t').textContent, nums:document.querySelector('#lpRoot .lp-rows .ls-n em').textContent, pv:document.querySelectorAll('#lpRoot .lp-rows .ls-pv').length, sub:(document.querySelector('#lpRoot .lp-sub')||{}).textContent})`);
  ok('its songs are rows with a place (no preview mark: a whole song is found when it is played)', dy.rows >= 30 && /Douyin Song 0/.test(dy.first) && dy.nums === '1' && dy.pv === 0 && /抖音/.test(dy.sub || ''), dy);
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row .ls-main').click()`);
  ok('a click plays the first one: the service is asked (resolve) and the bar plays what it found; the whole chart is the list of the bar', await waitFor(`pl.q.length>=40 && plAudio.currentTime>0.05 && pl.cands[0] && pl.cands[0].p==='bodian'`, 9000) && (await log2()).includes('resolve:Douyin Song 0'), [await J(`pl.q.length`), await log2()]);
  ok('the next song is found while this one plays (before it is needed): a second question goes out by itself', await waitFor(`1`, 100) && await (async () => { await J(`plAudio.currentTime=Math.max(0, plAudio.duration-9)`); await sleep(1500); return (await log2()).includes('resolve:Douyin Song 1'); })(), await log2());

  // ------------------------------------------------ the words
  await J(`plAudio.currentTime=0.1`);
  await popup();
  const tab = await J(`({hidden:document.querySelector('#plLyrTab').hidden, text:document.querySelector('#plLyrTab').textContent, first:document.querySelector('#plDlg .plp-qtab').textContent})`);
  ok('the popup of a song with words: the tabs “播放列表 | 歌词”', !tab.hidden && tab.text === '歌词' && tab.first === '播放列表', tab);
  await J(`document.querySelector('#plLyrTab').click()`); await sleep(300);
  const ly = await J(`({list:document.querySelector('#plList').hidden, pane:!document.querySelector('#plLyr').hidden, lines:[...document.querySelectorAll('#plLyr p')].map(p=>p.textContent), from:(document.querySelector('#plLyr small')||{}).textContent, sel:document.querySelector('#plLyrTab').getAttribute('aria-selected'), qn:document.querySelector('#plQn').hidden})`);
  ok('the words tab: the list is gone, four lines and where they come from; the choice is kept', ly.list && ly.pane && ly.lines.length === 4 && /First line/.test(ly.lines[0]) && /波点音乐/.test(ly.from) && ly.sel === 'true' && (await J(`LS.get('plQTab','q')`)) === 'lyr', ly);
  ok('the line that is sung now is lit (the first one at half a second) and, three seconds on, the second', await waitFor(`document.querySelector('#plLyr p.on') && document.querySelector('#plLyr p.on').textContent.startsWith('First')`, 4000) && await waitFor(`document.querySelector('#plLyr p.on') && document.querySelector('#plLyr p.on').textContent.startsWith('Second')`, 6000));
  await J(`document.querySelectorAll('#plLyr p')[3].click()`);
  ok('a click on a line goes there (the fourth is at nine seconds) and lights it', await waitFor(`plAudio.currentTime>=8.9 && document.querySelector('#plLyr p.on') && document.querySelector('#plLyr p.on').textContent.startsWith('Fourth')`, 4000), await J(`plAudio.currentTime`));
  await J(`document.querySelector('#plDlg [data-plq="q"]').click()`); await sleep(200);
  ok('the first tab brings the list back', await J(`!document.querySelector('#plList').hidden && document.querySelector('#plLyr').hidden && !document.querySelector('#plQn').hidden`));
  await J(`document.querySelector('#plDlg [data-plq="lyr"]').click()`); await sleep(200);

  // ------------------------------------------------ the switch
  await J(`document.querySelector('#plSetBtn').click()`); await sleep(300);
  ok('the settings have a switch “显示歌词”, on', await J(`!document.querySelector('#plLyrRow').hidden && document.querySelector('#plLyrSw').getAttribute('aria-checked')==='true' && /显示歌词/.test(document.querySelector('#plLyrRow').textContent)`));
  await J(`document.querySelector('#plLyrSw').click()`); await sleep(300);
  ok('switched off: no tab, the list is shown, the choice is kept', await J(`document.querySelector('#plLyrTab').hidden && !document.querySelector('#plList').hidden && document.querySelector('#plLyr').hidden && LS.get('plSet',{}).lyr===false`));
  await popClose(); await J(`document.querySelector('#plDlg [data-plp="collapse"]')`).catch(() => {});
  await J(`plAudio.pause()`);
  const n0 = (await log2()).length;
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row:nth-child(5) .ls-main').click()`);
  await waitFor(`plAudio.currentTime>0.05`, 8000); await popup(); await sleep(400);
  ok('with the words off the popup asks nothing and has no tab', (await log2()).filter(x => x === 'resolve:Douyin Song 4').length === 1 && await J(`document.querySelector('#plLyrTab').hidden`), await log2());
  await J(`document.querySelector('#plSetBtn').click()`); await sleep(200); await J(`document.querySelector('#plLyrSw').click()`); await sleep(300);
  ok('switched on again: the words are there (the song has them)', await J(`!document.querySelector('#plLyrTab').hidden`));
  await popClose();

  // ------------------------------------------------ a song without words
  await svc('v2=1&rs=nolyr');
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row:nth-child(7) .ls-main').click()`);
  await waitFor(`plAudio.currentTime>0.05 && pl.q[pl.i].endsWith(':dy:06')`, 8000);
  await popup(); await sleep(300);
  ok('a song the service has no words for: no tab, the list is shown', await J(`document.querySelector('#plLyrTab').hidden && !document.querySelector('#plList').hidden`));
  await popClose();

  // ------------------------------------------------ a song of an ordinary chart: the words are asked for when the popup is opened (once)
  await svc('v2=1&rs=ok');
  await J(`window.scrollTo(0,0); document.querySelector('#lpRoot [data-lp-cgb="hot-cn"]').click()`); await sleep(600);
  await waitFor(`document.querySelectorAll('#lpRoot .lp-rows .ls-row').length>=20`, 8000);
  const before = (await log2()).length;
  await J(`document.querySelector('#lpRoot .lp-rows .ls-row:nth-child(3) .ls-main').click()`);
  await waitFor(`plAudio.currentTime>0.05`, 8000);
  ok('a song that plays from a chart asks nothing by itself for words', (await log2()).length === before, (await log2()).slice(before));
  await popup(); await sleep(900);
  const asked = (await log2()).slice(before);
  ok('opening the popup asks once for its words, and the tab comes', asked.length === 1 && /^resolve:/.test(asked[0]) && await J(`!document.querySelector('#plLyrTab').hidden`), asked);
  await popClose(); await popup(); await sleep(500);
  ok('opening it again asks nothing more', (await log2()).slice(before).length === 1);
  await popClose();

  // ------------------------------------------------ the format
  const f = await J(`(()=>{ const L=window.__zt.lpLrc; return {a:L('[00:12.50]b\\n[00:01.00]a\\n[ti:x]\\n[00:30]c').map(l=>l.t+':'+l.x).join('|'), plain:L('one\\ntwo\\n\\nthree').map(l=>l.t+':'+l.x).join('|'), two:L('[00:01.00][00:20.00]chorus\\n[00:05.00]verse').map(l=>l.t+':'+l.x).join('|'), none:L('').length}; })()`);
  ok('the format: lines are put in the order of time, tags like [ti:] are dropped, plain text has no time, one line with two times is two lines', f.a === '1:a|12.5:b|30:c' && f.plain === '-1:one|-1:two|-1:three' && f.two === '1:chorus|5:verse|20:chorus' && f.none === 0, f);
  ok('no errors in the page', errs.length === 0, errs);
  console.log(`${pass} passed, ${fail} failed`);
  c.close();
})().catch(e => { console.log('CRASH', e && e.stack || e); process.exit(1); });
