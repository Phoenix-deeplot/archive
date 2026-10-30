// e2e: the Markdown note editor: opening, typing (real key events), list continuation, the toolbar, autosave, the preview, editing again, the reader, the back button,
// and a phone (tools above the keyboard, a tap on a tool keeps the keyboard up)
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

(async () => {
  const c = await connect(9444);
  const dialogs = c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,openNote,neSave,neClose,NE,openReader,neDeriveTitle,neTags}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`); await c.goto(BASE, 2500); };
  const type = text => c.send('Input.insertText', { text });
  const enter = async () => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const val = () => J(`document.querySelector('#neText').value`);
  const sel = (a, b) => J(`(()=>{ const ta=document.querySelector('#neText'); ta.focus(); ta.setSelectionRange(${a},${b}); })()`);
  const tool = k => J(`document.querySelector('#neTools [data-ne="${k}"]').click()`);
  const setText = async s => { await J(`(()=>{ const ta=document.querySelector('#neText'); ta.focus(); ta.select(); })()`); await c.send('Input.insertText', { text: s }); };
  const notes = () => J(`state.items.filter(x=>x.source==='local' && x.type==='md').map(x=>({id:x.id,title:x.title,data:x.data,kw:x.keywords,summary:x.summary,hash:x.hash,col:x.collection||''}))`);
  const rects = sels => J(`(${JSON.stringify(sels)}).map(s=>{ const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; })`);

  await c.desktop(1280, 900, 1);
  await fresh('zh');

  // ================================================ A. a computer
  const hdr = await J(`({btn:getComputedStyle(document.querySelector('#noteBtn')).display, fab:getComputedStyle(document.querySelector('#noteFab')).display})`);
  ok('computer: the pen is in the header, the round button is not shown', hdr.btn !== 'none' && hdr.fab === 'none', hdr);
  await J(`document.querySelector('#addBtn').click()`); await sleep(400);
  ok('the Add window offers "write a note"', await J(`!!document.querySelector('#addNote') && document.querySelector('#addNote').offsetParent!==null && /笔记/.test(document.querySelector('#addNote').textContent)`));
  await J(`document.querySelector('#addNote').click()`); await sleep(500);
  const o = await J(`({open:!document.querySelector('#noteEd').hidden, wide:document.querySelector('#noteEd').classList.contains('wide'), focus:document.activeElement.id, ph:document.querySelector('#neText').placeholder, tph:document.querySelector('#neTitle').placeholder,
    prev:!document.querySelector('#nePrev').hidden, pbtn:document.querySelector('#nePreviewBtn').hidden, dlg:document.querySelector('#addDlg').open, hist:history.state, tools:document.querySelectorAll('#neTools button').length})`);
  ok('the editor opens full screen over the page, closes the Add window, focuses the text', o.open && !o.dlg && o.focus === 'neText', o);
  ok('wide screen: the preview sits beside the text (no preview button), 14 tools, the hint in the empty text', o.wide && o.prev && o.pbtn && o.tools === 14 && /Markdown/.test(o.ph) && /第一行/.test(o.tph), o);
  ok('the back button has an entry to close (history state)', o.hist && o.hist.ne === 1, o.hist);

  // typing, with real keys
  await type('购物清单 #生活'); await enter();
  await type('- 苹果'); await enter();
  ok('Enter in a list starts the next item', (await val()) === '购物清单 #生活\n- 苹果\n- ', await val());
  await type('香蕉'); await enter(); await enter();
  ok('Enter on an empty item ends the list (the marker is taken away)', (await val()) === '购物清单 #生活\n- 苹果\n- 香蕉\n', JSON.stringify(await val()));
  await type('1. 一'); await enter(); await type('二'); await enter();
  ok('numbered lists count on', (await val()).endsWith('1. 一\n2. 二\n3. '), JSON.stringify(await val()));
  await enter(); await type('- [ ] 待办'); await enter();
  ok('a to-do item continues as a to-do item', (await val()).endsWith('- [ ] 待办\n- [ ] '), JSON.stringify(await val()));
  await enter();

  // the toolbar, on a fresh text
  await setText('hello world');
  await sel(6, 11); await tool('b');
  ok('bold wraps the selection and keeps it selected', await val() === 'hello **world**' && await J(`document.querySelector('#neText').selectionStart+','+document.querySelector('#neText').selectionEnd`) === '8,13', await val());
  await tool('b');
  ok('bold again takes the marks away', await val() === 'hello world', await val());
  await sel(0, 5); await tool('i'); await tool('s');
  ok('italic then strikethrough (the second goes inside the first, the selection is kept)', await val() === '*~~hello~~* world', await val());
  await setText('word'); await sel(2, 2); await tool('b');
  ok('no selection: the caret lands between the marks', await val() === 'wo****rd' && await J(`document.querySelector('#neText').selectionStart`) === 4, await val());
  await setText('one\ntwo\nthree'); await sel(0, 7); await tool('ul');
  ok('list: every selected line gets a bullet', await val() === '- one\n- two\nthree', await val());
  await tool('ul');
  ok('list again: taken away', await val() === 'one\ntwo\nthree', await val());
  await sel(0, 13); await tool('ol');
  ok('numbered list numbers the lines', await val() === '1. one\n2. two\n3. three', await val());
  await tool('task');
  ok('to-do list replaces the numbers', await val() === '- [ ] one\n- [ ] two\n- [ ] three', await val());
  await tool('quote');
  ok('quote puts > in front', await val() === '> - [ ] one\n> - [ ] two\n> - [ ] three', await val());
  await tool('quote');
  await sel(0, 0); await tool('h');
  ok('heading: ##, then ###, then none', await val() === '## - [ ] one\n- [ ] two\n- [ ] three', await val());
  await tool('h'); ok('heading again: ###', (await val()).startsWith('### '), await val());
  await tool('h'); ok('heading a third time: none', (await val()).startsWith('- [ ] one') || (await val()).startsWith('- [ ] '), await val());
  await setText('see example'); await sel(4, 11); await tool('link');
  ok('link: [text](https://) with the address selected', await val() === 'see [example](https://)' && await J(`document.querySelector('#neText').value.slice(document.querySelector('#neText').selectionStart,document.querySelector('#neText').selectionEnd)`) === 'https://', await val());
  await setText('https://example.org/a'); await sel(0, 21); await tool('link');
  ok('link of a selected address: the address goes into the brackets', (await val()).endsWith('](https://example.org/a)') && (await val()).startsWith('['), await val());
  await setText('a\nb'); await sel(1, 1); await tool('hr');
  ok('divider: blank lines around ---', await val() === 'a\n\n---\n\nb' || (await val()).includes('---'), JSON.stringify(await val()));
  await setText('x\ny'); await sel(0, 3); await tool('code');
  ok('code with several lines: a fenced block', await val() === '```\nx\ny\n```', JSON.stringify(await val()));
  await tool('undo'); await tool('undo');
  ok('undo works through the toolbar', (await val()) !== '```\nx\ny\n```', JSON.stringify(await val()));

  // autosave, preview, tags
  await setText('购物清单 #生活 #1 #good_idea');
  await enter(); await type('- 苹果'); await enter(); await type('香蕉');
  await sleep(1400);
  const n1 = await notes();
  ok('autosave: one note exists, titled by its first line, with the text', n1.length === 1 && n1[0].title === '购物清单 #生活 #1 #good_idea' && n1[0].data === '购物清单 #生活 #1 #good_idea\n- 苹果\n- 香蕉' && n1[0].summary === '苹果 香蕉', n1);
  ok('#tags became keywords (a number alone is not a tag)', n1[0].kw.join() === '生活,good_idea', n1[0].kw);
  ok('the note is a real record: type md, a hash, in the browser’s storage', await J(`idb.all().then(a=>a.filter(x=>x.type==='md' && x.id==='${n1[0].id}').length)`) === 1 && /^[0-9a-f]{40}$/.test(n1[0].hash), n1[0].hash);
  ok('the state line says it is saved', /^已保存 \d\d:\d\d$/.test(await J(`document.querySelector('#neState').textContent`)), await J(`document.querySelector('#neState').textContent`));
  await sleep(500);
  const pv = await J(`(()=>{ const d=document.querySelector('#nePrev').contentDocument; return {lis:d.querySelectorAll('li').length, h1:d.querySelectorAll('h1').length, ps:d.querySelectorAll('p').length, h1t:(d.querySelector('h1')||{}).textContent}; })()`);
  ok('the preview beside the text shows the list rendered, and the first line once (as the heading)', pv.lis === 2 && pv.h1 === 1 && pv.ps === 0 && pv.h1t === '购物清单 #生活 #1 #good_idea', pv);
  await c.shot(require('../paths').SHOTS + '/note_desktop.png');

  // done: the card, editing again
  await J(`document.querySelector('#neDone').click()`); await sleep(700);
  ok('"Done" closes the editor and the note is a card on the shelf', await J(`document.querySelector('#noteEd').hidden`) && await J(`!![...document.querySelectorAll('#grid .card-title a')].find(a=>a.textContent==='购物清单 #生活 #1 #good_idea')`) && await J(`!history.state || !history.state.ne`));
  const edit = await J(`(()=>{ const c=[...document.querySelectorAll('#grid .card')].find(x=>x.querySelector('.card-title a').textContent.startsWith('购物清单')); const b=c.querySelector('[data-act="edit"]'); return !!b; })()`);
  ok('the card has a pen', edit);
  await J(`[...document.querySelectorAll('#grid .card')].find(x=>x.querySelector('.card-title a').textContent.startsWith('购物清单')).querySelector('[data-act="edit"]').click()`); await sleep(600);
  ok('the pen opens the same text; the title field is empty (the title follows the first line)', await val() === '购物清单 #生活 #1 #good_idea\n- 苹果\n- 香蕉' && await J(`document.querySelector('#neTitle').value`) === '', await val());
  await J(`(()=>{ const ta=document.querySelector('#neText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
  await enter(); await type('香蕉两串');
  await J(`document.querySelector('#neTitle').focus()`); await type('我的购物');
  await sleep(1300);
  const n2 = await notes();
  ok('editing again changes the same note (no copy), the typed title wins', n2.length === 1 && n2[0].id === n1[0].id && n2[0].title === '我的购物' && /香蕉两串$/.test(n2[0].data), n2);
  await J(`document.querySelector('#neBack').click()`); await sleep(600);
  ok('the card shows the new title', await J(`!![...document.querySelectorAll('#grid .card-title a')].find(a=>a.textContent==='我的购物')`));

  // the reader and the pen in it
  await J(`[...document.querySelectorAll('#grid .card')].find(x=>x.querySelector('.card-title a').textContent==='我的购物').querySelector('.card-title a').click()`); await sleep(1500);
  ok('the reader of a note has the pen', await J(`!document.querySelector('#readerEdit').hidden`));
  ok('the reader shows the first line as the heading, once', await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return d.querySelectorAll('h1').length===1; })()`));
  await J(`document.querySelector('#readerEdit').click()`); await sleep(700);
  const over = await J(`(()=>{ const r=document.querySelector('#noteEd').getBoundingClientRect(), e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(e && e.closest('#noteEd')); })()`);
  ok('the editor covers the reader', over);
  await J(`(()=>{ const ta=document.querySelector('#neText'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); })()`);
  await enter(); await type('在阅读页里加的一行');
  await J(`document.querySelector('#neDone').click()`); await sleep(1500);
  const rd = await J(`({reader:!document.querySelector('#reader').hidden, text:document.querySelector('#frame').contentDocument.body.textContent, hash:location.hash})`);
  ok('back in the reader, the page shows the new line', rd.reader && /在阅读页里加的一行/.test(rd.text) && /^#read\//.test(rd.hash), rd);
  await J(`document.querySelector('#readerBack').click()`); await sleep(600);
  ok('closing the reader leaves the list', await J(`document.querySelector('#reader').hidden`));

  // empty notes are not kept
  await J(`document.querySelector('#noteBtn').click()`); await sleep(500);
  await J(`document.querySelector('#neDone').click()`); await sleep(500);
  ok('an empty note is never made', (await notes()).length === 1, await notes());
  await J(`document.querySelector('#noteBtn').click()`); await sleep(500);
  await type('x'); await sleep(1200);
  ok('a note with one letter is saved', (await notes()).length === 2, await notes());
  await setText('');
  await J(`document.querySelector('#neDone').click()`); await sleep(700);
  ok('emptied again and closed: it goes away (and says so)', (await notes()).length === 1 && await J(`document.querySelector('#toastMsg').textContent`) === '空笔记没有保留。', [await notes(), await J(`document.querySelector('#toastMsg').textContent`)]);

  // Esc and the back button save and close
  await J(`document.querySelector('#noteBtn').click()`); await sleep(500);
  await type('用 Esc 关'); await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(900);
  ok('Esc closes the editor and keeps what was typed', await J(`document.querySelector('#noteEd').hidden`) && (await notes()).some(n => n.data === '用 Esc 关'), await notes());
  await J(`document.querySelector('#noteBtn').click()`); await sleep(500);
  await type('用返回键关'); await J(`history.back()`); await sleep(1200);
  ok('the browser’s Back closes the editor and keeps what was typed', await J(`document.querySelector('#noteEd').hidden`) && (await notes()).some(n => n.data === '用返回键关'), await notes());

  // a medium window: the preview is a toggle
  await c.desktop(900, 800, 1);
  await J(`document.querySelector('#noteBtn').click()`); await sleep(500);
  await setText('# 标题\n\n正文 **粗**');
  const mid = await J(`({wide:document.querySelector('#noteEd').classList.contains('wide'), pbtn:!document.querySelector('#nePreviewBtn').hidden, prevHidden:document.querySelector('#nePrev').hidden})`);
  ok('medium window: no side-by-side, a Preview button', !mid.wide && mid.pbtn && mid.prevHidden, mid);
  await J(`document.querySelector('#nePreviewBtn').click()`); await sleep(700);
  const mid2 = await J(`({ta:document.querySelector('#neText').hidden, tools:document.querySelector('#neTools').hidden, prev:!document.querySelector('#nePrev').hidden, b:document.querySelector('#nePreviewBtn').textContent, strong:document.querySelector('#nePrev').contentDocument.querySelectorAll('strong').length})`);
  ok('Preview shows the rendered text instead of the text and tools; the button turns into Edit', mid2.ta && mid2.tools && mid2.prev && mid2.b === '编辑' && mid2.strong === 1, mid2);
  await J(`document.querySelector('#nePreviewBtn').click()`); await sleep(300);
  ok('Edit brings the text back', await J(`!document.querySelector('#neText').hidden && !document.querySelector('#neTools').hidden`));
  await J(`document.querySelector('#neDone').click()`); await sleep(600);

  // ================================================ B. a phone
  await c.mobile(390, 844, 2);
  await fresh('zh');
  await J(`localStorage.setItem('archive.neMode', JSON.stringify('md'))`);                       // (a phone starts in document mode: this part is about the Markdown mode on a phone)
  const ph0 = await J(`({btn:getComputedStyle(document.querySelector('#noteBtn')).display, fab:getComputedStyle(document.querySelector('#noteFab')).display})`);
  ok('phone: a round button, no pen in the header', ph0.btn === 'none' && ph0.fab !== 'none', ph0);
  const fr = (await rects(['#noteFab']))[0];
  ok('the round button sits at the bottom right, inside the screen and big enough to hit', fr && fr.r <= 390 && fr.b <= 844 && fr.w >= 48 && fr.t > 600 && fr.l > 250, fr);
  await c.shot(require('../paths').SHOTS + '/note_phone_list.png');
  await J(`document.querySelector('#noteFab').click()`); await sleep(600);
  const ph = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {t:b.top,b:b.bottom,l:b.left,r:b.right,h:b.height}; };
    return {ed:r('#noteEd'), tools:r('#neTools'), ta:r('#neText'), head:r('#neTools .gap')?r('.ne-head'):null, wide:document.querySelector('#noteEd').classList.contains('wide'), pbtn:!document.querySelector('#nePreviewBtn').hidden, prevHidden:document.querySelector('#nePrev').hidden, ih:innerHeight, over:document.documentElement.scrollWidth-document.documentElement.clientWidth, fab:getComputedStyle(document.querySelector('#noteFab')).display}; })()`);
  ok('phone: the editor fills the screen, the tools are under the text (above the keyboard), no sideways scroll', ph.ed.h >= ph.ih - 1 && ph.tools.t >= ph.ta.b - 1 && ph.tools.b <= ph.ih + 1 && ph.over <= 0 && !ph.wide && ph.pbtn && ph.prevHidden && ph.fab === 'none', ph);
  ok('phone: the tools are big enough to tap and scroll sideways', await J(`(()=>{ const b=[...document.querySelectorAll('#neTools button')]; return b.every(x=>x.getBoundingClientRect().height>=38 && x.getBoundingClientRect().width>=40) && document.querySelector('#neTools').scrollWidth>=document.querySelector('#neTools').clientWidth; })()`));
  await c.shot(require('../paths').SHOTS + '/note_phone_empty.png');
  await type('手机上写的笔记');
  await J(`(()=>{ const ta=document.querySelector('#neText'); ta.focus(); ta.setSelectionRange(0,3); })()`);
  // a real tap on a tool: the focus (the keyboard) must stay in the text
  const bold = (await rects(['#neTools [data-ne="b"]']))[0];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bold.l + bold.w / 2, y: bold.t + bold.h / 2 }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
  const tap = await J(`({active:document.activeElement.id, v:document.querySelector('#neText').value})`);
  ok('a tap on a tool works and the text keeps the focus (the keyboard stays up)', tap.v === '**手机上**写的笔记' && tap.active === 'neText', tap);
  // the keyboard opens: the visible area shrinks; the layer follows it
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 480, deviceScaleFactor: 2, mobile: true }); await sleep(500);
  const kb = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {t:b.top,b:b.bottom,h:b.height}; }; return {vv:visualViewport.height, ed:r('#noteEd'), tools:r('#neTools'), ta:r('#neText')}; })()`);
  ok('with the keyboard up (a short screen) the editor is as high as what is visible and the tools stay on it', Math.abs(kb.ed.h - kb.vv) <= 1 && kb.tools.b <= kb.vv + 1 && kb.ta.h > 100, kb);
  await c.shot(require('../paths').SHOTS + '/note_phone_keyboard.png');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await sleep(400);
  await J(`document.querySelector('#nePreviewBtn').click()`); await sleep(700);
  ok('phone: Preview replaces text and tools by the rendered note', await J(`document.querySelector('#neText').hidden && !document.querySelector('#nePrev').hidden && document.querySelector('#nePrev').contentDocument.querySelectorAll('strong').length===1`));
  await c.shot(require('../paths').SHOTS + '/note_phone_preview.png');
  await J(`document.querySelector('#neDone').click()`); await sleep(800);
  ok('phone: Done saves and returns to the list; the round button is back', await J(`document.querySelector('#noteEd').hidden`) && (await notes()).some(n => n.data === '**手机上**写的笔记') && await J(`getComputedStyle(document.querySelector('#noteFab')).display`) !== 'none');
  await J(`document.querySelector('#grid .card [data-act="edit"]').closest('.card').querySelector('[data-act="more"]').click()`); await sleep(300);
  ok('phone: the pen is among the buttons a card shows when it is opened', await J(`!!document.querySelector('#grid .card.acts-open [data-act="edit"]') && getComputedStyle(document.querySelector('#grid .card.acts-open [data-act="edit"]')).display!=='none'`));
  await J(`document.querySelector('[data-space="dir"]').click()`); await sleep(1200);
  ok('in the public directory neither the pen nor the round button is shown', await J(`document.querySelector('#noteFab').hidden && document.querySelector('#noteBtn').hidden`));
  await c.desktop(1280, 900, 1);

  // ================================================ C. English
  await fresh('en');
  await J(`document.querySelector('#noteBtn').click()`); await sleep(600);
  const en = await J(`({tph:document.querySelector('#neTitle').placeholder, ph:document.querySelector('#neText').placeholder.split('\\n')[0], done:document.querySelector('#neDone').textContent, tools:[...document.querySelectorAll('#neTools button')].map(b=>b.title).filter(Boolean).slice(0,4)})`);
  ok('English labels in the editor', en.tph === 'Title (empty: the first line)' && en.ph === 'Start writing…' && en.done === 'Done' && en.tools.join('|') === 'Heading (again for another level)|Bold|Italic|Strikethrough', en);
  await J(`document.querySelector('#neDone').click()`); await sleep(400);
  ok('no dialogs popped up', dialogs.length === 0, dialogs);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
