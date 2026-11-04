// e2e of the sync code with two "devices": two separate browsers (own storage), one sync service (in-memory store) on 8840
const { connect, sleep } = require('../cdp');
const BASE = 'http://127.0.0.1:8820/', SVC = 'http://127.0.0.1:8840', BLOG = 'http://127.0.0.1:8841';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };
const peek = async () => (await fetch(SVC + '/__peek')).json();
const post = (p) => fetch(SVC + p, { method: 'POST' }).then(r => r.json());

(async () => {
  await post('/__reset');
  const A = await connect(9444), B = await connect(9445);
  const settleA = await require('../settle')(A), settleB = await require('../settle')(B);
  const settleAB = ms => Promise.all([settleA(ms), settleB(ms)]);
  for (const c of [A, B]) { c.autoDialog(true); await c.desktop(1280, 900, 1); await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true }); }
  const mk = c => expr => c.js(`(()=>{ const {state,idb,LS,loadAll,addCollection,openReader,refreshSubs,syncRun,syncCfg,syncSnapshot,syncProbe,payMaybe,merge3,syncNewCode,syncKeys,syncNorm,syncFetchBody,bkBuild,openNote,neClose}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const a = mk(A), b = mk(B);
  const fresh = async (c, j) => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); await j(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.lang','"zh"')`); await c.goto(BASE, 2500); };
  await fresh(A, a); await fresh(B, b);

  // -------------------------------------------------------------- the service is there, the button shows
  ok('A: the sync button shows when the site has a sync service', await a(`!document.querySelector('#syncBtn').hidden`));
  ok('B: same', await b(`!document.querySelector('#syncBtn').hidden`));
  ok('nothing is synced and nothing is said before it is turned on', await a(`document.querySelector('#syncStat').hidden && !syncCfg()`));

  // -------------------------------------------------------------- device A: a shelf, then turn sync on
  await a(`(async()=>{
    const cid=addCollection('我的合集'); const now=Date.now();
    const mkr=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-10-01',added:Math.floor(now/1000),featured:false,hidden:false,cover:'',...extra});
    await idb.put(mkr('local:t1',{type:'md',filename:'a.md',title:'机密笔记甲',data:'# 机密笔记甲\\n\\n这是只有我自己能读的正文 SECRET-BODY-1',collection:cid,hash:'aa11bb22cc33',size:60}));
    await idb.put(mkr('local:t2',{type:'txt',filename:'b.txt',title:'纯文本乙',data:'第一章\\n内容 SECRET-BODY-2',hash:'dd44ee55ff66'}));
    await idb.put(mkr('local:t3',{type:'html',filename:'c.html',title:'网页丙',data:'<!doctype html><title>x</title><p>SECRET-BODY-3</p>',hash:'0123456789ab'}));
    const pdf=new Uint8Array(5000); pdf.set(new TextEncoder().encode('%PDF-1.4\\n')); for(let i=40;i<5000;i++) pdf[i]=i%251;
    await idb.put(mkr('local:t4',{type:'pdf',filename:'d.pdf',title:'PDF 书丁',data:new Blob([pdf],{type:'application/pdf'}),hash:'abcdefabcdef',size:5000,pages:3}));
    await idb.put(mkr('local:link:s1',{type:'link',url:'https://example.com/a?x=1',title:'收藏的链接戊',image:'',from:'example.com'}));
    LS.set('progress',{'local:t1':{pct:42,at:1700000000000}}); LS.set('marks',{'local:t1':[{pct:10,label:'开头',at:1700000001000}]}); LS.set('flags',{'notes/guide/index.html':{starred:true}});
    await loadAll();
  })()`);
  await a(`document.querySelector('#addBtn').click()`); await settleA(400);
  await a(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${BLOG}/blog/'; document.querySelector('#fsFind').click()`); await settleA(2800);
  await a(`document.querySelector('#fsGo').click()`); await settleA(3500);
  ok('A: setup (5 own items, a subscription with 3 articles)', await a(`state.items.filter(x=>x.source==='local').length`) === 8);

  await a(`document.querySelector('#syncBtn').click()`); await sleep(300);
  ok('A: the dialog explains it and offers to start or to connect', await a(`/加密/.test(document.querySelector('#syncOff').textContent) && !!document.querySelector('#syncStart') && !!document.querySelector('#syncCodeIn')`));
  await A.shot(require('../paths').SHOTS + '/sync_dialog_off.png');
  await a(`document.querySelector('#syncStart').click()`); await settleA(600);
  const code = await a(`document.querySelector('#syncCodeShow').textContent`);
  ok('A: a code of 6 groups of 4 is shown once, with the warning', /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){5}$/.test(code) && await a(`!document.querySelector('#syncNew').hidden`), code);
  await A.shot(require('../paths').SHOTS + '/sync_dialog_code.png');
  await a(`document.querySelector('#syncSaved').click()`); await settleA(4500);
  const cfgA = await a(`syncCfg()`);
  ok('A: first sync done (revision, space used, expiry)', cfgA && cfgA.rev >= 2 && cfgA.last > 0 && cfgA.quota.used > 0 && cfgA.expires > Date.now() / 1000 && !cfgA.err, cfgA);
  await A.shot(require('../paths').SHOTS + '/sync_dialog_on.png');
  const pk = await peek();
  ok('the service holds only encrypted things: no title, text, url or name anywhere in its store', !/机密|SECRET|纯文本|网页丙|PDF 书|收藏的链接|我的合集|example\.com|示例博客|开头/.test(pk.raw), pk.raw.slice(0, 300));
  ok('the secret is kept only as a hash', !pk.raw.includes(code) && !pk.raw.replace(/-/g, '').includes(code.replace(/-/g, '')));
  ok('3 texts were uploaded (md, txt, html), the PDF was not', Object.entries(pk.keys).filter(([k]) => k.endsWith(':b')).map(([, v]) => Object.keys(v).length)[0] === 3, pk.keys);
  const recsA = await a(`(async()=>(await idb.all()).filter(r=>!r.id.startsWith('local:feed:')).map(r=>r.id+'|'+(r.bk?'bk':'')+'|'+(r.nd?'nd':'')))()`);
  ok('A: texts know their key, the PDF is marked as a list entry', recsA.filter(x => x.includes('|bk|')).length === 3 && recsA.some(x => x.startsWith('local:t4|') && x.endsWith('|nd')), recsA);

  // -------------------------------------------------------------- device B joins with the code
  await b(`document.querySelector('#syncBtn').click()`); await sleep(300);
  await b(`document.querySelector('#syncCodeIn').value='zzzz-0000'; document.querySelector('#syncJoin').click()`); await settleB(500);
  ok('B: a code of the wrong shape is refused with the reason', await b(`/格式不对/.test(document.querySelector('#syncMsg').textContent) && !syncCfg()`));
  await b(`document.querySelector('#syncCodeIn').value='${syncRandom()}'; document.querySelector('#syncJoin').click()`); await settleB(1200);
  ok('B: a code nobody made finds nothing and keeps nothing', await b(`/没有找到/.test(document.querySelector('#syncMsg').textContent) && !syncCfg()`), await b(`document.querySelector('#syncMsg').textContent`));
  await b(`document.querySelector('#syncCodeIn').value=${JSON.stringify(code.toLowerCase().replace(/-/g, ' '))}; document.querySelector('#syncJoin').click()`); await settleB(6000);
  const bItems = await b(`state.items.filter(x=>x.source==='local' && !x.id.startsWith('local:feed:')).map(x=>({id:x.id,t:x.title,type:x.type,has:x.data!==undefined,bk:!!x.bk,nd:!!x.nd,col:x.collection||''}))`);
  const byId = Object.fromEntries(bItems.map(i => [i.id, i]));
  ok('B: connected (lower case, spaces: fine); all 5 entries are here', bItems.length === 5 && byId['local:t1'].t === '机密笔记甲' && byId['local:link:s1'].t === '收藏的链接戊', bItems);
  ok('B: the texts are here already (fetched after the sync), decrypted and unchanged', await b(`['local:t1','local:t2','local:t3'].every(id=>state.items.find(x=>x.id===id).data!==undefined) && /SECRET-BODY-1/.test(state.items.find(x=>x.id==='local:t1').data) && /SECRET-BODY-3/.test(state.items.find(x=>x.id==='local:t3').data)`));
  ok('B: the PDF is a list entry only: no content, marked', byId['local:t4'] && !byId['local:t4'].has && byId['local:t4'].nd, byId['local:t4']);
  ok('B: the collection, its member and the subscription came', await b(`state.cols.map(c=>c.name+(c.feed?'*':'')).join()`) === '我的合集,示例博客*', await b(`state.cols.map(c=>c.name).join()`));
  ok('B: reading place, bookmark and star came', await b(`state.progress['local:t1'].pct===42 && state.marks['local:t1'][0].label==='开头' && state.flags['notes/guide/index.html'].starred===true`));
  ok('B: the card of the PDF says "仅书单"', await b(`[...document.querySelectorAll('.card')].some(c=>/PDF 书丁/.test(c.textContent) && /仅书单/.test(c.textContent))`));
  await b(`document.querySelector('.card[data-id="local:t4"] .card-title a').click()`); await settleB(800);
  ok('B: opening the PDF explains why it cannot be opened', await b(`/只有书单记录/.test(document.querySelector('#toastMsg').textContent) && document.querySelector('#reader').hidden`), await b(`document.querySelector('#toastMsg').textContent`));
  await b(`document.querySelector('.card[data-id="local:t1"] .card-title a').click()`); await settleB(1800);
  ok('B: a synced text opens in the reader', await b(`!document.querySelector('#reader').hidden && /SECRET-BODY-1/.test(document.querySelector('#frame').contentDocument.body.textContent)`));
  await b(`document.querySelector('#readerBack').click()`); await settleB(400);
  await b(`refreshSubs({ids:state.cols.filter(c=>c.feed).map(c=>c.id),force:true})`); await settleB(3500);
  ok('B: the subscription reads its own articles from the feed (they are not in the sync space)', await b(`state.items.filter(x=>x.id.startsWith('local:feed:')).length`) >= 3);
  await B.shot(require('../paths').SHOTS + '/sync_b_shelf.png');

  // -------------------------------------------------------------- a quiet sync costs two requests
  const c0 = (await peek()).count.sync;
  await a(`syncRun({manual:true})`); await settleA(2000);
  const c1 = (await peek()).count.sync;
  ok('a sync with nothing new is two requests (pull, pull)', c1 - c0 === 2, c1 - c0);

  // -------------------------------------------------------------- changes travel both ways
  await b(`(async()=>{ const now=Date.now(); await idb.put({id:'local:t5',path:'',type:'md',category:'notes',filename:'e.md',hash:'ffee11223344',title:'B 上新写的',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:40,date:'2026-10-02',added:Math.floor(now/1000),featured:false,hidden:false,cover:'',data:'# B 上新写的\\n\\n正文 FROM-B'});
     await idb.del('local:t2'); const f=LS.get('flags',{}); f['local:t3']={starred:true}; LS.set('flags',f); const m=LS.get('marks',{}); m['local:t1']=(m['local:t1']||[]).concat([{pct:60,label:'B 的书签',at:1700000009000}]); LS.set('marks',m); await loadAll(); })()`);
  await b(`syncRun({manual:true})`); await settleB(4000);
  await a(`syncRun({manual:true})`); await settleA(4000);
  const aAfter = await a(`({ids:state.items.filter(x=>x.source==='local'&&!x.id.startsWith('local:feed:')).map(x=>x.id).sort().join(), t5:(state.items.find(x=>x.id==='local:t5')||{}).data, flag:(state.flags['local:t3']||{}).starred, marks:(state.marks['local:t1']||[]).map(x=>x.label).join('|')})`);
  ok('A gets what B added (a text, fetched on the way), B\'s deletion, B\'s star and bookmark', aAfter.ids === 'local:link:s1,local:t1,local:t3,local:t4,local:t5' && /FROM-B/.test(aAfter.t5 || '') && aAfter.flag === true && aAfter.marks === '开头|B 的书签', aAfter);

  // -------------------------------------------------------------- a text edited in the note editor on one device reaches the other (the old text is not kept there)
  await a(`openNote('local:t1')`); await settleA(600);
  await a(`(()=>{ const ta=document.querySelector('#neText'); ta.value+='\\n\\n在 A 上改过 EDITED-ON-A'; ta.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await a(`neClose()`); await settleA(1000);
  const keyA0 = await a(`state.items.find(x=>x.id==='local:t1').bk||''`);
  ok('A: the edit is saved and the record forgot the old text key (the sync works out the new one)', await a(`/EDITED-ON-A/.test(state.items.find(x=>x.id==='local:t1').data)`) && keyA0 === '', keyA0);
  await a(`syncRun({manual:true})`); await settleA(4500);
  await b(`syncRun({manual:true})`); await settleB(6000);
  const tB = await b(`(()=>{ const x=state.items.find(i=>i.id==='local:t1'); return {data:x.data, bk:x.bk||''}; })()`);
  ok('B: gets the edited text of A (not the old one under the new key)', /EDITED-ON-A/.test(tB.data || '') && /SECRET-BODY-1/.test(tB.data || ''), tB);
  await b(`syncRun({manual:true})`); await settleB(3500); await a(`syncRun({manual:true})`); await settleA(3500);
  const tA2 = await a(`state.items.find(x=>x.id==='local:t1')`), tB2 = await b(`state.items.find(x=>x.id==='local:t1')`);
  ok('nothing flips back: after more rounds both devices keep the edit and agree on its key', /EDITED-ON-A/.test(tA2.data) && /EDITED-ON-A/.test(tB2.data) && tA2.bk && tA2.bk === tB2.bk, [tA2.bk, tB2.bk]);
  await b(`openNote('local:t1')`); await settleB(600);
  await b(`(()=>{ const ta=document.querySelector('#neText'); ta.value+='\\n\\n又在 B 上改了 EDITED-ON-B'; ta.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await b(`neClose()`); await settleB(1000);
  await b(`syncRun({manual:true})`); await settleB(4500); await a(`syncRun({manual:true})`); await settleA(6000);
  ok('and the other way round: A gets what B edited next, with both edits in it', await a(`(()=>{ const d=state.items.find(x=>x.id==='local:t1').data||''; return /EDITED-ON-A/.test(d) && /EDITED-ON-B/.test(d); })()`), await a(`state.items.find(x=>x.id==='local:t1').data`));

  // -------------------------------------------------------------- both change things at once
  await a(`(async()=>{ const p=LS.get('progress',{}); p['local:t1']={pct:30,at:1800000000000}; LS.set('progress',p); const rec=(await idb.all()).find(r=>r.id==='local:t3'); rec.title='A 改的标题'; await idb.put(rec); await idb.del('local:t5'); await loadAll(); })()`);
  await b(`(async()=>{ const p=LS.get('progress',{}); p['local:t1']={pct:77,at:1900000000000}; LS.set('progress',p); const rec=(await idb.all()).find(r=>r.id==='local:t5'); rec.title='B 改了 t5 的标题'; await idb.put(rec); const t3=(await idb.all()).find(r=>r.id==='local:t3'); t3.title='B 改的标题'; await idb.put(t3); await loadAll(); })()`);
  await Promise.all([a(`syncRun({manual:true})`), b(`syncRun({manual:true})`)]); await settleB(6000);          // at the same moment: one of them meets a conflict and goes again
  await a(`syncRun({manual:true})`); await settleA(3000); await b(`syncRun({manual:true})`); await settleB(3000); await a(`syncRun({manual:true})`); await settleA(2500);
  const sa = await a(`syncSnapshot()`), sb = await b(`syncSnapshot()`);
  ok('after the dust settles both devices have exactly the same list', JSON.stringify(Object.entries(sa).sort()) === JSON.stringify(Object.entries(sb).sort()), [Object.keys(sa).length, Object.keys(sb).length]);
  const fin = await a(`({p:state.progress['local:t1'], t5:!!state.items.find(x=>x.id==='local:t5'), t3:state.items.find(x=>x.id==='local:t3').title})`);
  ok('the newer reading place wins; edited beats deleted (t5 stays); the same entry edited twice: one of the two stays', fin.p.pct === 77 && fin.t5 === true && ['A 改的标题', 'B 改的标题'].includes(fin.t3), fin);

  // -------------------------------------------------------------- quota
  await post('/__quota?n=40000');
  await a(`(async()=>{ const now=Date.now(); const big='字'.repeat(30000); await idb.put({id:'local:big1',path:'',type:'md',category:'notes',filename:'big.md',hash:'bb0000000001',title:'很大的一篇',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:90000,date:'2026-10-03',added:Math.floor(now/1000),featured:false,hidden:false,cover:'',data:'# 很大的一篇\\n\\n'+Array.from({length:12000},(_,i)=>'随机内容'+Math.floor(Math.random()*1e9)+'x'+i).join(' ')}); await loadAll(); })()`);
  await a(`syncRun({manual:true})`); await settleA(4000);
  const q = await a(`({msg:document.querySelector('#syncMsg').textContent, big:(()=>{ const r=state.items.find(x=>x.id==='local:big1'); return {bk:!!r.bk, nd:!!r.nd}; })(), cfg:syncCfg()})`);
  ok('a full sync space is said, and the text that did not fit is a list entry (the rest still syncs)', /已满/.test(q.msg) && q.big.nd && !q.big.bk, q);
  await b(`syncRun({manual:true})`); await settleB(3500);
  ok('B sees the big one as a list entry only', await b(`(()=>{ const r=state.items.find(x=>x.id==='local:big1'); return !!r && r.data===undefined && !r.bk; })()`));
  await post('/__quota?n=12000000');

  // -------------------------------------------------------------- the vault disappears (expired): nothing is lost, it is made again
  await post('/__expire');
  await a(`syncRun({manual:true})`); await settleA(4500);
  ok('after expiry the next sync makes the vault again from what is here and deletes nothing', await a(`state.items.filter(x=>x.source==='local' && !x.id.startsWith('local:feed:')).length`) >= 5 && (await peek()).keys['v:' + (await a(`(async()=>{ const {syncEnsureKeys}=window.__zt; return (await syncEnsureKeys()).id; })()`) )+ ':a'] > 0);
  await b(`syncRun({manual:true})`); await settleB(4000);
  ok('B, whose vault was gone too, keeps its things as well', await b(`state.items.filter(x=>x.source==='local' && !x.id.startsWith('local:feed:')).length`) >= 5);

  // -------------------------------------------------------------- turning it off, and wiping the cloud
  await a(`document.querySelector('#syncBtn').click()`); await sleep(300);
  const itemsBefore = await a(`state.items.filter(x=>x.source==='local').length`);
  await a(`document.querySelector('#syncWipe').click()`); await settleA(2500);
  ok('wiping deletes the cloud data and stops syncing here, and nothing local is touched', !(await a(`syncCfg()`)) && (await a(`state.items.filter(x=>x.source==='local').length`)) === itemsBefore && !(await peek()).raw.includes('"v:'), (await peek()).keys);
  await b(`syncRun({manual:true})`); await settleB(3000);
  ok('B finds the space gone and makes it again (its things are still all here)', await b(`state.items.filter(x=>x.source==='local' && !x.id.startsWith('local:feed:')).length`) >= 5);
  await b(`document.querySelector('#syncClose').click(); document.querySelector('#syncBtn').click()`); await sleep(300);
  await b(`document.querySelector('#syncOffBtn').click()`); await settleB(800);
  ok('turning it off here keeps everything and shows the invitation again', !(await b(`syncCfg()`)) && await b(`!document.querySelector('#syncOff').hidden && document.querySelector('#syncStat').hidden`));

  // -------------------------------------------------------------- the one question
  await post('/__reset');
  await fresh(A, a);
  ok('the question is not asked before 20 minutes of use', await a(`(payMaybe(), !document.querySelector('#payDlg').open)`));
  await a(`LS.set('use',{ms:19*60*1000}); payMaybe(); 0`); await sleep(200);
  ok('...not at 19 minutes', await a(`!document.querySelector('#payDlg').open`));
  await a(`LS.set('use',{ms:20*60*1000}); payMaybe(); 0`); await settleA(400);
  ok('...at 20 minutes it is asked, with the privacy note', await a(`document.querySelector('#payDlg').open && /匿名计数/.test(document.querySelector('#payDlg').textContent)`));
  await A.shot(require('../paths').SHOTS + '/sync_pay.png');
  await a(`document.querySelector('#payLater').click(); 0`); await sleep(300);
  ok('"later" closes it and waits a week', await a(`!document.querySelector('#payDlg').open && LS.get('pay',{}).after > Date.now()+6*86400000 && !LS.get('pay',{}).done`));
  await a(`payMaybe(); 0`); ok('...and it is not asked again at once', await a(`!document.querySelector('#payDlg').open`));
  await a(`(()=>{ const p=LS.get('pay',{}); p.after=Date.now()-1000; LS.set('pay',p); payMaybe(); })()`); await sleep(300);
  ok('a week later it is asked once more', await a(`document.querySelector('#payDlg').open`));
  await a(`document.querySelector('#payYes').click(); 0`); await sleep(1500);                      // (the thanks stays on the screen for a moment and then closes by itself: a timer, not a quiet page)
  const poll = (await (await fetch(SVC + '/api/sync')).json()).poll;
  ok('"yes" is counted anonymously on the service, thanked, closed, and never asked again', poll.yes === 1 && poll.no === 0 && await a(`!document.querySelector('#payDlg').open && LS.get('pay',{}).done===1`), poll);
  await a(`payMaybe(); 0`); ok('(never again)', await a(`!document.querySelector('#payDlg').open`));
  ok('what is sent for the question is the answer only (the store holds three counters)', Object.keys((await peek()).keys).every(k => k.startsWith('poll:') || k.startsWith('rl:')), Object.keys((await peek()).keys));

  console.log(`\n${pass} passed, ${fail} failed`);
  A.close(); B.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

function syncRandom() { const al = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 24; i++) s += al[Math.floor(Math.random() * 32)]; return s.match(/.{4}/g).join('-'); }
