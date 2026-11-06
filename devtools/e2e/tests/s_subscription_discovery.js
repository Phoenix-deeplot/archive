// Isolated live preview: subscription_preview.py :8936, a separate Edge profile :9456.
const {connect, sleep} = require('../cdp');
const BASE = 'http://127.0.0.1:8936';
let pass=0;
function ok(name, value){ if(!value) throw new Error(name); pass++; console.log('PASS',name); }
(async()=>{
  const c=await connect(9456);
  try{
    const wait=async expr=>{ const end=Date.now()+30000; while(Date.now()<end){ if(await c.js(expr)) return; await sleep(150); } throw new Error('Timed out: '+expr); };
    await c.clearSite(BASE);
    await c.mobile(390,844,1);
    await c.goto(BASE+'/?lang=zh');
    await wait('!!window.__zt?.state.dirData');
    const open=async()=>c.js(`document.querySelectorAll('dialog[open]').forEach(d=>d.close()); document.querySelector('#addBtn').click(); document.querySelector('[data-atab="sub"]').click()`);
    const find=async url=>{ await c.js(`(()=>{const e=document.querySelector('#fsUrl'); e.value=${JSON.stringify(url)}; e.dispatchEvent(new Event('input')); document.querySelector('#fsFind').click()})()`); await wait("!document.querySelector('#fsFind').disabled"); };
    await open();
    ok('mobile support guidance visible', await c.js("document.querySelector('#fsSupport').textContent.includes('播客')"));
    await find('https://pod.link/1714394532');
    ok('pod.link resolves the actual show and previews episodes',await c.js("document.querySelector('#fsResult').textContent.includes('鲶鱼夜话') && document.querySelectorAll('#fsResult li').length>0 && !document.querySelector('#fsGo').disabled"));
    ok('show scope explained',await c.js("document.querySelector('#fsResult').textContent.includes('整个节目')"));
    await c.shot(require('path').join(__dirname,'..','.demo','subscription-mobile.png'));
    await c.js("document.querySelector('#fsGo').click()");
    await wait("window.__zt.state.cols.some(c=>c.feed?.url==='https://www.ximalaya.com/album/66572833.xml') && window.__zt.state.items.some(i=>i.feed==='https://www.ximalaya.com/album/66572833.xml')");
    ok('confirmed subscription receives real episodes',true);
    await open(); await find('https://pod.link/1714394532');
    ok('duplicate subscription blocked',await c.js("document.querySelector('#fsGo').disabled"));
    await find('https://space.bilibili.com/2267573');
    ok('missing RSSHub is explained and save-link offered',await c.js("document.querySelector('#fsMsg').textContent.includes('RSSHub') && !document.querySelector('#fsGo').hidden"));
    await find('spotify:show:123');
    ok('unsupported app protocol has a clear message and no subscribe button',await c.js("!document.querySelector('#fsMsg').hidden && document.querySelector('#fsGo').hidden"));
    await c.js(`window.__oldSubscriptionFetch=window.fetch; window.fetch=(url,opt)=>String(url).endsWith('/api/feed')?new Promise(r=>{window.__finishSubscriptionFetch=r}):window.__oldSubscriptionFetch(url,opt); const e=document.querySelector('#fsUrl'); e.value='https://example.org/feed'; e.dispatchEvent(new Event('input')); document.querySelector('#fsFind').click(); e.value='https://other.example.org/feed'; e.dispatchEvent(new Event('input')); window.__finishSubscriptionFetch({status:200,json:async()=>({ok:true,kind:'feed',feed:'https://example.org/feed',title:'Stale feed',items:[]})});`);
    await sleep(100);
    ok('editing URL rejects stale lookup result',await c.js("document.querySelector('#fsResult').hidden && document.querySelector('#fsGo').hidden"));
    await c.js('window.fetch=window.__oldSubscriptionFetch');
    console.log(pass+' passed, 0 failed');
  }finally{c.close();}
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
