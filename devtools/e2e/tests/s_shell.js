// e2e: the new shell (?shell=2). A phone (a window up to 980 px): a bottom bar, ONE strip of sections (a swipe moves along it), a row of tools, a filter panel, a "+" sheet, the collections as a chip, the side list as the settings (the player no longer covers it), the language in the top bar, no sign-in;
// themes: THREE (经典, 深色, 云红), a button beside the settings; a theme changes the colours, the font of the headings, the line of the icons and the corners together; the bottom bar in the colour of the theme; "写笔记": a pill in the corner on a wide screen, a row of the + on a phone, in both spaces
// wide screens: the side list can be hidden, sort / language / view / tags beside the list (my shelf has no list of titles and no tags in the side list). The new shell is the default (a home-screen app on an iPhone cannot take a switch in the address); ?shell=1 is the old page.
const { connect, sleep } = require('../cdp');
const { writeDir } = require('../dir_fixture.js');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const get = p => fetch(SVC + p).then(r => r.json());

(async () => {
  const c = await connect(9444, { newShell: true });
  const settle = await require('../settle')(c);
  c.autoDialog(true, []);
  const errs = [];
  c.on(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(JSON.stringify(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || m.params.exceptionDetails.text).slice(0, 300)); });
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,LS,pl,plAudio,plStop,idb,addCollection,loadAll,render,openReader}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const waitFor = async (expr, ms = 9000) => { const t0 = Date.now(); for (;;) { const v = await J(expr); if (v || Date.now() - t0 > ms) return v; await sleep(120); } };
  const fresh = async (flag = '&shell=2', lang = 'zh') => {
    await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE + '?lang=' + lang + flag, 0); await settle(1500);
    await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver','"2026-10-22"'); localStorage.setItem('archive.dirIntroOff','1'); localStorage.setItem('archive.guideTipOff','1')`);
    await c.goto(BASE, 0); await settle(2800);
  };
  const rect = sel => J(`(()=>{ const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:Math.round(r.left), y:Math.round(r.top), w:Math.round(r.width), h:Math.round(r.height), r:Math.round(r.right), b:Math.round(r.bottom), d:getComputedStyle(e).display}; })()`);
  const bar = () => J(`(()=>{ const r=s=>{ const e=document.querySelector(s), b=e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)].join('/'); }; return {top:r('.top'), strip:r('#strip'), tools:r('#stTools'), head:r('.view-head'), pos:getComputedStyle(document.querySelector('.top')).position}; })()`);
  const accent = () => J(`(()=>{ const p=document.createElement('i'); p.style.color='var(--accent)'; document.body.append(p); const c=getComputedStyle(p).color; p.remove(); return c; })()`);
  const tabcol = () => J(`({on:getComputedStyle(document.querySelector('#tabbar [aria-pressed="true"]')).color, off:getComputedStyle(document.querySelector('#tabbar [data-space="dir"]')).color, plus:getComputedStyle(document.querySelector('#tbPlus')).backgroundColor, w:getComputedStyle(document.querySelector('#tabbar [aria-pressed="true"]')).fontWeight})`);
  const swipe = async (x1, x2, y = 560) => { await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y }] }); for (let i = 1; i <= 6; i++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y }] }); await sleep(12); } await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await settle(900); };
  const active = () => J(`[...document.querySelectorAll('#cats .cat-btn')].filter(b=>b.getAttribute('aria-current')==='true').map(b=>b.textContent.trim().replace(/\\d+$/,'')).join()`);
  const library = async () => {
    await J(`(async()=>{ const cid=addCollection('我的合集'); const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'摘要',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-01-01',added:1,featured:false,hidden:false,cover:'',collection:cid,...extra});
      await idb.put(mk('local:m',{type:'md',filename:'m.md',title:'甲：有目录的文章',added:300,data:'# 甲\\n\\n## 第一节\\n\\n'+'正文。'.repeat(120)})); await loadAll(); render(); })()`);
    await settle(600);
  };
  writeDir(); await get('/__listen?mode=ok&reset=1');

  // ================================================ A. a phone, the new shell
  await c.mobile(375, 812, 2);
  await fresh();
  const A = await J(`({shell:document.body.classList.contains('shell2'), ph:document.body.classList.contains('sh-phone'), stored:LS.get('shell',''), url:location.search})`);
  ok('?shell=2 switches the new shell on (kept in this browser, the address is cleaned)', A.shell && A.ph && A.stored === '2' && !/shell=/.test(A.url), A);
  const tb = await rect('#tabbar'), tbs = await J(`[...document.querySelectorAll('#tabbar button')].map(b=>({t:b.textContent.trim(), h:Math.round(b.getBoundingClientRect().height), on:b.getAttribute('aria-pressed')}))`);
  ok('a bottom bar: my shelf | + | discover, fixed at the bottom of the screen, every button at least 44 px, the shelf is the one that is on', tb.d === 'grid' && tb.b === 812 && tb.h >= 56 && tbs.map(x => x.t).join('|') === '我的书架||发现世界' && tbs.every(x => x.h >= 44) && tbs[0].on === 'true' && tbs[2].on === 'false', [tb, tbs]);
  const tbar = await J(`({set:getComputedStyle(document.querySelector('#setBtn')).display, lang:getComputedStyle(document.querySelector('#langTop')).display, langTxt:document.querySelector('#langTop').textContent, menu:getComputedStyle(document.querySelector('#menuBtn')).display, add:getComputedStyle(document.querySelector('#addBtn')).display, note:getComputedStyle(document.querySelector('#noteBtn')).display, fab:getComputedStyle(document.querySelector('#noteFab')).display, sort:!!document.querySelector('.toolbar #sort'), login:!!document.querySelector('#meBox, #meLogin, #meBtn'), h:Math.round(document.querySelector('.top').getBoundingClientRect().height)})`);
  ok('the top bar is the search, the language (中 / EN) and the settings; the add, note and subscribe buttons, the old menu button, the round note button are gone (they are behind the +); there is no sign-in card anywhere', tbar.set !== 'none' && tbar.lang !== 'none' && tbar.langTxt === '中' && tbar.menu === 'none' && tbar.add === 'none' && tbar.note === 'none' && tbar.fab === 'none' && !tbar.sort && !tbar.login, tbar);
  const strip = await J(`(()=>{ const st=document.querySelector('#stripIn'), cs=[...document.querySelectorAll('#stripIn #cats .cat-btn')]; return {inStrip:!!document.querySelector('#stripIn > #cats'), chips:cs.map(b=>b.textContent.trim().replace(/\\d+$/,'')), h:Math.min(...cs.map(b=>Math.round(b.getBoundingClientRect().height))), ox:getComputedStyle(st).overflowX, on:cs.filter(b=>b.getAttribute('aria-current')==='true').length, dots:cs.some(b=>b.querySelector('.dot') && getComputedStyle(b.querySelector('.dot')).display!=='none')}; })()`);
  ok('the sections of the shelf are ONE strip under the search: a chip each, at least 40 px high, scrolling sideways, the open one is dark', strip.inStrip && strip.chips.slice(0, 3).join('|') === '全部|精选|书籍' && strip.h >= 40 && strip.ox === 'auto' && strip.on === 1 && !strip.dots, strip);
  ok('the side list does not hold them any more on a phone (the list of the shelf is not there: the page is the list)', (await rect('.side-scroll')).d === 'none');
  const tl = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {y:Math.round(b.top), h:Math.round(b.height)}; }; return {sum:document.querySelector('#flSum').textContent, tools:r('#stTools'), strip:r('#strip'), inTools:document.querySelector('#flBtn').parentElement.id}; })()`);
  ok('under the strip a row of tools: what the list is sorted by and how it is shown ("最近添加 · 卡片") on the left, "筛选" on the right', tl.sum === '最近添加 · 卡片' && tl.inTools === 'stTools' && tl.tools.y >= tl.strip.y + tl.strip.h - 2 && tl.tools.h >= 36, tl);
  const b0 = await bar();
  ok('the bar (top bar, strip, row of tools) is fixed to the top of the screen', b0.pos === 'sticky', b0);
  const tc0 = await tabcol(), ac0 = await accent();
  ok('the bottom bar: the one that is on has the colour of the theme (bold, a small bar over it), the other one is grey, the + has the colour of the theme too', tc0.on === ac0 && tc0.off !== ac0 && tc0.plus === ac0 && +tc0.w >= 600, [tc0, ac0]);
  await J(`document.querySelector('#themeTop').click()`); await sleep(300);
  const look = () => J(`(()=>{ const cs=s=>getComputedStyle(document.querySelector(s)); return {th:document.documentElement.getAttribute('data-theme'), stored:LS.get('theme',''), accent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase(), bg:getComputedStyle(document.body).backgroundColor, font:cs('#viewTitle').fontFamily, stroke:cs('#tabbar .icon').strokeWidth, card:cs('#grid .card').borderTopLeftRadius, btn:document.querySelector('#themeBtn').textContent, open:!document.querySelector('#themePop').hidden}; })()`);
  const thp = await J(`({open:!document.querySelector('#themePop').hidden, rows:document.querySelectorAll('#themePop .fl-row').length, chips:[...document.querySelectorAll('#themePop button')].map(b=>b.textContent.trim()).join('|'), h:Math.min(...[...document.querySelectorAll('#themePop button')].map(b=>Math.round(b.getBoundingClientRect().height))), on:[...document.querySelectorAll('#themePop [aria-pressed="true"]')].map(b=>b.textContent.trim()).join('|'), set:getComputedStyle(document.querySelector('#setBtn')).display, th:getComputedStyle(document.querySelector('#themeTop')).display})`);
  ok('a theme button sits beside the settings: it opens ONE row of three themes (经典 | 深色 | 云红), each at least 44 px high; the one on screen is marked', thp.open && thp.rows === 1 && thp.chips === '经典|深色|云红' && thp.h >= 44 && thp.on === '经典' && thp.set !== 'none' && thp.th !== 'none', thp);
  const l0 = await look();
  await J(`document.querySelector('[data-thset="cloud"]').click()`); await settle(400);
  const l1 = await look(), tc1 = await tabcol(), ac1 = await accent();
  ok('"云红" is a whole theme at once: a cool white, a red accent, sans-serif headings (not the serif), a heavier line for the icons, rounder cards; kept in this browser; the settings say so; the panel stays open to see it', l1.th === 'cloud' && l1.stored === 'cloud' && l1.open && l1.accent === '#d8363a' && l1.bg === 'rgb(246, 247, 249)' && l1.font !== l0.font && !/Noto Serif/.test(l1.font) && /Noto Serif/.test(l0.font) && parseFloat(l1.stroke) > parseFloat(l0.stroke) && parseFloat(l1.card) > parseFloat(l0.card) && l1.btn === '主题：云红', [l0, l1]);
  ok('the bottom bar follows the theme: the one that is on and the + are red now', ac1 !== ac0 && tc1.on === ac1 && tc1.plus === ac1, [tc1, ac1]);
  await J(`document.querySelector('[data-thset="dark"]').click()`); await settle(400);
  const l2 = await look();
  ok('"深色": dark colours, and the serif and the thin icons of the classic theme again', l2.th === 'dark' && l2.accent === '#5cc2b1' && l2.bg === 'rgb(18, 22, 25)' && l2.font === l0.font && l2.stroke === l0.stroke && l2.btn === '主题：深色', l2);
  await J(`document.querySelector('[data-thset="light"]').click()`); await sleep(300);
  await J(`document.querySelector('#grid').click()`); await sleep(300);
  const l3 = await look();
  ok('"经典" is the first page again (colours, font, icons, corners as at the start); a tap on the page closes the panel', l3.th === 'light' && !l3.open && l3.accent === l0.accent && l3.bg === l0.bg && l3.font === l0.font && l3.stroke === l0.stroke && l3.card === l0.card && l3.btn === '主题：经典', [l0, l3]);
  await J(`state.theme='auto'; LS.set('theme','auto'); document.documentElement.removeAttribute('data-theme')`);

  // the filter panel
  await J(`document.querySelector('#flBtn').click()`); await settle(400);
  const fl = await J(`(()=>{ const p=document.querySelector('#flPanel'), h=s=>Math.round(document.querySelector(s).getBoundingClientRect().height); return {open:!p.hidden, sort:h('#flSort #sort'), lang:h('#flLang #langFilter'), view:h('#flView #viewBtn'), tags:document.querySelectorAll('#flTag .tag, #flTag button').length>0, tagRow:!document.querySelector('#flTagRow').hidden, topbarHas:!!document.querySelector('.toolbar #sort'), exp:document.querySelector('#flBtn').getAttribute('aria-expanded'), inside:document.querySelector('.top').contains(p)}; })()`);
  ok('"筛选" opens a panel under the strip with the sort, the language of the content, cards / rows (each at least 44 px) and the tags', fl.open && fl.sort >= 44 && fl.lang >= 44 && fl.view >= 44 && fl.tagRow && fl.exp === 'true' && fl.inside, fl);
  await J(`(()=>{ const s=document.querySelector('#sort'); s.value='title'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`); await settle(400);
  ok('the controls in the panel are the same ones as before: a sort chosen there sorts the list', (await J(`state.sort`)) === 'title' && (await J(`!document.querySelector('#flPanel').hidden`)));
  ok('no filter is on: the button has no number', !(await J(`!!document.querySelector('#flBtn .fl-n')`)));
  await J(`document.querySelector('#langFilter [data-lf="zh"]').click()`); await settle(500);
  ok('the language of the content is chosen: the button says 1 (and the panel stays open)', (await J(`(document.querySelector('#flBtn .fl-n')||{}).textContent`)) === '1' && (await J(`!document.querySelector('#flPanel').hidden`)));
  await J(`document.querySelector('#langFilter [data-lf="all"]').click()`); await settle(400);
  await J(`document.querySelector('#grid').click()`); await sleep(300);
  ok('a tap on the page closes the panel', await J(`document.querySelector('#flPanel').hidden && document.querySelector('#flBtn').getAttribute('aria-expanded')==='false'`));

  // the + sheet
  await J(`document.querySelector('#tbPlus').click()`); await settle(400);
  const pl = await J(`({open:document.querySelector('#plusDlg').open, items:[...document.querySelectorAll('#plusDlg [data-plus]')].filter(b=>!b.hidden).map(b=>b.textContent.trim()), hs:[...document.querySelectorAll('#plusDlg [data-plus]')].filter(b=>!b.hidden).map(b=>Math.round(b.getBoundingClientRect().height))})`);
  ok('"+" opens a sheet from the bottom: add a file, write a note, submit to the directory (and "follow a site" where there is a feed service), cancel; every row at least 44 px', pl.open && pl.items.includes('添加文件') && pl.items.includes('写笔记') && pl.items.includes('收录到公共目录') && pl.items.includes('取消') && pl.hs.every(h => h >= 44), pl);
  await J(`document.querySelector('#plusDlg [data-plus="files"]').click()`); await settle(500);
  ok('"添加文件" closes the sheet and opens the add window', await J(`!document.querySelector('#plusDlg').open && !!document.querySelector('dialog[open]')`));
  await J(`document.querySelector('dialog[open]').close()`);

  // the collections: a chip at the end of the strip
  await library();
  const col0 = await J(`({vis:!document.querySelector('#colChip').hidden, text:document.querySelector('#colChip').textContent, inStrip:document.querySelector('#colChip').parentElement.id, oldRow:getComputedStyle(document.querySelector('#colRow')).display})`);
  ok('collections: a chip "合集 ▾" at the end of the strip (the old row of the dropdown is gone)', col0.vis && col0.text === '合集 ▾' && col0.inStrip === 'stripIn' && col0.oldRow === 'none', col0);
  await J(`document.querySelector('#colChip').click()`); await settle(400);
  const col1 = await J(`({open:!document.querySelector('#colPop').hidden, items:[...document.querySelectorAll('#colPop [data-colnav]')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|')})`);
  ok('a tap opens the list of the collections under the strip', col1.open && /我的合集/.test(col1.items), col1);
  await J(`[...document.querySelectorAll('#colPop [data-colnav]')].find(b=>/我的合集/.test(b.textContent)).click()`); await settle(600);
  const col2 = await J(`({closed:document.querySelector('#colPop').hidden, text:document.querySelector('#colChip').textContent, on:document.querySelector('#colChip').classList.contains('on'), col:state.col})`);
  ok('choosing one closes the list; the chip says which collection it is (and is dark: a tap lets you change it)', col2.closed && /^合集：我的合集 ▾✕$/.test(col2.text) && col2.on && col2.col !== 'all', col2);
  await J(`document.querySelector('#colChip').click()`); await sleep(300);
  await J(`document.querySelector('#colPop [data-colnav="all"]').click()`); await settle(500);
  ok('"全部" in the list takes the choice back', (await J(`state.col`)) === 'all' && (await J(`document.querySelector('#colChip').textContent`)) === '合集 ▾');
  await J(`document.querySelector('#colChip').click()`); await sleep(300);
  await J(`[...document.querySelectorAll('#colPop [data-colnav]')].find(b=>/我的合集/.test(b.textContent)).click()`); await settle(500);
  ok('the tag has a cross (at least 24 px): ONE tap on it takes the collection back, the list does not open', await J(`!!document.querySelector('#colChip [data-colclear]') && document.querySelector('#colChip [data-colclear]').getBoundingClientRect().width>=24`));
  await J(`document.querySelector('#colChip [data-colclear]').click()`); await settle(600);
  ok('... and it does: all of the shelf again, the tag is "合集 ▾", the list stays closed', (await J(`state.col`)) === 'all' && (await J(`document.querySelector('#colChip').textContent`)) === '合集 ▾' && (await J(`document.querySelector('#colPop').hidden`)));

  // the discover space
  await J(`document.querySelector('#tabbar [data-space="dir"]').click()`); await settle(2500);
  const dsp = await J(`({sp:state.space, on:[...document.querySelectorAll('#tabbar button')].map(b=>b.getAttribute('aria-pressed')).join(), chips:[...document.querySelectorAll('#stripIn #cats .cat-btn')].map(b=>b.textContent.trim().replace(/\\d+$/,'')).join('|'), ph:document.body.classList.contains('sh-phone'), chip:document.querySelector('#colChip').hidden})`);
  ok('the bottom bar switches to the discover space; the strip is its sections: 发现 | 热榜 | 今日听什么 | 全部 | …', dsp.sp === 'dir' && dsp.on === 'false,,true' || (dsp.sp === 'dir' && /^发现\|热榜\|今日听什么\|精选图书\|全部/.test(dsp.chips) && dsp.chip), dsp);
  ok('the strip begins with 发现 | 热榜 | 今日听什么 | 精选图书 | 全部', /^发现\|热榜\|今日听什么\|精选图书\|全部/.test(dsp.chips), dsp.chips);
  ok('the collections chip is for the shelf only', dsp.chip === true);
  ok('the names are the owner’s: 精选图书 | 精选文章 | 看什么 are in the strip, there is no 笔记 in the public space, nothing is called 公共目录 on the bottom bar', dsp.chips.includes('精选文章') && dsp.chips.includes('看什么') && !dsp.chips.includes('笔记') && !/公共目录/.test(await J(`document.querySelector('#tabbar').textContent`)), dsp.chips);
  const b1 = await bar();
  ok('from my shelf to the discover space the strip does not move or change height; the row of tools is gone (the public space has its own row under the strip), so the head is shorter', b1.strip === b0.strip && b1.tools === '0/0' && parseInt(b1.top.split('/')[1]) < parseInt(b0.top.split('/')[1]), [b0, b1]);
  const a0 = await active();
  await swipe(300, 90);
  const a1 = await active();
  await swipe(90, 300);
  const a2 = await active();
  ok('a swipe to the left moves to the next section of the strip (发现 → 热榜), to the right back; the left list does not come out', a0 === '发现' && a1 === '热榜' && a2 === '发现' && !(await J(`document.body.classList.contains('drawer')`)), [a0, a1, a2]);
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.includes('全部')).click()`); await settle(1500);
  const dir = await J(`({inMain:document.querySelector('#dirBar').parentElement===document.querySelector('.main'), barHidden:document.querySelector('#dirBar').hidden, flBtn:getComputedStyle(document.querySelector('#flBtn')).display, tools:getComputedStyle(document.querySelector('#stTools')).display, panel:getComputedStyle(document.querySelector('#flPanel')).display})`);
  ok('the whole list of the directory: its row (the switch, the tabs, the tools) is on the page under the strip, there is no "筛选" button and no panel', dir.inMain && !dir.barHidden && dir.tools === 'none' && dir.panel === 'none', dir);
  const b2 = await bar();
  ok('... and the head is as short as on the discover page', b2.strip === b0.strip && b2.tools === '0/0' && b2.top === b1.top, [b1, b2]);
  ok('... the row holds the switch, the tabs that slide sideways, and at the right end the language, the sort button and the cards / rows button', await J(`(()=>{ const b=document.querySelector('#dirBar'), t=b.querySelector('#dTabs'); return !!b.querySelector('#dTabsMode') && getComputedStyle(t).overflowX==='auto' && [...b.querySelectorAll('.dir-line #ctlBox > *')].filter(e=>e.offsetParent!==null).map(e=>e.id).join()==='langFilter,sortBtn,viewBtn'; })()`));

  // the player and the bar: the player sits above the bar; the list of "me" is not covered
  await J(`[...document.querySelectorAll('#cats .cat-btn')].find(b=>b.textContent.includes('今日听什么')).click()`); await waitFor(`document.querySelector('#lpRoot .lp-forrows .ls-row')`, 12000); await J(`document.querySelector('[data-lp-tab="chart"]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await settle(600);
  ok('the listening page has no row of tools at all (it has its own controls)', await J(`getComputedStyle(document.querySelector('#stTools')).display==='none'`));
  const b3 = await bar();
  ok('the listening page: no row of tools, no empty room: the head is as short as on the discover page', b3.strip === b0.strip && b3.tools === '0/0' && b3.top === b1.top, [b1, b3]);
  await J(`document.querySelector('#lpRoot .ls-main').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`); await settle(500);
  const pb = await rect('#player'), tb2 = await rect('#tabbar');
  ok('the player bar sits right above the bottom bar (not over it, not under it)', Math.abs(pb.b - tb2.y) <= 1 && pb.h >= 70, [pb, tb2]);
  const lastRow = await J(`(()=>{ const rows=document.querySelectorAll('#lpRoot .ls-row'); return Math.round(rows[rows.length-1].getBoundingClientRect().bottom); })()`);
  await J(`window.scrollTo(0, document.documentElement.scrollHeight)`); await settle(500);
  ok('the end of a page is not under the two bars', await J(`(()=>{ const m=document.querySelector('#moreRow, #lpRoot .lp-end, #lpRoot .ls-rows'); const pt=document.querySelector('#player').getBoundingClientRect().top; const rows=document.querySelectorAll('#lpRoot .ls-row'); return Math.round(rows[rows.length-1].getBoundingClientRect().bottom) <= pt + 2 || document.documentElement.scrollHeight>innerHeight; })()`));
  await J(`document.querySelector('#setBtn').click()`); await settle(700);
  const me = await J(`(()=>{ const q=s=>document.querySelector(s), r=e=>e.getBoundingClientRect(), side=r(q('.side')), th=r(q('#themeBtn')), bk=r(q('#bkBtn')), at=(b)=>document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {open:document.body.classList.contains('drawer'), sideH:Math.round(side.height), vh:innerHeight, title:(q('.set-title')||{}).textContent, noLogin:!q('#meBox') && !q('#meLogin'), themeIn:!!at(th).closest('.side'), bkIn:!!at(bk).closest('.side'), themeB:Math.round(th.bottom), langSeg:getComputedStyle(q('.side-foot .seg')).display, spaceHidden:getComputedStyle(q('#spaceSwitch')).display, scroll:getComputedStyle(q('.side-scroll')).display}; })()`);
  ok('"设置" (the old side list) opens from the left: the title, then the buttons (backup, sync, theme, install, about); no sign-in card; the language is not here (it is in the top bar); the buttons are NOT under the player', me.open && me.title === '设置' && me.noLogin && me.themeIn && me.bkIn && me.themeB <= me.vh && me.spaceHidden === 'none' && me.scroll === 'none' && me.langSeg === 'none', me);
  ok('it is as tall as the screen', me.sideH >= me.vh - 2, me);
  await J(`document.body.classList.remove('drawer')`);
  const lt0 = await rect('#langTop');
  await J(`document.querySelector('#langTop').click()`); await settle(1200);
  const lt1 = await rect('#langTop');
  ok('the language button of the top bar works: it switches the page to the other language, says EN, and does not move or change size', (await J(`state.lang`)) === 'en' && (await J(`document.querySelector('#tabbar').textContent.replace(/\\s+/g,' ')`)).includes('Explore') && (await J(`document.querySelector('#langTop').textContent`)) === 'EN' && lt0.x === lt1.x && lt0.w === lt1.w && lt0.y === lt1.y, [lt0, lt1]);
  const b4 = await bar();
  ok('and the bar is as high in English as it was in Chinese', b4.top === b3.top && b4.strip === b3.strip && b4.tools === b3.tools, [b3, b4]);
  await J(`document.querySelector('#langTop').click()`); await settle(800);
  await J(`document.body.classList.remove('drawer'); plStop()`);

  // the + sheet in the discover space
  await J(`document.querySelector('#tbPlus').click()`); await settle(400);
  const pd = await J(`({sp:state.space, items:[...document.querySelectorAll('#plusDlg [data-plus]')].filter(b=>!b.hidden).map(b=>b.textContent.trim())})`);
  ok('"+" in the discover space has the same rows as on my shelf, 写笔记 among them', pd.sp === 'dir' && pd.items.includes('添加文件') && pd.items.includes('写笔记') && pd.items.includes('收录到公共目录') && pd.items.includes('取消'), pd);
  await J(`document.querySelector('#plusDlg [data-plus="note"]').click()`); await settle(900);
  ok('"写笔记" there takes you to my shelf (a note belongs to it) and opens the editor', await J(`state.space==='mine' && document.body.classList.contains('noting')`), await J(`({sp:state.space, c:document.body.className})`));
  await J(`document.querySelector('#neBack').click()`); await settle(600);
  ok('the editor closes again (nothing was written, nothing is kept)', await J(`!document.body.classList.contains('noting')`));

  // a text: the bars give way
  await J(`openReader('local:m')`); await settle(1500);
  ok('reading a text: the bottom bar is gone', (await rect('#tabbar')).d === 'none');
  await J(`document.querySelector('#readerBack').click()`); await settle(600);
  ok('and back after it', (await rect('#tabbar')).d === 'grid');

  // the old shell and the way back
  await J(`location.href=location.pathname+'?shell=1'`); await settle(3000);
  const old = await J(`({ph:document.body.classList.contains('sh-phone'), tab:getComputedStyle(document.querySelector('#tabbar')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, sort:!!document.querySelector('.toolbar #sort'), cats:!!document.querySelector('.side-scroll > #cats'), me:!!document.querySelector('#meBox'), stored:LS.get('shell','')})`);
  ok('?shell=1 is the old page again: no bar, the menu button, the sort in the top bar, the sections in the side list (and no sign-in card in it either)', !old.ph && old.tab === 'none' && old.menu !== 'none' && old.sort && old.cats && !old.me && old.stored === '1', old);

  // ================================================ B. the old shell: the player did cover the side list
  await J(`document.querySelector('[data-space="dir"]').click()`); await settle(2200);
  await J(`document.body.classList.add('drawer')`); await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await settle(500);
  await J(`document.querySelector('#lpRoot .ls-main').click()`); await waitFor(`!plAudio.paused && plAudio.currentTime>0.3`); await settle(500);
  await J(`document.querySelector('#menuBtn').click()`); await settle(700);
  const old2 = await J(`(()=>{ const b=document.querySelector('#langBtn').getBoundingClientRect(), e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2); return {open:document.body.classList.contains('drawer'), langIn:!!(e && e.closest('.side')), bottom:Math.round(b.bottom)}; })()`);
  ok('the old page too: with a song playing the language and theme buttons of the side list are not under the player any more', old2.open && old2.langIn, old2);
  await J(`document.body.classList.remove('drawer'); plStop()`);

  // ================================================ C. wide screens
  await c.desktop(1280, 900, 1);
  await fresh('&shell=2');
  const w = await J(`({ph:document.body.classList.contains('sh-phone'), shell:document.body.classList.contains('shell2'), tab:getComputedStyle(document.querySelector('#tabbar')).display, toggle:getComputedStyle(document.querySelector('#sideToggle')).display, me:!!document.querySelector('#meBox'), sideW:Math.round(document.querySelector('.side').getBoundingClientRect().width), inVh:!!document.querySelector('#vhCtl #ctlBox #sort') && !!document.querySelector('#vhCtl #ctlBox #langFilter') && !!document.querySelector('#vhCtl #ctlBox #viewBtn'), inTop:!!document.querySelector('.toolbar #sort'), strip:getComputedStyle(document.querySelector('#strip')).display})`);
  ok('a wide screen: no bottom bar and no strip (the side list stays), a button to hide the side list (no sign-in card), sort / language / view beside the list instead of in the top bar', !w.ph && w.shell && w.tab === 'none' && w.toggle !== 'none' && !w.me && w.sideW > 200 && w.inVh && !w.inTop && w.strip === 'none', w);
  const cr = await J(`(()=>{ const c=document.querySelector('#ctlBox').getBoundingClientRect(), h=document.querySelector('#viewTitle').getBoundingClientRect(); return {ctlLeft:Math.round(c.left), titleRight:Math.round(h.right), ctlRight:Math.round(c.right), ctlTop:Math.round(c.top), titleTop:Math.round(h.top), iw:innerWidth}; })()`);
  ok('they are on the right of the page head, level with it', cr.ctlLeft > cr.titleRight && cr.ctlRight > cr.iw - 80 && Math.abs(cr.ctlTop - cr.titleTop) < 140, cr);
  const h0 = await rect('.view-head');
  const sh = await J(`({dir:getComputedStyle(document.querySelector('#dir')).display, lab:getComputedStyle(document.querySelector('.side-scroll > .dir-label')).display, tagIn:document.querySelector('#tagbox').parentElement.id, cats:document.querySelectorAll('.side-scroll #cats .cat-btn').length, tagBtn:getComputedStyle(document.querySelector('#tagBtn')).display, tagTxt:document.querySelector('#tagBtn').textContent})`);
  ok('my shelf on a wide screen: the side list has the sections only (no list of titles, no tags); "标签 ▾" sits with the sort / language / view', sh.dir === 'none' && sh.lab === 'none' && sh.tagIn === 'tagPop' && sh.cats >= 3 && sh.tagBtn !== 'none' && /^标签/.test(sh.tagTxt), sh);
  await J(`document.querySelector('#tagBtn').click()`); await sleep(300);
  const tp = await J(`(()=>{ const p=document.querySelector('#tagPop'), b=document.querySelector('#tagBtn').getBoundingClientRect(), r=p.getBoundingClientRect(); return {open:!p.hidden, chips:p.querySelectorAll('[data-tag]').length, below:r.top>=b.bottom-1, inside:r.right<=innerWidth && r.left>=0, exp:document.querySelector('#tagBtn').getAttribute('aria-expanded')}; })()`);
  ok('it opens a small panel with the tags under the button', tp.open && tp.chips >= 3 && tp.below && tp.inside && tp.exp === 'true', tp);
  const tg = await J(`document.querySelector('#tagPop [data-tag]').dataset.tag`);
  await J(`document.querySelector('#tagPop [data-tag]').click()`); await settle(500);
  const tq = await J(`({tag:state.tag, shut:document.querySelector('#tagPop').hidden, chip:!!document.querySelector('#viewSub [data-clear="tag"]'), btn:document.querySelector('#tagBtn').textContent, cards:document.querySelectorAll('#grid .card').length})`);
  ok('choosing a tag filters the list, closes the panel, the button says which tag, and the heading has a chip to take it back', tq.tag === tg && tq.shut && tq.chip && tq.btn.includes('#') && tq.cards >= 1, tq);
  await J(`document.querySelector('#viewSub [data-clear="tag"]').click()`); await settle(400);
  ok('the chip takes the tag back', (await J(`state.tag`)) === '' && (await J(`document.querySelector('#tagBtn').textContent`)) === '标签 ▾');
  await J(`document.querySelector('#sideToggle').click()`); await settle(500);
  const off = await J(`({side:getComputedStyle(document.querySelector('.side')).display, cols:getComputedStyle(document.querySelector('.app')).gridTemplateColumns.split(' ').length, stored:LS.get('sideOff',0), exp:document.querySelector('#sideToggle').getAttribute('aria-expanded'), main:Math.round(document.querySelector('.main').getBoundingClientRect().left)})`);
  ok('the button hides the side list: the page takes the whole width, the choice is kept', off.side === 'none' && off.cols === 1 && off.stored === 1 && off.exp === 'false' && off.main < 20, off);
  await c.goto(BASE, 0); await settle(2500);
  ok('after a reload it is still hidden', await J(`getComputedStyle(document.querySelector('.side')).display==='none'`));
  await J(`document.querySelector('#sideToggle').click()`); await settle(400);
  ok('and the button brings it back', await J(`getComputedStyle(document.querySelector('.side')).display!=='none' && LS.get('sideOff',0)===0`));
  const fb = await J(`(()=>{ const f=document.querySelector('#noteFab'), r=f.getBoundingClientRect(), cs=getComputedStyle(f); return {pen:getComputedStyle(document.querySelector('#noteBtn')).display, d:cs.display, txt:f.textContent.trim(), w:Math.round(r.width), h:Math.round(r.height), right:Math.round(innerWidth-r.right), bottom:Math.round(innerHeight-r.bottom), bg:cs.backgroundColor}; })()`), acd = await accent();
  ok('a wide screen: the pen in the top bar is gone (it said the same as "添加"); "写笔记" is a pill in the corner of the page, the colour of the theme, with its name', fb.pen === 'none' && fb.d !== 'none' && fb.txt === '写笔记' && fb.w >= 100 && fb.h >= 44 && fb.right <= 60 && fb.bottom <= 60 && fb.bg === acd, [fb, acd]);
  const pb0 = await J(`({d:getComputedStyle(document.querySelector('#themeBtn')).display, txt:document.querySelector('#themeBtn').textContent, inSide:!!document.querySelector('#themeBtn').closest('.side-foot'), top:getComputedStyle(document.querySelector('#themeTop')).display, pal:!!document.querySelector('#paletteBtn')})`);
  ok('a wide screen: "主题：经典" in the foot of the side list is the one button for the theme (no separate palette button); the top bar has no theme button', pb0.d !== 'none' && pb0.txt === '主题：经典' && pb0.inSide && pb0.top === 'none' && !pb0.pal, pb0);
  await J(`document.querySelector('[data-space="dir"]').click()`); await settle(2200);
  await J(`document.querySelector('#cats [data-dbrowse="1"], #cats [data-dtype="all"]').click()`); await settle(1200);
  const dl = await J(`({inLine:!!document.querySelector('#dirBar .dir-line #ctlBox #sort'), barVisible:!document.querySelector('#dirBar').hidden, level:(()=>{ const a=document.querySelector('#dirBar .dir-line').getBoundingClientRect(), b=document.querySelector('#ctlBox').getBoundingClientRect(); return Math.abs(a.top-b.top)<30 && b.right>a.right-20; })()})`);
  ok('the whole list of the directory: sort / language / view are on the row of the tabs (the column | platform choice), at its right end', dl.inLine && dl.barVisible && dl.level, dl);
  const h1 = await rect('.view-head');
  ok('the heading of the page is as high on the directory as on my shelf (the list under it does not jump when the section changes)', Math.abs(h1.h - h0.h) <= 1, [h0, h1]);
  ok('the public space keeps its list of shelves in the side list (a filter of its own)', (await J(`getComputedStyle(document.querySelector('#dir')).display`)) !== 'none');
  await J(`document.querySelector('#cats [data-dlisten]').click()`); await waitFor(`document.querySelector('#lpRoot .ls-row')`, 12000); await settle(400);
  ok('the listening page keeps its own controls only (the others are not shown)', (await rect('#ctlBox')).d === 'none');

  ok('the pill is there in the discover space too', await J(`getComputedStyle(document.querySelector('#noteFab')).display!=='none'`));
  await J(`document.querySelector('#noteFab').click()`); await settle(900);
  ok('and takes you to my shelf and opens the editor', await J(`state.space==='mine' && document.body.classList.contains('noting')`), await J(`({sp:state.space, c:document.body.className})`));
  await J(`document.querySelector('#neBack').click()`); await settle(600);
  const ring = [];
  for (let k = 0; k < 3; k++) { await J(`document.querySelector('#themeBtn').click()`); await settle(400); ring.push(await J(`document.documentElement.getAttribute('data-theme')+' '+document.querySelector('#themeBtn').textContent`)); }
  ok('the button goes round the three themes (深色, 云红, 经典); the page changes with each', ring.join('|') === 'dark 主题：深色|cloud 主题：云红|light 主题：经典', ring);
  await J(`document.querySelector('#themeBtn').click()`); await J(`document.querySelector('#themeBtn').click()`); await settle(400);
  ok('云红 again (kept in this browser)', await J(`document.documentElement.getAttribute('data-theme')==='cloud' && LS.get('theme','')==='cloud'`));
  await c.goto(BASE, 0); await settle(2500);
  ok('after a reload it is still 云红', await J(`document.documentElement.getAttribute('data-theme')==='cloud'`));
  await J(`location.href=location.pathname+'?shell=1'`); await settle(3000);
  ok('?shell=1 (the old page) knows two themes only: it shows 云红 as the light one; the choice waits in the browser', await J(`document.documentElement.getAttribute('data-theme')==='light' && LS.get('theme','')==='cloud' && document.querySelector('#themeBtn').textContent==='主题：浅色'`));

  // the new shell is the default: no switch in the address (a home-screen app on an iPhone has no address to type it in)
  await fresh('');
  const o3 = await J(`({shell:document.body.classList.contains('shell2'), tog:getComputedStyle(document.querySelector('#sideToggle')).display, me:!!document.querySelector('#meBox'), inVh:!!document.querySelector('#vhCtl #ctlBox #sort'), inTop:!!document.querySelector('.toolbar #sort'), pen:getComputedStyle(document.querySelector('#noteBtn')).display, fab:getComputedStyle(document.querySelector('#noteFab')).display, stored:LS.get('shell','none')})`);
  ok('without any switch the new shell is on: the hide button, sort / language / view beside the list, the pill in the corner, no pen in the top bar; nothing is stored', o3.shell && o3.tog !== 'none' && !o3.me && o3.inVh && !o3.inTop && o3.pen === 'none' && o3.fab !== 'none' && o3.stored === 'none', o3);
  await c.mobile(390, 844, 2);
  await fresh('');
  const o4 = await J(`({ph:document.body.classList.contains('sh-phone'), shell:document.body.classList.contains('shell2'), tab:getComputedStyle(document.querySelector('#tabbar')).display, strip:getComputedStyle(document.querySelector('#strip')).display, tools:getComputedStyle(document.querySelector('#stTools')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, over:document.documentElement.scrollWidth>innerWidth})`);
  ok('a phone of 390 px (an iPhone 12) without any switch: the bottom bar, the strip and the row of tools; no menu button of the old page; no sideways scroll', o4.ph && o4.shell && o4.tab === 'grid' && o4.strip !== 'none' && o4.tools !== 'none' && o4.menu === 'none' && !o4.over, o4);
  await c.mobile(375, 667, 2);
  await fresh('&shell=1');
  const o5 = await J(`({ph:document.body.classList.contains('sh-phone'), tab:getComputedStyle(document.querySelector('#tabbar')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, stored:LS.get('shell','')})`);
  ok('?shell=1 brings the old page back (the menu button, no bottom bar) and the browser keeps the choice', !o5.ph && o5.tab === 'none' && o5.menu !== 'none' && o5.stored === '1', o5);

  // ================================================ D. a window of 800 px is a phone too (the old side list slides out up to 980 px)
  await c.desktop(800, 900, 1);
  await fresh('&shell=2');
  const m8 = await J(`({ph:document.body.classList.contains('sh-phone'), tab:getComputedStyle(document.querySelector('#tabbar')).display, strip:getComputedStyle(document.querySelector('#strip')).display, tools:getComputedStyle(document.querySelector('#stTools')).display, set:getComputedStyle(document.querySelector('#setBtn')).display, menu:getComputedStyle(document.querySelector('#menuBtn')).display, over:document.documentElement.scrollWidth>innerWidth})`);
  ok('a window of 800 px has the phone’s bottom bar, strip, row of tools and settings button (and does not scroll sideways)', m8.ph && m8.tab === 'grid' && m8.strip !== 'none' && m8.tools !== 'none' && m8.set !== 'none' && m8.menu === 'none' && !m8.over, m8);

  ok('no script errors in the whole run', errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  c.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
