// e2e of the "what is this" bar and backup / restore, against the demo app on 8820 (real page, real IndexedDB)
const { connect, sleep } = require('../cdp');
const fs = require('fs'), cp = require('child_process');
const BASE = 'http://127.0.0.1:8820/', BLOG = 'http://127.0.0.1:8841';
const TMP = __dirname + '/bk_tmp/'; fs.mkdirSync(TMP, { recursive: true });
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 400)); } };

(async () => {
  const c = await connect(9444);
  c.autoDialog(true); await c.desktop(1280, 900, 1);
  await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  const J = expr => c.js(`(()=>{ const {state,idb,LS,bkBuild,bkOpen,bkPlan,bkApply,zipOpen,zipBuild,loadAll,addCollection}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  const fresh = async lang => { await c.goto('about:blank', 200); await c.clearSite('http://127.0.0.1:8820'); await c.goto(BASE, 1500); if (lang) { await J(`localStorage.setItem('archive.lang', JSON.stringify('${lang}'))`); await c.goto(BASE, 1800); } };
  const blobB64 = expr => J(`(async()=>{ const r=await ${expr}; const buf=new Uint8Array(await r.blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=0x8000) s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000)); return {name:r.name,n:r.n,b64:btoa(s)}; })()`);
  const importB64 = (b64, name) => J(`(async()=>{ const bin=atob('${b64}'); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); const f=new File([u],'${name}'); try{ const b=await bkOpen(f); const plan=await bkPlan(b); const r=await bkApply(b); await loadAll(); return {plan,r}; }catch(e){ return {error:e.message}; } })()`);
  const importText = (text, name) => J(`(async()=>{ const f=new File([${JSON.stringify(text)}],'${name}'); try{ const b=await bkOpen(f); const plan=await bkPlan(b); const r=await bkApply(b); await loadAll(); return {plan,r}; }catch(e){ return {error:e.message}; } })()`);

  // ---------------------------------------------------------------- 1. the "what is this" window is tested in s_read.js; here: English labels
  await fresh('en');
  ok('English: the button', await J(`document.querySelector('#bkBtn').textContent==='Back up & restore'`));

  // ---------------------------------------------------------------- 2. data to back up
  await fresh('zh');
  await J(`(async()=>{
    const cid=addCollection('我的合集'); const now=Date.now();
    const mk=(id,extra)=>({id,path:'',category:'notes',filename:'',hash:'',title:'',summary:'',keywords:[],lang:'zh',minutes:1,pages:null,size:10,date:'2026-10-01',added:Math.floor(now/1000),featured:false,hidden:false,cover:'',...extra});
    await idb.put(mk('local:t1',{type:'md',filename:'a.md',title:'笔记甲',data:'# 笔记甲\\n\\n正文 中文 ✓ 😀',collection:cid,hash:'aa11bb22cc33',size:30,featured:true}));
    await idb.put(mk('local:t2',{type:'txt',filename:'b.txt',title:'纯文本',data:'第一章\\n内容',hash:'dd44ee55ff66'}));
    await idb.put(mk('local:t3',{type:'html',filename:'c.html',title:'网页',data:'<!doctype html><title>x</title><p>hi</p>',hash:'0123456789ab'}));
    const pdf=new Uint8Array(5000); pdf.set(new TextEncoder().encode('%PDF-1.4\\n')); for(let i=40;i<5000;i++) pdf[i]=i%251;
    await idb.put(mk('local:t4',{type:'pdf',filename:'d.pdf',title:'PDF 书',data:new Blob([pdf],{type:'application/pdf'}),hash:'abcdefabcdef',size:5000,pages:3}));
    await idb.put(mk('local:link:s1',{type:'link',url:'https://example.com/a?x=1',title:'收藏的链接',image:'',from:'example.com'}));
    LS.set('progress',{'local:t1':{pct:42,at:1700000000000}}); LS.set('marks',{'local:t1':[{pct:10,label:'开头',at:1700000001000}]});
    LS.set('flags',{'notes/guide/index.html':{starred:true}}); LS.set('lastRead',{'local:t1':1700000002000}); LS.set('theme','dark');
    await loadAll();
  })()`);
  // a real subscription through the app's own dialog (fake blog on 8841)
  await J(`document.querySelector('#addBtn').click()`); await sleep(400);
  await J(`document.querySelector('[data-atab="sub"]').click(); document.querySelector('#fsUrl').value='${BLOG}/blog/'; document.querySelector('#fsFind').click()`); await sleep(2800);
  await J(`document.querySelector('#fsGo').click()`); await sleep(3500);
  const before = await J(`({local:state.items.filter(x=>x.source==='local').length, cols:state.cols.map(x=>x.name+(x.feed?'*':'')), feedItems:state.items.filter(x=>x.id.startsWith('local:feed:')).length})`);
  ok('setup: 5 own items, 3 feed articles, 2 collections (one a subscription)', before.local === 8 && before.cols.length === 2 && before.feedItems === 3, before);
  ok('intro: not open after the setup', await J(`!document.querySelector('#introDlg').open`));

  // ---------------------------------------------------------------- 3. export, checked with a real zip reader
  const full = await blobB64('bkBuild(true)'); fs.writeFileSync(TMP + 'full.zip', Buffer.from(full.b64, 'base64'));
  const list = await blobB64('bkBuild(false)'); fs.writeFileSync(TMP + 'list.json', Buffer.from(list.b64, 'base64'));
  ok('export: file names', /^zhitree-shelf-\d{4}-\d{2}-\d{2}\.zip$/.test(full.name) && /\.json$/.test(list.name), [full.name, list.name]);
  const py = JSON.parse(cp.execFileSync('python', ['-X', 'utf8', __dirname + '/bk_check.py', TMP + 'full.zip', TMP + 'deflated.zip'], { encoding: 'utf8' }));
  ok('export: Python zipfile accepts it (CRC ok)', py.testzip === null && py.names[0] === 'shelf.json', py);
  ok('export: format, 8 items, 5 files', py.format === 'zhitree-shelf' && py.items === 8 && py.withFiles === true && Object.values(py.file_of).filter(Boolean).length === 4, py);
  ok('export: Markdown text intact (Chinese, symbols, emoji)', py.md_text === '# 笔记甲\n\n正文 中文 ✓ 😀', py.md_text);
  ok('export: PDF bytes intact', py.pdf_len === 5000 && py.pdf_head.startsWith('%PDF-1.4') && py.pdf_pattern_ok, py);
  ok('export: state keys', ['cols', 'flags', 'lastRead', 'marks', 'progress', 'theme'].every(k => py.state_keys.includes(k)), py.state_keys);
  const listJson = JSON.parse(fs.readFileSync(TMP + 'list.json', 'utf8'));
  ok('export (list only): no file contents, flagged', listJson.withFiles === false && listJson.items.filter(i => i.fileOmitted).length === 4 && !JSON.stringify(listJson).includes('正文 中文'), listJson.items.length);

  // ---------------------------------------------------------------- 4. restore into an empty browser
  await fresh('zh');
  const r1 = await importB64(full.b64, 'full.zip');
  ok('restore: plan (8 items, 0 duplicates), applied 8', r1.plan && r1.plan.items === 8 && r1.plan.dup === 0 && r1.r && r1.r.added === 8 && r1.r.skipped === 0, r1);
  const after = await J(`(async()=>{ const g=id=>state.items.find(x=>x.id===id); const pdf=g('local:t4');
    const u=new Uint8Array(await pdf.data.arrayBuffer()); let okp=u.length===5000; for(let i=40;i<5000&&okp;i++) if(u[i]!==i%251) okp=false;
    const feedCol=state.cols.find(x=>x.feed);
    return {md:g('local:t1').data, mdCol:state.cols.find(x=>x.id===g('local:t1').collection)&&state.cols.find(x=>x.id===g('local:t1').collection).name, featured:g('local:t1').featured, txt:g('local:t2').data, html:g('local:t3').data, pdfOk:okp, pdfType:pdf.data.type, pdfPages:pdf.pages,
      link:g('local:link:s1')&&g('local:link:s1').url, cols:state.cols.map(x=>x.name+(x.feed?'*':'')), feed:feedCol&&{url:feedCol.feed.url, etag:feedCol.feed.etag, checked:feedCol.feed.checked}, feedItems:state.items.filter(x=>x.id.startsWith('local:feed:')&&x.collection===feedCol.id).length,
      progress:state.progress['local:t1'], marks:state.marks['local:t1'], flags:state.flags['notes/guide/index.html'], lastRead:state.lastRead['local:t1'], theme:LS.get('theme','?')}; })()`);
  ok('restore: Markdown / text / HTML contents', after.md === '# 笔记甲\n\n正文 中文 ✓ 😀' && after.txt === '第一章\n内容' && after.html.includes('<p>hi</p>'), after);
  ok('restore: PDF bytes and type', after.pdfOk && after.pdfType === 'application/pdf' && after.pdfPages === 3, after);
  ok('restore: collection of the note, star, link', after.mdCol === '我的合集' && after.featured === true && after.link === 'https://example.com/a?x=1', after);
  ok('restore: subscription collection with its address, to be read again (no etag)', after.feed && after.feed.url.includes('/blog/feed.xml') && after.feed.etag === '' && after.feed.checked === 0 && after.feedItems === 3, after);
  ok('restore: progress, bookmark, site-item star, last read', after.progress && after.progress.pct === 42 && after.marks.length === 1 && after.marks[0].label === '开头' && after.flags && after.flags.starred === true && after.lastRead === 1700000002000, after);
  ok('restore: settings applied on an empty browser', after.theme === 'dark', after.theme);
  const r2 = await importB64(full.b64, 'full.zip');
  const cols2 = await J(`state.cols.map(x=>x.name)`);
  ok('restore twice: nothing added, everything skipped, no duplicate collections', r2.r && r2.r.added === 0 && r2.r.skipped === 8 && cols2.length === 2, [r2, cols2]);
  const pr = await J(`(async()=>{ LS.set('progress',{'local:t1':{pct:80,at:1800000000000}}); state.progress=LS.get('progress',{}); const f=new File([await (await fetch('${'data:application/octet-stream;base64,'}'+'${full.b64}')).blob()],'x.zip'); const b=await bkOpen(f); await bkApply(b); return LS.get('progress',{})['local:t1']; })()`);
  ok('restore: never overwrites newer progress', pr && pr.pct === 80, pr);

  // ---------------------------------------------------------------- 5. a backup repacked by another tool (deflate)
  await fresh('zh');
  const defl = fs.readFileSync(TMP + 'deflated.zip').toString('base64');
  const r3 = await importB64(defl, 'deflated.zip');
  const pdfOk = await J(`(async()=>{ const p=state.items.find(x=>x.id==='local:t4'); if(!p) return false; const u=new Uint8Array(await p.data.arrayBuffer()); return u.length===5000 && u[100]===100%251; })()`);
  ok('deflated zip (made by Python): restores', r3.r && r3.r.added === 8 && pdfOk, r3);

  // ---------------------------------------------------------------- 6. list-only backup into an empty browser
  await fresh('zh');
  const r4 = await importText(fs.readFileSync(TMP + 'list.json', 'utf8'), 'list.json');
  ok('list-only: links and subscription come, files without content are reported and not made up', r4.plan && r4.plan.omitted === 4 && r4.r.added === 4 && (await J(`state.items.filter(x=>x.source==='local').length`)) === 4, r4);

  // ---------------------------------------------------------------- 7. a backup is data from outside
  await fresh('zh');
  const evil = { format: 'zhitree-shelf', version: 1, withFiles: false, items: [
    { id: 'local:ok1', type: 'link', url: 'https://example.com/ok', title: 'fine', summary: 'x'.repeat(5000), keywords: ['a', 'b'] },
    { id: 'local:js1', type: 'link', url: 'javascript:alert(1)', title: 'bad link' },
    { id: '../../etc/passwd', type: 'link', url: 'https://example.com/b', title: 'bad id' },
    { id: 'local:exe', type: 'exe', title: 'bad type' },
    { id: 'local:nofile', type: 'md', title: 'file entry without a file', file: 'files/9999.md' },
    'not an object', null, 7,
  ], state: { flags: JSON.parse('{"__proto__":{"polluted":true},"notes/x.md":{"starred":true,"__proto__":{"p2":1}}}'), progress: { 'local:ok1': { pct: 'NaN', at: 'x' }, '__proto__': { pct: 1 } }, cols: [{ id: 'bad id!', name: 'x' }, { id: 'c1', name: 'A', feed: { url: 'javascript:alert(2)' } }, { id: 'c2', name: '<b>B</b>' }], theme: 'neon', lang: 'fr' } };
  const r5 = await importText(JSON.stringify(evil), 'evil.json');
  const st5 = await J(`({items:state.items.filter(x=>x.source==='local').map(x=>x.id+'|'+x.title.length+'|'+x.summary.length), cols:state.cols.map(x=>x.id+':'+x.name), polluted:({}).polluted, p2:({}).p2, flags:Object.keys(state.flags), progress:state.progress, theme:LS.get('theme','-'), lang:LS.get('lang','-')})`);
  ok('hostile backup: only the valid item, cut to length', r5.r && r5.r.added === 1 && st5.items.length === 1 && st5.items[0].startsWith('local:ok1|') && st5.items[0].endsWith('|401'), [r5, st5]);
  ok('hostile backup: no prototype pollution, unsafe keys dropped', st5.polluted === undefined && st5.p2 === undefined && !st5.flags.includes('__proto__') && st5.flags.includes('notes/x.md'), st5);
  ok('hostile backup: bad collections skipped, values validated, bad settings ignored', st5.cols.join() === 'c2:<b>B</b>' && st5.theme === '-' && st5.lang === 'zh', st5);
  const bad1 = await importText(JSON.stringify({ format: 'something-else', items: [] }), 'a.json');
  const bad2 = await importText(JSON.stringify({ format: 'zhitree-shelf', version: 2, items: [] }), 'b.json');
  const bad3 = await importText('PK\u0003\u0004 this is not really a zip', 'c.zip');
  const half = Buffer.from(full.b64, 'base64'); const bad4 = await importB64(half.subarray(0, Math.floor(half.length / 2)).toString('base64'), 'half.zip');
  ok('bad files are refused: wrong format / newer version / fake zip / cut zip', bad1.error === 'bad' && bad2.error === 'new' && bad3.error === 'bad' && bad4.error === 'bad', [bad1, bad2, bad3, bad4]);

  // ---------------------------------------------------------------- 8. the dialog, with a real file chosen
  await fresh('zh');
  await J(`document.querySelector('#bkBtn').click()`); await sleep(400);
  ok('dialog: opens with the summary line', await J(`document.querySelector('#bkDlg').open && /这个浏览器里现在有 0 项/.test(document.querySelector('#bkSize').textContent)`), await J(`document.querySelector('#bkSize').textContent`));
  await c.send('DOM.enable'); const doc = await c.send('DOM.getDocument', { depth: 1 }); const inp = await c.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#bkFile' });
  await c.send('DOM.setFileInputFiles', { files: [(TMP + 'full.zip').replace(/\//g, '\\')], nodeId: inp.nodeId }); await sleep(1200);
  ok('dialog: shows what the backup holds and offers to merge', await J(`!document.querySelector('#bkPlan').hidden && /8 项/.test(document.querySelector('#bkPlan').textContent) && !document.querySelector('#bkGo').hidden`), await J(`document.querySelector('#bkPlan').textContent`));
  await c.shot(require('../paths').SHOTS + '/bk_dialog_plan.png');
  await J(`document.querySelector('#bkGo').click()`); await sleep(1800);
  ok('dialog: reports the result and offers "完成"', await J(`/已导入 8 项/.test(document.querySelector('#bkStatus').textContent) && document.querySelector('#bkGo').textContent==='完成'`), await J(`document.querySelector('#bkStatus').textContent`));
  await J(`document.querySelector('#bkGo').click()`); await sleep(2500);
  ok('dialog: finishing reloads the page with everything in place', await J(`!document.querySelector('#bkDlg').open && state.items.filter(x=>x.source==='local').length===8 && state.theme==='dark'`), await J(`state.items.filter(x=>x.source==='local').length`));
  await J(`document.querySelector('#bkBtn').click()`); await sleep(400);
  await c.shot(require('../paths').SHOTS + '/bk_dialog_zh.png');
  await fresh('en'); await J(`document.querySelector('#bkBtn').click()`); await sleep(400);
  ok('dialog (English): strings', await J(`/Export a full backup/.test(document.querySelector('#bkFull').textContent) && /Restore from a backup/.test(document.querySelector('#bkDlg h3').textContent)`));
  await c.shot(require('../paths').SHOTS + '/bk_dialog_en.png');

  // ---------------------------------------------------------------- 9. a big shelf: memory and time
  await fresh('zh');
  const big = await J(`(async()=>{ const t0=performance.now(); const now=Date.now();
    for(let i=0;i<12;i++){ const u=new Uint8Array(8*1048576); for(let o=0;o<u.length;o+=65536) crypto.getRandomValues(u.subarray(o,Math.min(o+65536,u.length)));
      await idb.put({id:'local:big'+i,path:'',type:'pdf',category:'books',filename:'big'+i+'.pdf',hash:'',title:'big '+i,summary:'',keywords:[],lang:'en',minutes:1,pages:1,size:u.length,date:'2026-10-01',added:Math.floor(now/1000),featured:false,hidden:false,cover:'',data:new Blob([u],{type:'application/pdf'})}); }
    await loadAll(); const t1=performance.now(); const r=await bkBuild(true); const t2=performance.now();
    const z=await zipOpen(r.blob); const back=await z.read('files/0003.pdf'); const m=JSON.parse(await (await z.read('shelf.json')).text());
    const orig=state.items.find(x=>x.id===m.items.find(i=>i.file==='files/0003.pdf').id).data;
    const a=new Uint8Array(await back.arrayBuffer()), b=new Uint8Array(await orig.arrayBuffer()); let same=a.length===b.length; for(let i=0;i<a.length&&same;i+=997) if(a[i]!==b[i]) same=false;
    return {zipMB:(r.blob.size/1048576).toFixed(1), buildSec:((t2-t1)/1000).toFixed(1), items:m.items.length, same}; })()`);
  ok('big shelf: 12 x 8 MB PDFs -> one zip of ~96 MB, read back correctly', big.items === 12 && Number(big.zipMB) > 95 && big.same, big);
  console.log('   big shelf:', JSON.stringify(big));

  console.log(`\n${pass} passed, ${fail} failed`);
  c.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
