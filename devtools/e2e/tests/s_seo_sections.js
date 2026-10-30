// The pages that the build writes for the sections of the public directory (/discover/, /hot/, /listen/, /picks/books/, /picks/articles/, /watch/): they exist, say what they are, are in the
// sitemap and urls.txt (the empty books page is not, and says noindex), and the private files of the project are not published. No browser: it builds a demo into a temporary folder.
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const { HERE, SRC } = require('../paths');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra).slice(0, 500)); } };

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-sections-'));
const r = cp.spawnSync('python', ['-X', 'utf8', path.join(HERE, 'make_demo.py'), '--src', SRC, '--out', out, '--site-url', 'https://example.test'], { encoding: 'utf8' });
ok('the demo builds with --seo', r.status === 0, (r.stdout + r.stderr).slice(-400));
const dist = path.join(out, 'dist');
const read = p => { try { return fs.readFileSync(path.join(dist, p), 'utf8'); } catch (e) { return null; } };
const S = [['discover', '发现', true], ['hot', '热榜', true], ['listen', '今日听什么', true], ['picks/books', '精选图书', false], ['picks/articles', '精选文章', true], ['watch', '看什么', true]];
const sitemap = read('sitemap.xml') || '', urls = (read('urls.txt') || '').split('\n');

for (const [rel, label, indexed] of S) {
  const h = read(rel + '/index.html');
  ok(`/${rel}/ is written`, !!h);
  if (!h) continue;
  ok(`/${rel}/ is called "${label}" (the title, the heading of the page, the text for a browser without scripts)`, h.includes(`<title>${label}｜`) && h.includes(`<h1 id="viewTitle">${label}</h1>`) && h.includes(`<noscript><h1>${label}</h1>`), h.match(/<title>[^<]*<\/title>/));
  ok(`/${rel}/ has its own address (canonical, when it may be indexed) and links to the other sections`, (!indexed || h.includes(`href="https://example.test/${rel}/"`)) && ['/discover/', '/hot/', '/listen/', '/picks/books/', '/picks/articles/', '/watch/'].every(p => h.includes(`<a href="${p}">`)), h.match(/<link rel="canonical"[^>]*>/));
  const inMap = sitemap.includes(`<loc>https://example.test/${rel}/</loc>`), inUrls = urls.includes(`https://example.test/${rel}/`);
  ok(`/${rel}/ ${indexed ? 'is in the sitemap and in urls.txt, and may be indexed' : 'is NOT in the sitemap or urls.txt and says noindex (nothing to recommend yet)'}`, indexed ? inMap && inUrls && !/name="robots" content="noindex/.test(h) : !inMap && !inUrls && /name="robots" content="noindex/.test(h), { inMap, inUrls });
}
ok('"精选文章" is called the same in the side list as on its page (one word for the section, the owner’s)', (fs.readFileSync(path.join(SRC, 'index.html'), 'utf8').match(/articles:\['([^']*)','([^']*)'\]/) || [])[1] === '精选文章');
for (const f of ['AGENTS.md', 'CLAUDE.md', 'README.md', 'PROMO.md', 'site.json', 'serve.py', 'seo.py', 'build_index.py', 'vercel.json']) ok(`${f} is not in the published site`, !fs.existsSync(path.join(dist, f)));
for (const d of ['docs', 'devtools']) ok(`${d}/ is not in the published site`, !fs.existsSync(path.join(dist, d)));
try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) { /* the temporary folder stays */ }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
