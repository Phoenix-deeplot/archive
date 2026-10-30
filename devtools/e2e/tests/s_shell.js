// e2e: the new shell (?shell=2). A phone: a bottom bar, ONE strip of sections (a swipe moves along it), a filter panel, a "+" sheet, the collections as a chip, the side list as "me" (the player no longer covers it);
// wide screens: the side list can be hidden, sort / language / view beside the list. Without the switch nothing changes.
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  const c = await connect(9444);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plStop,idb,addCollection,loadAll,render,openReader}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fresh = async (flag = '&shell=2', lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang + flag, 1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 2800);
  };
  const rect = sel => J(`(()=>{ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), r:Math.round(r.right), b:Math.round(r.bottom), d:getComputedStyle(e).display}; })()`);
  const swipe = async (x1, x2, y = 560) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] }); for (let i = 1; i <= 6; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y }] }); await sleep(12); } await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(900); };
  const active = () => J(`[...document.querySelectorAll('#cats .cat-btn')].filter(b=>b.getAttribute('aria-current')==='true').map(b=>b.textContent.trim().replace(/\\d+$/,'')).join()`);
  const library = async () => {
    await J(`(async()=>{ const cid=addCollection('我的合集'); const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'摘要',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',collection:cid,...extra});
      await idb.put(mk('local:m',{type:'md',filename:'m.md',title:'甲：有目录的文章',added:300,data:'# 甲\\n\\n## 第一节\\n\\n'+'正文。'.repeat(120)})); await loadAll(); render(); })()`);
    await sleep(600);
  };
  writeDir(); await get('/__listen?mode=ok&reset=1');

  // ================================================ A. a phone, the new shell
  await c.mobile(375, 812, 2);
  await fresh();
  const A = await J(`({shell:document.body.classList.contains('shell2'), ph:document.body.classList.contains('sh-phone'), stored:LS.get('shell',''), url:location.search})`);
  ok('?shell=2 switches the new shell on (kept in this browser, the address is cleaned)', A.shell && A.ph && A.stored === '2' && !/shell=/.test(A.url), A);
  const tb = await rect('#tabbar'), tbs = await J(`[...document.querySelectorAll('#tabbar button')].map(b=>({t:b.textContent.trim(), h:Math.round(b.getBoundingClientRect().height), on:b.getAttribute('aria-pressed')}))`);
  ok('a bottom bar: my shelf | + | discover, fixed at the bottom of the screen, every button at least 44 px, the shelf is the one that is on', tb.d === 'grid' && tb.b === 812 && tb.h >= 56 && tbs.map(x => x.t).join('|') === '我的书架||发现世界' && tbs.every(x => x.h >= 44) && tbs[0].on === 'true' && tbs[2].on === 'false', [tb, tbs]);
  const tbar = await J(`({me:getComputedStyle(document.querySelector('#meBtn')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, add:getComputedStyle(document.querySelector('#addBtn')).display, note:getComputedStyle(document.querySelector('#noteBtn')).display, fab:getComputedStyle(document.querySelector('#noteFab')).display, sort:!!document.querySelector('.toolbar #sort'), h:Math.round(document.querySelector('.top').getBoundingClientRect().height)})`);
  ok('the top bar is the "me" button and the search; the add, note and subscribe buttons, the old menu button, the round note button are gone (they are behind the +)', tbar.me !== 'none' && tbar.menu === 'none' && tbar.add === 'none' && tbar.note === 'none' && tbar.fab === 'none' && !tbar.sort, tbar);
  const strip = await J(`(()=>{ const st=document.querySelector('#stripIn'), cs=[...document.querySelectorAll('#stripIn #cats .cat-btn')]; return {inStrip:!!document.querySelector('#stripIn > #cats'), chips:cs.map(b=>b.textContent.trim().replace(/\\d+$/,'')), h:Math.min(...cs.map(b=>Math.round(b.getBoundingClientRect().height))), ox:getComputedStyle(st).overflowX, on:cs.filter(b=>b.getAttribute('aria-current')==='true').length, dots:cs.some(b=>b.querySelector('.dot') && getComputedStyle(b.querySelector('.dot')).display!=='none')}; })()`);
  ok('the sections of the shelf are ONE strip under the search: a chip each, at least 40 px high, scrolling sideways, the open one is dark', strip.inStrip && strip.chips.slice(0, 3).join('|') === '全部|精选|书籍' && strip.h >= 40 && strip.ox === 'auto' && strip.on === 1 && !strip.dots, strip);
  ok('the side list does not hold them any more on a phone (the list of the shelf is not there: the page is the list)', (await rect('.side-scroll')).d === 'none');

  // the filter panel
  await J(`document.querySelector('#flBtn').click()`); await sleep(400);
  const fl = await J(`(()=>{ const p=document.querySelector('#flPanel'), h=s=>Math.round(document.querySelector(s).getBoundingClientRect().height); return {open:!p.hidden, sort:h('#flSort #sort'), lang:h('#flLang #langFilter'), view:h('#flView #viewBtn'), tags:document.querySelectorAll('#flTag .tag, #flTag button').length>0, tagRow:!document.querySelector('#flTagRow').hidden, topbarHas:!!document.querySelector('.toolbar #sort'), exp:document.querySelector('#flBtn').getAttribute('aria-expanded'), inside:document.querySelector('.top').contains(p)}; })()`);
  ok('"筛选" opens a panel under the strip with the sort, the language of the content, cards / rows (each at least 44 px) and the tags', fl.open && fl.sort >= 44 && fl.lang >= 44 && fl.view >= 44 && fl.tagRow && fl.exp === 'true' && fl.inside, fl);
  await J(`(()=>{ const s=document.querySelector('#sort'); s.value='title'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await sleep(400);
  ok('the controls in the panel are the same ones as before: a sort chosen there sorts the list', (await J(`state.sort`)) === 'title' && (await J(`!document.querySelector('#flPanel').hidden`)));
  ok('no filter is on: the button has no number', !(await J(`!!document.querySelector('#flBtn .fl-n')`)));
  await J(`document.querySelector('#langFilter [data-lf="zh"]').click()`); await sleep(500);
  ok('the language of the content is chosen: the button says 1 (and the panel stays open)', (await J(`(document.querySelector('#flBtn .fl-n')||{}).textContent`)) === '1' && (await J(`!document.querySelector('#flPanel').hidden`)));
  await J(`document.querySelector('#langFilter [data-lf="all"]').click()`); await sleep(400);
  await J(`document.querySelector('#grid').click()`); await sleep(300);
  ok('a tap on the page closes the panel', await J(`document.querySelector('#flPanel').hidden && document.querySelector('#flBtn').getAttribute('aria-expanded')==='false'`));

  // the + sheet
  await J(`document.querySelector('#tbPlus').click()`); await sleep(400);
  const pl = await J(`({open:document.querySelector('#plusDlg').open, items:[...document.querySelectorAll('#plusDlg [data-plus]')].filter(b=>!b.hidden).map(b=>b.textContent.trim()), hs:[...document.querySelectorAll('#plusDlg [data-plus]')].filter(b=>!b.hidden).map(b=>Math.round(b.getBoundingClientRect().height))})`);
  ok('"+" opens a sheet from the bottom: add a file, write a note, submit to the directory (and "follow a site" where there is a feed service), cancel; every row at least 44 px', pl.open && pl.items.includes('添加文件') && pl.items.includes('写笔记') && pl.items.includes('收录到公共目录') && pl.items.includes('取消') && pl.hs.every(h => h >= 44), pl);
  await J(`document.querySelector('#plusDlg [data-plus="files"]').click()`); await sleep(500);
  ok('"添加文件" closes the sheet and opens the add window', await J(`!document.querySelector('#plusDlg').open && !!document.querySelector('dialog[open]')`));
  await J(`document.querySelector('dialog[open]').close()`);

  // the collections: a chip at the end of the strip
  await library();
  const col0 = await J(`({vis:!document.querySelector('#colChip').hidden, text:document.querySelector('#colChip').textContent, inStrip:document.querySelector('#colChip').parentElement.id, oldRow:getComputedStyle(document.querySelector('#colRow')).display})`);
  ok('collections: a chip "合集 ▾" at the end of the strip (the old row of the dropdown is gone)', col0.vis && col0.text === '合集 ▾' && col0.inStrip === 'stripIn' && col0.oldRow === 'none', col0);
  await J(`document.querySelector('#colChip').click()`); await sleep(400);
  const col1 = await J(`({open:!document.querySelector('#colPop').hidden, items:[...document.querySelectorAll('#colPop [data-colnav]')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|')})`);
  ok('a tap opens the list of the collections under the strip', col1.open && /我的合集/.test(col1.items), col1);
  await J(`[...document.querySelectorAll('#colPop [data-colnav]')].find(b=>/我的合集/.test(b.textContent)).click()`); await sleep(600);
  const col2 = await J(`({closed:document.querySelector('#colPop').hidden, text:document.querySelector('#colChip').textContent, on:document.querySelector('#colChip').classList.contains('on'), col:state.col})`);
  ok('choosing one closes the list; the chip says which collection it is (and is dark: a tap lets you change it)', col2.closed && /^合集：我的合集 ▾✕$/.test(col2.text) && col2.on && col2.col !== 'all', col2);
  await J(`document.querySelector('#colChip').click()`); await sleep(300);
  await J(`document.querySelector('#colPop [data-colnav="all"]').click()`); await sleep(500);
  ok('"全部" in the list takes the choice back', (await J(`state.col`)) === 'all' && (await J(`document.querySelector('#colChip').textContent`)) === '合集 ▾');
  await J(`document.querySelector('#colChip').click()`); await sleep(300);
  await J(`[...document.querySelectorAll('#colPop [data-colnav]')].find(b=>/我的合集/.test(b.textContent)).click()`); await sleep(500);
  ok('the tag has a cross (at least 24 px): ONE tap on it takes the collection back, the list does not open', await J(`!!document.querySelector('#colChip [data-colclear]') && document.querySelector('#colChip [data-colclear]').getBoundingClientRect().width>=24`));
  await J(`document.querySelector('#colChip [data-colclear]').click()`); await sleep(600);
  ok('... and it does: all of the shelf again, the tag is "合集 ▾", the list stays closed', (await J(`state.col`)) === 'all' && (await J(`document.querySelector('#colChip').textContent`)) === '合集 ▾' && (await J(`document.querySelector('#colPop').hidden`)));

  // the discover space
  await J(`document.querySelector('#tabbar [data-space="dir"]').click()`); await sleep(2500);
  const dsp = await J(`({sp:state.space, on:[...document.querySelectorAll('#tabbar button')].map(b=>b.getAttribute('aria-pressed')).join(), chips:[...document.querySelectorAll('#stripIn #cats .cat-btn')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|'), ph:document.body.classList.contains('sh-phone'), chip:document.querySelector('#colChip').hidden})`);
  ok('the bottom bar switches to the discover space; the strip is its sections: 发现 | 热榜 | 今日听什么 | 全部 | …', dsp.sp === 'dir' && dsp.on === 'false,,true' || (dsp.sp === 'dir' && /^发现\|热榜\|今日听什么\|精选图书\|全部/.test(dsp.chips) && dsp.chip), dsp);
  ok('the strip begins with 发现 | 热榜 | 今日听什么 | 精选图书 | 全部', /^发现\|热榜\|今日听什么\|精选图书\|全部/.test(dsp.chips), dsp.chips);
  ok('the collections chip is for the shelf only', dsp.chip === true);
  const a0 = await active();
  await swipe(300, 90);
  const a1 = await active();
  await swipe(90, 300);
  const a2 = await active();
  ok('a swipe to the left moves to the next section of the strip (发现 → 热榜), to the right back; the left list does not come out', a0 === '发现' && a1 === '热榜' && a2 === '发现' && !(await J(`document.body.classList.contains('drawer')`)), [a0, a1, a2]);
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.includes('全部')).click()`); await sleep(1500);
  const dir = await J(`({inPanel:!!document.querySelector('#flDir > #dirBar'), barHidden:document.querySelector('#dirBar').hidden, vis:getComputedStyle(document.querySelector('#flBtn')).display})`);
  ok('the whole list of the directory: its own filters (the dropdown, the columns / platforms, the tabs) are behind "筛选" too', dir.inPanel && !dir.barHidden && dir.vis !== 'none', dir);
  await J(`document.querySelector('#flBtn').click()`); await sleep(400);
  ok('... and the panel shows them together with the sort and the language of the content', await J(`(()=>{ const p=document.querySelector('#flPanel'); return !p.hidden && !!p.querySelector('#dTabs') && getComputedStyle(p.querySelector('#dTabs')).display!=='none' && !!p.querySelector('#sort') && p.getBoundingClientRect().height>200; })()`));
  await J(`document.querySelector('#flBtn').click()`); await sleep(200);

  // the player and the bar: the player sits above the bar; the list of "me" is not covered
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.includes('今日听什么')).click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await sleep(600);
  ok('the listening page has no filter button (it has its own controls)', (await rect('#flBtn')).d === 'none');
  await J(`document.querySelector('#lpRoot .ls-main').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`); await sleep(500);
  const pb = await rect('#player'), tb2 = await rect('#tabbar');
  ok('the player bar sits right above the bottom bar (not over it, not under it)', Math.abs(pb.b - tb2.y) <= 1 && pb.h >= 70, [pb, tb2]);
  const lastRow = await J(`(()=>{ const rows=document.querySelectorAll('#lpRoot .ls-row'); return Math.round(rows[rows.length-1].getBoundingClientRect().bottom); })()`);
  await J(`window.scrollTo(0, document.documentElement.scrollHeight)`); await sleep(500);
  ok('the end of a page is not under the two bars', await J(`(()=>{ const m=document.querySelector('#moreRow, #lpRoot .lp-end, #lpRoot .ls-rows'); const pt=document.querySelector('#player').getBoundingClientRect().top; const rows=document.querySelectorAll('#lpRoot .ls-row'); return Math.round(rows[rows.length-1].getBoundingClientRect().bottom) <= pt + 2 || document.documentElement.scrollHeight>innerHeight; })()`));
  await J(`document.querySelector('#meBtn').click()`); await sleep(700);
  const me = await J(`(()=>{ const q=s=>document.querySelector(s), r=e=>e.getBoundingClientRect(), side=r(q('.side')), lang=r(q('#langBtn')), th=r(q('#themeBtn')), at=(b)=>document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {open:document.body.classList.contains('drawer'), sideH:Math.round(side.height), vh:innerHeight, me:getComputedStyle(q('#meBox')).display, login:!!q('#meLogin'), langIn:!!at(lang).closest('.side'), themeIn:!!at(th).closest('.side'), langB:Math.round(lang.bottom), spaceHidden:getComputedStyle(q('#spaceSwitch')).display, scroll:getComputedStyle(q('.side-scroll')).display, side:q('.side').getBoundingClientRect().left>=0}; })()`);
  ok('"me" (the old side list) opens from the left: a card for the account that is to come, then the settings; the language and theme buttons are NOT under the player', me.open && me.me === 'flex' && me.login && me.langIn && me.themeIn && me.langB <= me.vh && me.spaceHidden === 'none' && me.scroll === 'none', me);
  ok('it is as tall as the screen (the settings are at its foot, in reach)', me.sideH >= me.vh - 2, me);
  await J(`document.querySelector('#meLogin').click()`); await sleep(400);
  ok('"登录 / 注册" says kindly that sign-in is not there yet and nothing is lost', /登录功能还在准备中/.test(await J(`document.querySelector('#toastMsg').textContent`)), await J(`document.querySelector('#toastMsg').textContent`));
  await J(`document.querySelector('#langBtn').click()`); await sleep(1200);
  ok('the language button of "me" works (it switches the page to the other language)', (await J(`state.lang`)) === 'en' && (await J(`document.querySelector('#tabbar').textContent.replace(/\\s+/g,' ')`)).includes('Discover'), await J(`document.querySelector('#tabbar').textContent`));
  await J(`document.querySelector('#langBtn').click()`); await sleep(800);
  await J(`document.body.classList.remove('drawer'); plStop()`);

  // a text: the bars give way
  await J(`openReader('local:m')`); await sleep(1500);
  ok('reading a text: the bottom bar is gone', (await rect('#tabbar')).d === 'none');
  await J(`document.querySelector('#readerBack').click()`); await sleep(600);
  ok('and back after it', (await rect('#tabbar')).d === 'grid');

  // the old shell and the way back
  await J(`location.href=location.pathname+'?shell=1'`); await sleep(3000);
  const old = await J(`({ph:document.body.classList.contains('sh-phone'), tab:getComputedStyle(document.querySelector('#tabbar')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, sort:!!document.querySelector('.toolbar #sort'), cats:!!document.querySelector('.side-scroll > #cats'), me:getComputedStyle(document.querySelector('#meBox')).display, stored:LS.get('shell','')})`);
  ok('?shell=1 is the old page again: no bar, the menu button, the sort in the top bar, the sections in the side list, no "me" card', !old.ph && old.tab === 'none' && old.menu !== 'none' && old.sort && old.cats && old.me === 'none' && old.stored === '1', old);

  // ================================================ B. the old shell: the player did cover the side list
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(2200);
  await J(`document.body.classList.add('drawer')`); await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await sleep(500);
  await J(`document.querySelector('#lpRoot .ls-main').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`); await sleep(500);
  await J(`document.querySelector('#menuBtn').click()`); await sleep(700);
  const old2 = await J(`(()=>{ const b=document.querySelector('#langBtn').getBoundingClientRect(), e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {open:document.body.classList.contains('drawer'), langIn:!!(e && e.closest('.side')), bottom:Math.round(b.bottom)}; })()`);
  ok('the old page too: with a song playing the language and theme buttons of the side list are not under the player any more', old2.open && old2.langIn, old2);
  await J(`document.body.classList.remove('drawer'); plStop()`);

  // ================================================ C. wide screens
  await c.desktop(1280, 900, 1);
  await fresh('&shell=2');
  const w = await J(`({ph:document.body.classList.contains('sh-phone'), shell:document.body.classList.contains('shell2'), tab:getComputedStyle(document.querySelector('#tabbar')).display, toggle:getComputedStyle(document.querySelector('#sideToggle')).display, me:getComputedStyle(document.querySelector('#meBox')).display, sideW:Math.round(document.querySelector('.side').getBoundingClientRect().width), inVh:!!document.querySelector('#vhCtl #ctlBox #sort') && !!document.querySelector('#vhCtl #ctlBox #langFilter') && !!document.querySelector('#vhCtl #ctlBox #viewBtn'), inTop:!!document.querySelector('.toolbar #sort'), strip:getComputedStyle(document.querySelector('#strip')).display})`);
  ok('a wide screen: no bottom bar and no strip (the side list stays), a button to hide the side list, the "me" card on top of it, sort / language / view beside the list instead of in the top bar', !w.ph && w.shell && w.tab === 'none' && w.toggle !== 'none' && w.me === 'flex' && w.sideW > 200 && w.inVh && !w.inTop && w.strip === 'none', w);
  const cr = await J(`(()=>{ const c=document.querySelector('#ctlBox').getBoundingClientRect(), h=document.querySelector('#viewTitle').getBoundingClientRect(); return {ctlLeft:Math.round(c.left), titleRight:Math.round(h.right), ctlRight:Math.round(c.right), ctlTop:Math.round(c.top), titleTop:Math.round(h.top), iw:innerWidth}; })()`);
  ok('they are on the right of the page head, level with it', cr.ctlLeft > cr.titleRight && cr.ctlRight > cr.iw - 80 && Math.abs(cr.ctlTop - cr.titleTop) < 140, cr);
  await J(`document.querySelector('#sideToggle').click()`); await sleep(500);
  const off = await J(`({side:getComputedStyle(document.querySelector('.side')).display, cols:getComputedStyle(document.querySelector('.app')).gridTemplateColumns.split(' ').length, stored:LS.get('sideOff',0), exp:document.querySelector('#sideToggle').getAttribute('aria-expanded'), main:Math.round(document.querySelector('.main').getBoundingClientRect().left)})`);
  ok('the button hides the side list: the page takes the whole width, the choice is kept', off.side === 'none' && off.cols === 1 && off.stored === 1 && off.exp === 'false' && off.main < 20, off);
  await c.goto(BASE, 2500);
  ok('after a reload it is still hidden', await J(`getComputedStyle(document.querySelector('.side')).display==='none'`));
  await J(`document.querySelector('#sideToggle').click()`); await sleep(400);
  ok('and the button brings it back', await J(`getComputedStyle(document.querySelector('.side')).display!=='none' && LS.get('sideOff',0)===0`));
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(2200);
  await J(`document.querySelector('#cats [data-dbrowse="1"], #cats [data-dtype="all"]').click()`); await sleep(1200);
  const dl = await J(`({inLine:!!document.querySelector('#dirBar .dir-line #ctlBox #sort'), barVisible:!document.querySelector('#dirBar').hidden, level:(()=>{ const a=document.querySelector('#dirBar .dir-line').getBoundingClientRect(), b=document.querySelector('#ctlBox').getBoundingClientRect(); return Math.abs(a.top-b.top)<30 && b.right>a.right-20; })()})`);
  ok('the whole list of the directory: sort / language / view are on the row of the tabs (the column | platform choice), at its right end', dl.inLine && dl.barVisible && dl.level, dl);
  await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await sleep(400);
  ok('the listening page keeps its own controls only (the others are not shown)', (await rect('#ctlBox')).d === 'none');
  await J(`document.querySelector('#meLogin').click()`); await sleep(300);
  ok('"登录 / 注册" on a wide screen too', /登录功能还在准备中/.test(await J(`document.querySelector('#toastMsg').textContent`)));

  // without the switch: nothing is different
  await fresh('');
  const o3 = await J(`({shell:document.body.classList.contains('shell2'), tog:getComputedStyle(document.querySelector('#sideToggle')).display, me:getComputedStyle(document.querySelector('#meBox')).display, inTop:!!document.querySelector('.toolbar #sort'), vh:getComputedStyle(document.querySelector('#vhCtl')).display})`);
  ok('without ?shell=2 nothing is different: no hide button, no "me" card, the controls in the top bar', !o3.shell && o3.tog === 'none' && o3.me === 'none' && o3.inTop && o3.vh === 'none', o3);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
