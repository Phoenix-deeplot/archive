// Reader usability regression checks. Uses Codex's isolated ports by default.
const { connect, sleep } = require('../cdp');
const path = require('path');
const os = require('os');
const BASE = process.env.READER_TEST_BASE || 'http://127.0.0.1:8920/';
const CDP_PORT = Number(process.env.READER_TEST_CDP || 9454);
const SHELL2 = process.env.READER_TEST_SHELL === '2';
let passed = 0, failed = 0;
const check = (name, yes, detail) => {
  if (yes) { passed++; console.log('PASS', name); }
  else { failed++; console.log('FAIL', name, JSON.stringify(detail)); }
};
const swipe = async (c, x1, y1, x2, y2) => {
  await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});
  for(let i=1;i<=8;i++){ await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/8,y:y1+(y2-y1)*i/8}]}); await sleep(12); }
  await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await sleep(450);
};

(async () => {
  const c = await connect(CDP_PORT);
  const J = expr => c.js(`(()=>{ const {state,idb,LS,loadAll,render,addCollection,openReader}=window.__zt||{}; return eval(${JSON.stringify(expr)}); })()`);
  await c.mobile(375, 812, 2);
  await c.goto('about:blank', 200);
  await c.clearSite(new URL(BASE).origin);
  await c.goto(BASE + (SHELL2 ? '?shell=2' : ''), 1000);
  await J(`localStorage.setItem('archive.intro','1'); localStorage.setItem('archive.ver', JSON.stringify('2026-10-22'))`);
  await c.goto(BASE, 1600);
  await J(`(async()=>{
    const cid=addCollection('阅读器测试');
    for(const [id,title,added] of [['a','甲',300],['b','乙',200],['c','丙',100]])
      await idb.put({id:'local:'+id,path:'',category:'notes',filename:id+'.md',hash:'',title,summary:'',keywords:[],lang:'zh',minutes:1,date:'2026-01-01',added,featured:false,hidden:false,cover:'',collection:cid,type:'md',data:'# '+title+'\\n\\n## 第一节\\n\\n'+'正文。'.repeat(200)});
    await loadAll(); state.col=cid; LS.set('col',cid); render();
  })()`);
  await sleep(300);
  await J(`document.querySelector('.card-title a').click()`);
  await sleep(700);
  check('我的书架：阅读器有三篇切篇顺序', await J(`state.visible.length===3 && state.readingId==='local:a'`), await J(`({id:state.readingId, visible:state.visible})`));
  const mobileNav = await J(`({shown:document.querySelector('#readerMobileNav').offsetParent!==null,pos:document.querySelector('#readerMobilePos').textContent,prev:document.querySelector('#readerMobilePrev').disabled,next:document.querySelector('#readerMobileNext').disabled})`);
  check('手机阅读器直接显示上一篇/下一篇，不必先打开目录', mobileNav.shown && mobileNav.pos==='1 / 3' && mobileNav.prev && !mobileNav.next, mobileNav);
  const navRect = await J(`(()=>{ const n=document.querySelector('#readerMobileNav').getBoundingClientRect(), f=document.querySelector('.frame-wrap').getBoundingClientRect(), p=document.querySelector('#readerMobilePrev').getBoundingClientRect(); return {navTop:n.top,frameBottom:f.bottom,buttonHeight:p.height}; })()`);
  check('手机切篇栏在正文下方且按钮至少 44px', navRect.navTop>=navRect.frameBottom-1 && navRect.buttonHeight>=44, navRect);
  if (SHELL2) check('新版外壳阅读时隐藏底栏，只显示阅读器切篇栏', await J(`document.body.classList.contains('shell2') && getComputedStyle(document.querySelector('#tabbar')).display==='none' && document.querySelector('#readerMobileNav').offsetParent!==null`));
  await c.shot(process.env.READER_TEST_SHOT || path.join(os.tmpdir(), 'codex-reader-usability-mobile.png'));
  await J(`document.querySelector('#readerMobileNext').click()`);
  await sleep(500);
  check('手机下一篇按钮能切篇并更新位置', await J(`state.readingId==='local:b' && document.querySelector('#readerMobilePos').textContent==='2 / 3'`), await J(`({id:state.readingId,pos:document.querySelector('#readerMobilePos').textContent})`));
  await J(`document.querySelector('#readerToc').click()`);
  await sleep(150);
  await J(`document.querySelector('#rBack').click()`);
  check('点目录外的页面可关闭目录但保留阅读器', await J(`document.querySelector('#rTocPanel').hidden && !document.querySelector('#reader').hidden`));
  await J(`document.querySelector('#readerBack').click()`);
  await sleep(500);
  if (SHELL2) check('退出阅读后新版底栏恢复', await J(`document.querySelector('#reader').hidden && getComputedStyle(document.querySelector('#tabbar')).display!=='none'`));

  await J(`(async()=>{
    const d=await (await fetch('/dir/directory.json')).json();
    state.dirData=d; state.dirState='ok'; state.dirCfg=new URL('/dir/',location.href).href;
    state.shelfMap=new Map(d.shelves.map(s=>[s.id,s]));
    state.space='dir'; state.dBrowse=true; state.dTag='供应链'; state.dType='all';
    render();
  })()`);
  await sleep(300);
  const before = await J(`({tag:state.dTag,browse:state.dBrowse,ids:state.visible.slice(),space:state.space})`);
  check('公共目录筛选先已设置', before.tag==='供应链' && before.browse, before);
  await J(`(()=>{
    for(const d of state.dirData.items.filter(x=>x.shelf==='blogA'))
      state.tmp.set('tmp:'+d.id,{id:'tmp:'+d.id,source:'tmp',type:'link',url:d.url,title:d.title,summary:d.summary,keywords:d.tags,lang:d.lang,date:d.date,category:'notes',content:'<h1>'+d.title+'</h1><p>'+'正文。'.repeat(220)+'</p>'});
    const d=state.dirData.items.find(x=>x.id==='a1aaaaaaa1');
    return openReader('tmp:'+d.id);
  })()`);
  await sleep(500);
  const nav = await J(`({pos:document.querySelector('#readerPos').textContent,next:document.querySelector('#readerNext').disabled,id:state.readingId,visible:state.visible.slice()})`);
  check('公共目录文章有自己的上一篇/下一篇顺序', /^\d+ \/ \d+$/.test(nav.pos) && !nav.next, nav);
  await J(`document.querySelector('#readerMobileNext').click()`);
  await sleep(400);
  const next = await J(`({id:state.readingId,pos:document.querySelector('#readerMobilePos').textContent})`);
  check('公共目录下一篇打开同一筛选下的文章', next.id==='tmp:a2aaaaaaa2' && next.pos==='2 / 4', next);
  const frameY = await J(`(()=>{ const r=document.querySelector('#frame').getBoundingClientRect(); return r.top+Math.min(200,r.height/2); })()`);
  await swipe(c,300,frameY,70,frameY+6);
  const swiped = await J(`({id:state.readingId,pos:document.querySelector('#readerMobilePos').textContent})`);
  check('公共目录横滑也沿同一筛选切到下一篇', swiped.id==='tmp:a3aaaaaaa3' && swiped.pos==='3 / 4', swiped);
  await J(`history.back()`);
  await sleep(650);
  if (!(await J(`document.querySelector('#reader').hidden`))) {
    // Some headless browsers refuse script-initiated Back without a trusted gesture.
    await J(`window.dispatchEvent(new PopStateEvent('popstate',{state:null}))`);
    await sleep(150);
  }
  const after = await J(`({tag:state.dTag,browse:state.dBrowse,space:state.space})`);
  check('浏览器返回关闭阅读器，不丢公共目录筛选', after.tag==='供应链' && after.browse && after.space==='dir', after);
  await c.mobile(320,640,2);
  await J(`openReader('tmp:a1aaaaaaa1')`);
  await sleep(250);
  const narrow = await J(`(()=>{ const n=document.querySelector('#readerMobileNav').getBoundingClientRect(), a=document.querySelector('#readerMobilePrev').getBoundingClientRect(), b=document.querySelector('#readerMobileNext').getBoundingClientRect(); return {width:innerWidth,left:n.left,right:n.right,prev:a.width,next:b.width,shown:!document.querySelector('#readerMobileNav').hidden}; })()`);
  check('320px 窄屏切篇栏仍完整且按钮可点', narrow.shown && narrow.left>=0 && narrow.right<=narrow.width+1 && narrow.prev>=44 && narrow.next>=44, narrow);
  await c.goto(BASE+'picks/articles/',1400);
  await J(`(async()=>{
    const d=await (await fetch('/dir/directory.json')).json();
    state.dirData=d; state.dirState='ok'; state.dirCfg=new URL('/dir/',location.href).href; state.shelfMap=new Map(d.shelves.map(s=>[s.id,s]));
    state.space='dir'; state.dLanding='articles'; state.dType='article'; state.dBrowse=true; state.dTag='供应链';
    const a=d.items.find(x=>x.id==='a1aaaaaaa1');
    state.tmp.set('tmp:'+a.id,{id:'tmp:'+a.id,source:'tmp',type:'link',url:a.url,title:a.title,summary:a.summary,keywords:a.tags,lang:a.lang,date:a.date,category:'notes',content:'<h1>'+a.title+'</h1><p>'+'正文。'.repeat(220)+'</p>'});
    render();
  })()`);
  await J(`openReader('tmp:a1aaaaaaa1')`);
  await sleep(250);
  await J(`document.querySelector('#readerBack').click()`);
  await sleep(500);
  const routed = await J(`({path:location.pathname,tag:state.dTag,landing:state.dLanding,closed:document.querySelector('#reader').hidden})`);
  check('栏目页用页面返回键退出，保留栏目与标签筛选', routed.closed && routed.path==='/picks/articles/' && routed.tag==='供应链' && routed.landing==='articles', routed);

  console.log(`\n${passed} passed, ${failed} failed`);
  c.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
