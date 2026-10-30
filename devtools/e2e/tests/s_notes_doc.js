// e2e: the note editor in DOCUMENT mode (what a phone starts in): formatted text like Apple Notes, the browser's own editing, a toolbar above the keyboard, to-do lists, links and picture links,
// pasting, the Markdown underneath, and the fallback to Markdown for anything that would not survive the round trip
const fs = require('fs');
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

(async () => {
  const c = await connect(9444);
  const dialogs = c.autoDialog(true);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,render,openNote,neSave,neClose,NE,openReader,neDocFit,neDomToMd,neGet}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}')); localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`); await c.goto(BASE, 2500); };
  const type = text => c.send('Input.insertText', { text });
  const enter = async () => { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); };
  const md = () => J(`neGet()`);
  const nd = k => J(`document.querySelector('#neDocBar [data-nd="${k}"]').click()`);
  const notes = () => J(`state.items.filter(x=>x.source==='local' && x.type==='md').map(x=>({id:x.id,title:x.title,data:x.data}))`);
  const selectText = s => J(`(()=>{ const d=document.querySelector('#neDoc'), w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())){ const i=n.nodeValue.indexOf(${JSON.stringify(s)}); if(i>=0){ const r=document.createRange(); r.setStart(n,i); r.setEnd(n,i+${JSON.stringify(s)}.length); d.focus(); const g=getSelection(); g.removeAllRanges(); g.addRange(r); return true; } } return false; })()`);
  const caretEndOf = s => J(`(()=>{ const d=document.querySelector('#neDoc'), w=document.createTreeWalker(d,NodeFilter.SHOW_TEXT); let n; while((n=w.nextNode())){ if(n.nodeValue.includes(${JSON.stringify(s)})){ const r=document.createRange(); r.setStart(n,n.nodeValue.length); r.collapse(true); d.focus(); const g=getSelection(); g.removeAllRanges(); g.addRange(r); return true; } } return false; })()`);
  const rect = sel => J(`(()=>{ const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return {l:b.left,t:b.top,r:b.right,b:b.bottom,w:b.width,h:b.height}; })()`);
  const paste = (text, file) => J(`(()=>{ const dt=new DataTransfer(); ${text !== undefined ? `dt.setData('text/plain',${JSON.stringify(text)});` : ''} ${file ? `dt.items.add(new File([''],'a.png',{type:'image/png'}));` : ''} document.querySelector('#neDoc').focus(); document.querySelector('#neDoc').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); })()`);

  await c.mobile(390, 844, 2);
  await fresh('zh');

  // ================================================ a phone opens a note in document mode
  await J(`document.querySelector('#noteFab').click()`); await sleep(600);
  const o = await J(`(()=>{ const e=document.querySelector('#noteEd'); const vis=s=>{ const x=document.querySelector(s); return !!x && !x.hidden && getComputedStyle(x).display!=='none'; };
    return {doc:e.classList.contains('doc'), editor:vis('#neDoc'), ta:vis('#neText'), bar:vis('#neDocBar'), title:vis('#neTitle'), prevBtn:vis('#nePreviewBtn'), back:vis('#neBack'), done:vis('#neDone'), focus:document.activeElement.id, buttons:document.querySelectorAll('#neDocTools button').length,
      ph:getComputedStyle(document.querySelector('#neDoc > :first-child'),'::before').content, empty:document.querySelector('#neDoc').classList.contains('empty')}; })()`);
  ok('a phone starts in document mode: the formatted editor, the toolbar, no Markdown box, no title field, no Preview button', o.doc && o.editor && !o.ta && o.bar && !o.title && !o.prevBtn && o.buttons === 7, o);
  ok('the editor has the focus (the keyboard is up), a back arrow and Done; the empty note says "开始写…"', o.focus === 'neDoc' && o.back && o.done && /开始写/.test(o.ph) && o.empty, o);
  const geo = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {t:b.top,b:b.bottom,h:b.height}; }; return {doc:r('#neDoc'), bar:r('#neDocBar'), ih:innerHeight, over:document.documentElement.scrollWidth-document.documentElement.clientWidth}; })()`);
  ok('the toolbar sits under the text, inside the screen, and there is no sideways scroll', geo.bar.t >= geo.doc.b - 1 && geo.bar.b <= geo.ih + 1 && geo.over <= 0, geo);

  // ================================================ typing with the keyboard: the first line is the title; lists carry on; "- " starts a list
  await type('买菜清单'); await enter(); await type('今天要买的东西'); await enter();
  ok('typing: each Enter is a new paragraph; the Markdown underneath', await md() === '买菜清单\n\n今天要买的东西', await md());
  await type('-'); await type(' '); await sleep(250);
  ok('"- " at the start of a line becomes a bullet list at once', await J(`document.querySelectorAll('#neDoc ul > li').length`) === 1 && await J(`document.querySelector('#neDoc').textContent.includes('-')`) === false, await J(`document.querySelector('#neDoc').innerHTML`));
  await type('苹果'); await enter(); await type('香蕉'); await enter(); await enter();
  const afterList = await J(`(()=>{ const ul=document.querySelector('#neDoc ul'), b=getSelection().anchorNode; const el=b.nodeType===3?b.parentNode:b; return {items:ul.children.length, caretInList:!!el.closest('ul'), blocks:[...document.querySelector('#neDoc').children].map(x=>x.tagName).join()}; })()`);
  ok('Enter carries a list on, and Enter on an empty item ends it (the caret is outside the list)', afterList.items === 2 && !afterList.caretInList, afterList);
  await type('1'); await type('.'); await type(' '); await sleep(250); await type('一'); await enter(); await type('二'); await enter(); await enter();
  ok('"1. " starts a numbered list that counts on', await J(`document.querySelectorAll('#neDoc ol > li').length`) === 2, await J(`document.querySelector('#neDoc').innerHTML`));

  // ================================================ to-do list: the button, Enter, a tap on the circle
  await nd('check');
  ok('the to-do button makes the line a to-do item (a circle in front)', await J(`document.querySelectorAll('#neDoc li[data-c="0"]').length`) === 1, await J(`document.querySelector('#neDoc').innerHTML`));
  await type('待办一'); await enter(); await type('待办二');
  ok('a new item of a to-do list is a to-do item, not done yet', await J(`[...document.querySelectorAll('#neDoc li[data-c]')].map(l=>l.dataset.c).join('')`) === '00', await J(`document.querySelector('#neDoc').innerHTML`));
  const li1 = await J(`(()=>{ const l=document.querySelector('#neDoc li[data-c]'), b=l.getBoundingClientRect(); return {x:b.left-12, y:b.top+14}; })()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: li1.x, y: li1.y, button: 'left', clickCount: 1 }); await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: li1.x, y: li1.y, button: 'left', clickCount: 1 }); await sleep(300);
  ok('a tap on the circle ticks the item', await J(`[...document.querySelectorAll('#neDoc li[data-c]')].map(l=>l.dataset.c).join('')`) === '10', await J(`document.querySelector('#neDoc').innerHTML`));
  await caretEndOf('待办一'); await enter(); await type('待办中间');
  ok('Enter after a ticked item gives a fresh, unticked one', await J(`[...document.querySelectorAll('#neDoc li[data-c]')].map(l=>l.dataset.c).join('')`) === '100', await J(`document.querySelector('#neDoc').innerHTML`));
  ok('the Markdown underneath: to-do items as - [ ] / - [x]', (await md()).endsWith('- [x] 待办一\n- [ ] 待办中间\n- [ ] 待办二'), JSON.stringify(await md()));
  await c.shot(require('../paths').SHOTS + '/note_doc_phone.png');

  // ================================================ text format: bold, heading, undo
  await nd('aa');
  ok('"Aa" opens a row of formats above the toolbar', await J(`!document.querySelector('#neFmt').hidden && document.querySelectorAll('#neFmt button').length===9`), await J(`document.querySelectorAll('#neFmt button').length`));
  await selectText('买菜清单');
  await nd('b');
  ok('bold: the words are bold and the Markdown has **…**', await J(`!!document.querySelector('#neDoc b, #neDoc strong')`) && (await md()).startsWith('**买菜清单**'), (await md()).slice(0, 40));
  await nd('b');
  ok('bold again takes it away', !(await md()).includes('**'), (await md()).slice(0, 40));
  await selectText('今天要买的东西'); await nd('h2');
  ok('a heading: the line is an h2 and the Markdown has ##', await J(`!!document.querySelector('#neDoc h2')`) && (await md()).includes('## 今天要买的东西'), (await md()).slice(0, 60));
  await nd('h2');
  ok('the same button again takes the heading away', await J(`!document.querySelector('#neDoc h2')`) && !(await md()).includes('## '), (await md()).slice(0, 60));
  await selectText('今天要买的东西'); await nd('q');
  ok('quote: a blockquote, > in Markdown', await J(`!!document.querySelector('#neDoc blockquote')`) && (await md()).includes('> 今天要买的东西'), (await md()).slice(0, 60));
  await nd('q');
  ok('quote again takes it away', await J(`!document.querySelector('#neDoc blockquote')`), await J(`document.querySelector('#neDoc').innerHTML.slice(0,200)`));
  await nd('aa');

  // ================================================ a link and a picture link, from the sheet above the keyboard
  await caretEndOf('今天要买的东西');
  await nd('link');
  ok('the link button opens a small sheet (address, words) with the address focused', await J(`!document.querySelector('#neSheet').hidden && document.activeElement.id==='neSheetUrl' && document.querySelector('#neSheetUrl').getAttribute('inputmode')==='url'`));
  await type('not a link'); await J(`document.querySelector('#neSheetText').value='示例'`); await J(`document.querySelector('#neSheetOk').click()`); await sleep(300);
  ok('a wrong address is refused with a message and nothing is inserted', await J(`!document.querySelector('#neSheet').hidden && !document.querySelector('#neDoc a')`) && /http/.test(await J(`document.querySelector('#toastMsg').textContent`)), await J(`document.querySelector('#toastMsg').textContent`));
  await J(`document.querySelector('#neSheetUrl').value=''; document.querySelector('#neSheetUrl').focus()`); await type('example.org/page'); await J(`document.querySelector('#neSheetOk').click()`); await sleep(300);
  ok('an address without https:// gets it; the link shows the words given; the sheet closes', await J(`(()=>{ const a=document.querySelector('#neDoc a'); return !!a && a.getAttribute('href')==='https://example.org/page' && a.textContent==='示例' && document.querySelector('#neSheet').hidden; })()`), await J(`document.querySelector('#neDoc').innerHTML.slice(0,300)`));
  ok('the Markdown has [示例](https://example.org/page)', (await md()).includes('[示例](https://example.org/page)'), (await md()).slice(0, 120));
  await nd('img');
  await J(`document.querySelector('#neSheetUrl').focus()`); await type('http://example.org/a.png'); await J(`document.querySelector('#neSheetText').value='一张图'`); await J(`document.querySelector('#neSheetOk').click()`); await sleep(400);
  ok('a picture link: an <img> with an https address (http is upgraded), its description as alt', await J(`(()=>{ const i=document.querySelector('#neDoc img'); return !!i && i.getAttribute('src')==='https://example.org/a.png' && i.getAttribute('alt')==='一张图' && i.getAttribute('referrerpolicy')==='no-referrer'; })()`), await J(`document.querySelector('#neDoc').innerHTML.slice(0,400)`));
  ok('the Markdown has ![一张图](https://example.org/a.png)', (await md()).includes('![一张图](https://example.org/a.png)'), (await md()).slice(0, 200));

  // ================================================ paste: only the words; an address becomes a link, a picture address a picture
  await caretEndOf('待办二'); await enter(); await enter();
  await paste('https://example.org/p.jpg');
  ok('pasting the address of a picture inserts the picture', await J(`document.querySelectorAll('#neDoc img').length`) === 2 && (await md()).includes('![](https://example.org/p.jpg)'), (await md()).slice(-120));
  await enter(); await paste('https://example.org/x');
  ok('pasting any other address inserts a link showing the address', (await md()).includes('https://example.org/x') && await J(`!![...document.querySelectorAll('#neDoc a')].find(a=>a.getAttribute('href')==='https://example.org/x')`), (await md()).slice(-120));
  await enter(); await paste('第一行\n第二行');
  ok('pasting several lines makes paragraphs', (await md()).endsWith('第一行\n\n第二行'), JSON.stringify((await md()).slice(-40)));
  await paste(undefined, true);
  ok('pasting a picture FILE says so (only links are kept), nothing is inserted', /链接/.test(await J(`document.querySelector('#toastMsg').textContent`)) && await J(`document.querySelectorAll('#neDoc img').length`) === 2, await J(`document.querySelector('#toastMsg').textContent`));
  await J(`(()=>{ const d=document.querySelector('#neDoc'), dt=new DataTransfer(); dt.setData('text/plain','纯文字'); dt.setData('text/html','<span style="color:red;font-size:40px">红色大字</span>'); d.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); })()`);
  ok('pasted styles, colours and fonts are not taken (only the plain words)', !(await J(`document.querySelector('#neDoc').innerHTML`)).includes('红色大字') && (await J(`document.querySelector('#neDoc').innerHTML`)).includes('纯文字') && !(await J(`document.querySelector('#neDoc').innerHTML`)).includes('font-size'), await J(`document.querySelector('#neDoc').innerHTML.slice(-200)`));
  await c.shot(require('../paths').SHOTS + '/note_doc_phone2.png');

  // ================================================ saved, kept as Markdown, opened again as the same document
  await sleep(1300);
  const n1 = await notes();
  ok('autosave: one note, titled by its first line, the Markdown kept', n1.length === 1 && n1[0].title === '买菜清单' && n1[0].data === await md(), n1.map(x => x.title));
  const before = await md();
  await J(`document.querySelector('#neDone').click()`); await sleep(700);
  ok('Done closes the editor; the note is a card', await J(`document.querySelector('#noteEd').hidden`) && await J(`!![...document.querySelectorAll('#grid .card-title a')].find(a=>a.textContent==='买菜清单')`));
  await J(`openNote(${JSON.stringify(n1[0].id)})`); await sleep(700);
  const again = await J(`({doc:document.querySelector('#noteEd').classList.contains('doc'), md:neGet(), lis:document.querySelectorAll('#neDoc li').length, ticked:document.querySelectorAll('#neDoc li[data-c="1"]').length, imgs:document.querySelectorAll('#neDoc img').length, links:document.querySelectorAll('#neDoc a').length})`);
  ok('opened again it is the same document, in document mode, with the to-do ticks, the pictures and the links', again.doc && again.md === before && again.ticked === 1 && again.imgs === 2 && again.links >= 2, again);
  await J(`document.querySelector('#neDone').click()`); await sleep(600);

  // ================================================ the reader shows it
  await J(`[...document.querySelectorAll('#grid .card')].find(x=>x.querySelector('.card-title a').textContent==='买菜清单').querySelector('.card-title a').click()`); await sleep(1500);
  const rd = await J(`(()=>{ const d=document.querySelector('#frame').contentDocument; return {h1:d.querySelectorAll('h1').length, boxes:d.querySelectorAll('input[type=checkbox]').length, checked:d.querySelectorAll('input[type=checkbox][checked]').length, imgs:d.querySelectorAll('img').length, a:d.querySelectorAll('a[href]').length}; })()`);
  ok('the reader shows the note: one heading, to-do boxes (one ticked), the pictures, the links', rd.h1 === 1 && rd.boxes === 3 && rd.checked === 1 && rd.imgs === 2 && rd.a >= 2, rd);
  await J(`document.querySelector('#readerBack').click()`); await sleep(500);

  // ================================================ Markdown underneath: the switch, both ways
  await J(`openNote(${JSON.stringify(n1[0].id)})`); await sleep(600);
  await nd('aa'); await nd('md'); await sleep(400);
  const m1 = await J(`({doc:document.querySelector('#noteEd').classList.contains('doc'), ta:document.querySelector('#neText').value, taVis:!document.querySelector('#neText').hidden, tools:!document.querySelector('#neTools').hidden, pref:LS.get('neMode','')})`);
  ok('"MD" switches to the Markdown source (the text is the same Markdown), and the choice is remembered', !m1.doc && m1.ta === before && m1.taVis && m1.tools && m1.pref === 'md', { doc: m1.doc, pref: m1.pref, same: m1.ta === before });
  await J(`document.querySelector('#neTools [data-ne="doc"]').click()`); await sleep(400);
  ok('and back to document editing from the Markdown toolbar', await J(`document.querySelector('#noteEd').classList.contains('doc') && LS.get('neMode','')==='doc' && neGet()===${JSON.stringify(before)}`));
  await J(`document.querySelector('#neDone').click()`); await sleep(600);

  // ================================================ what document mode cannot hold opens as Markdown, nothing is lost
  const hard = {
    table: '# 表\n\n| a | b |\n|---|---|\n| 1 | 2 |\n',
    httpimg: '图\n\n![x](http://example.org/a.png)\n',
    front: '---\ntitle: 带头部\ntags: [a, b]\n---\n\n正文\n',
    html: '前\n\n<details><summary>更多</summary>藏起来的</details>\n',
    mailto: '写信给 [我](mailto:a@b.c)\n',
  };
  for (const [k, v] of Object.entries(hard)) ok('document mode refuses (' + k + ') so that nothing is dropped', await J(`neDocFit(${JSON.stringify(v)})===null`));
  const easy = '# 标题\n\n正文 **粗** *斜* ~~删~~ [链](https://e.org/a) ![图](https://e.org/i.png)\n\n- [x] 完成\n- [ ] 待办\n\n1. 一\n2. 二\n   - 子项\n\n> 引用\n\n```js\nlet a = 1;\n```\n\n---\n\n末尾';
  const fit = await J(`(()=>{ const f=neDocFit(${JSON.stringify(easy)}); if(!f) return null; const d=document.createElement('div'); d.innerHTML=f.html; return neDomToMd(d); })()`);
  ok('ordinary Markdown (heading, bold, italic, strike, link, picture, to-dos, numbered and nested lists, quote, code block, divider) is held and written back as the same text', fit === easy.replace(/\n$/, ''), fit);
  const odd = 'a*b* _c_ [x] <div> #tag 1. 不是列表';
  const oddFit = await J(`(()=>{ const d=document.createElement('div'); const p=document.createElement('p'); p.textContent=${JSON.stringify(odd)}; d.appendChild(p); const m=neDomToMd(d); const f=neDocFit(m); return {m, ok:!!f}; })()`);
  ok('words that look like Markdown but were typed as words are escaped, so they come back as the same words', oddFit.ok && /\\\*b\\\*/.test(oddFit.m), oddFit);
  await J(`(async()=>{ const rec={id:'local:tbl1',path:'',type:'md',category:'notes',filename:'',hash:'',title:'表格笔记',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:40,date:'2026-10-23',added:1,featured:false,hidden:false,cover:'',data:${JSON.stringify(hard.table)}}; await idb.put(rec); state.items.push({...rec, source:'local'}); })()`);
  await J(`LS.set('neMode','doc')`);
  await J(`openNote('local:tbl1')`); await sleep(700);
  const t1 = await J(`({doc:document.querySelector('#noteEd').classList.contains('doc'), ta:document.querySelector('#neText').value, toast:document.querySelector('#toastMsg').textContent})`);
  ok('a note with a table opens as Markdown, unchanged, and says why', !t1.doc && t1.ta === hard.table && /表格/.test(t1.toast), t1);
  await J(`document.querySelector('#neDone').click()`); await sleep(500);

  // ================================================ the keyboard opens: the layer follows what is visible; the tools stay on it
  await J(`openNote(${JSON.stringify(n1[0].id)})`); await sleep(600);
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 480, deviceScaleFactor: 2, mobile: true }); await sleep(500);
  const kb = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {t:b.top,b:b.bottom,h:b.height}; }; return {vv:visualViewport.height, ed:r('#noteEd'), bar:r('#neDocBar'), doc:r('#neDoc')}; })()`);
  ok('with the keyboard up (a short screen) the editor is as high as what is visible, the tools are on it, the text has room', Math.abs(kb.ed.h - kb.vv) <= 1 && kb.bar.b <= kb.vv + 1 && kb.doc.h > 100, kb);
  await nd('aa'); await c.shot(require('../paths').SHOTS + '/note_doc_keyboard.png'); await nd('aa');
  await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }); await sleep(400);
  await J(`document.querySelector('#neDone').click()`); await sleep(500);

  // ================================================ a computer: document mode on request, with the toolbar on top and the title field
  await c.desktop(1280, 900, 1);
  await fresh('zh');
  await J(`document.querySelector('#noteBtn').click()`); await sleep(600);
  ok('a computer starts in Markdown mode (the choice of the phone was not carried over: another browser)', await J(`!document.querySelector('#noteEd').classList.contains('doc')`));
  await J(`document.querySelector('#neTools [data-ne="doc"]').click()`); await sleep(500);
  const dk = await J(`(()=>{ const r=s=>{ const b=document.querySelector(s).getBoundingClientRect(); return {t:b.top,b:b.bottom}; }; return {doc:document.querySelector('#noteEd').classList.contains('doc'), bar:r('#neDocBar'), ed:r('#neDoc'), title:!document.querySelector('#neTitle').hidden, prev:document.querySelector('#nePrev').hidden}; })()`);
  ok('on a computer, document mode has the toolbar on top of the text and the title field', dk.doc && dk.bar.b <= dk.ed.t + 1 && dk.title && dk.prev, dk);
  await type('电脑上也能所见即所得');
  await J(`document.querySelector('#neDone').click()`); await sleep(900);
  ok('and it is saved like any other', (await notes()).some(n => n.data === '电脑上也能所见即所得'), await notes());
  ok('no dialogs popped up', dialogs.length === 0, dialogs);

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL (crash)', e.stack || e); process.exit(2); });
