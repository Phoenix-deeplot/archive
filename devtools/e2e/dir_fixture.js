// a made-up public directory for the page tests: blogs, a YouTube channel, a repository, readers' links, posts, the directory service's own hot lists (Weibo, GitHub), a Zhihu column,
// a shelf with no tag at all (its domain is guessed), a news shelf
const fs = require('fs');
const O = require('./paths').DIST + '/';
const DIRF = O + 'dir/directory.json';
const dir0 = JSON.parse(fs.readFileSync(DIRF, 'utf8'));
const SVC = 'http://127.0.0.1:' + (process.env.E2E_HOT_PORT || '8840');
const shelf = (id, name, kind, lang, tags, n, extra) => ({ id, name, description: name + ' 的简介', home: 'http://127.0.0.1:8841/blog/', kind, lang, license: '', tags, n, updated: '2026-10-20', feed: kind === 'feed' ? 'http://127.0.0.1:8841/blog/feed.xml?d=' + id : '', status: 'ok', ...extra });
const item = (id, title, shelfId, date, type, url, tags, lang, extra) => ({ id, title, summary: title + '的摘要', url, image: '', date, type, lang: lang || 'zh', tags, shelf: shelfId, ...extra });
const SHELVES = [
  shelf('blogA', '供应链周刊', 'feed', 'zh', ['供应链'], 4, { featured: true, blurb: '每周一篇，读完就能用的供应链实战笔记' }),
  shelf('blogB', 'Tech Notes', 'feed', 'en', ['tech'], 3),
  shelf('ytC', 'Some Channel', 'feed', 'en', ['music'], 2, { feed: 'https://www.youtube.com/feeds/videos.xml?channel_id=xyz', home: 'https://www.youtube.com/@some' }),
  shelf('repoD', 'Repo Docs', 'repo', 'en', ['开源'], 2, { home: 'https://github.com/o/r' }),
  shelf('linksE', '读者分享', 'link', 'zh', [], 2),
  shelf('posts', '社区投稿', 'post', 'zh', [], 1, { topics: ['culture'] }),             // (a program that names its own domain: the guess is not used)
  shelf('zhcol', '知乎专栏：数据人生', 'feed', 'zh', ['学术'], 2, { home: 'https://zhuanlan.zhihu.com/p/dataLife', feed: 'http://127.0.0.1:8841/blog/feed.xml?d=zhcol' }),
  shelf('hotweibo', '微博热搜', 'feed', 'zh', ['新闻'], 6, { home: 'https://s.weibo.com/top/summary', feed: SVC + '/api/hot?p=weibo' }),
  shelf('hotgh', 'GitHub Trending（今日）', 'feed', 'en', ['开源'], 5, { home: 'https://github.com/trending', feed: SVC + '/api/hot?p=github' }),
  shelf('gadget', '数码评测周报', 'feed', 'zh', [], 2, { description: '手机、电脑和数码产品的评测', feed: 'http://127.0.0.1:8841/blog/feed.xml?d=gadget' }),
  shelf('hnews', 'HN 精选', 'feed', 'en', ['tech'], 2, { home: 'https://news.ycombinator.com/', feed: 'http://127.0.0.1:8841/blog/feed.xml?d=hnews' }),
  shelf('newsdesk', '每日新闻简报', 'feed', 'zh', ['新闻', '时事'], 2, { feed: 'http://127.0.0.1:8841/blog/feed.xml?d=newsdesk' }),
  shelf('mixed', 'Money and Machines', 'feed', 'en', ['tech', 'finance'], 4, { feed: 'http://127.0.0.1:8841/blog/feed.xml?d=mixed' }),         // one program, two domains: each ARTICLE goes where it belongs
];
const hotItems = (sid, base, plat, n) => Array.from({ length: n }, (_, i) => item(sid + '_' + (i + 1), base + (i + 1), sid, '2026-10-22', 'article', plat + '/' + (i + 1), [], 'zh', { summary: '第 ' + (i + 1) + ' 名 · ' + (900 - i * 100) }));
const ITEMS = [
  item('a1aaaaaaa1', '供应链甲', 'blogA', '2026-10-20', 'article', 'http://127.0.0.1:8850/blog/a1', ['供应链']),
  item('a2aaaaaaa2', '供应链乙', 'blogA', '2026-10-19', 'article', 'http://127.0.0.1:8850/blog/a2', ['供应链']),
  item('a3aaaaaaa3', '供应链丙', 'blogA', '2026-10-18', 'article', 'http://127.0.0.1:8850/blog/a3', ['供应链']),
  item('a4aaaaaaa4', '供应链丁', 'blogA', '2026-10-17', 'article', 'http://127.0.0.1:8850/blog/a4', ['供应链']),
  item('b1bbbbbbb1', 'Tech one', 'blogB', '2026-10-21', 'article', 'http://127.0.0.1:8850/blog/b1', ['tech'], 'en'),
  item('b2bbbbbbb2', 'Tech two', 'blogB', '2026-10-16', 'article', 'http://127.0.0.1:8850/blog/b2', ['tech'], 'en'),
  item('b3bbbbbbb3', 'Tech three', 'blogB', '2026-10-15', 'article', 'http://127.0.0.1:8850/blog/b3', ['tech'], 'en'),
  item('y1yyyyyyy1', 'A video', 'ytC', '2026-10-14', 'video', 'https://www.youtube.com/watch?v=aaa', ['music'], 'en'),
  item('y2yyyyyyy2', 'Another video', 'ytC', '2026-10-13', 'video', 'https://www.youtube.com/watch?v=bbb', ['music'], 'en'),
  item('g1ggggggg1', 'Repo doc one', 'repoD', '2026-10-12', 'note', 'https://github.com/o/r/blob/main/a.md', ['开源'], 'en'),
  item('g2ggggggg2', 'Repo doc two', 'repoD', '2026-10-11', 'note', 'https://github.com/o/r/blob/main/b.md', ['开源'], 'en'),
  item('l1lllllll1', '读者分享一', 'linksE', '2026-10-10', 'article', 'http://127.0.0.1:8850/blog/l1', ['随笔']),
  item('l2lllllll2', '读者分享二', 'linksE', '2026-10-09', 'article', 'http://127.0.0.1:8850/blog/l2', ['随笔']),
  item('p1ppppppp1', '社区一篇', 'posts', '2026-10-08', 'article', 'http://127.0.0.1:8850/blog/p1', []),
  item('z1zzzzzzz1', '知乎专栏一', 'zhcol', '2026-10-21', 'article', 'https://zhuanlan.zhihu.com/p/1', ['学术']),
  item('z2zzzzzzz2', '知乎专栏二', 'zhcol', '2026-10-20', 'article', 'https://zhuanlan.zhihu.com/p/2', ['学术']),
  item('h1hhhhhhh1', 'HN story one', 'hnews', '2026-10-23', 'article', 'https://news.ycombinator.com/item?id=1', ['tech'], 'en'),
  item('h2hhhhhhh2', 'HN story two', 'hnews', '2026-10-22', 'article', 'https://news.ycombinator.com/item?id=2', ['tech'], 'en'),
  item('d1ddddddd1', '新机评测：手机', 'gadget', '2026-10-21', 'article', 'http://127.0.0.1:8850/blog/d1', []),
  item('d2ddddddd2', '笔记本电脑对比', 'gadget', '2026-10-20', 'article', 'http://127.0.0.1:8850/blog/d2', []),
  item('n1nnnnnnn1', '今日要闻一', 'newsdesk', '2026-10-22', 'article', 'http://127.0.0.1:8850/blog/n1', ['新闻']),
  item('n2nnnnnnn2', '今日要闻二', 'newsdesk', '2026-10-22', 'article', 'http://127.0.0.1:8850/blog/n2', ['新闻']),
  item('m1mmmmmmm1', 'New AI chip from Nvidia doubles speed', 'mixed', '2026-10-24', 'article', 'http://127.0.0.1:8850/blog/m1', [], 'en', { summary: 'Nvidia says the new part runs models twice as fast as the last one, at the same price.' }),
  item('m2mmmmmmm2', 'Stock markets fall as inflation worries grow', 'mixed', '2026-10-23', 'article', 'http://127.0.0.1:8850/blog/m2', [], 'en', { summary: 'Investors sold bonds and shares on Friday after new price data came in higher than hoped.' }),
  item('m3mmmmmmm3', 'A quiet story about nothing much', 'mixed', '2026-10-22', 'article', 'http://127.0.0.1:8850/blog/m3', [], 'en', { summary: 'Nothing in it points anywhere, so it stays with the first domain of its program.' }),
  item('m4mmmmmmm4', 'A picture story with a picture', 'mixed', '2026-10-21', 'article', 'http://127.0.0.1:8850/blog/m4', [], 'en', { image: 'https://img.invalid/m4.png', summary: 'This one has a picture that cannot be loaded here, so the generated cover steps in.' }),
  ...hotItems('hotweibo', '微博热搜词', 'https://s.weibo.com/weibo?q=', 6),
  ...hotItems('hotgh', 'owner/repo-', 'https://github.com/owner/repo-', 5),
];
const writeDir = () => { const d = JSON.parse(JSON.stringify(dir0)); d.shelves = SHELVES; d.items = ITEMS; d.count = ITEMS.length; delete d.topics; d.tags = [{ name: '供应链', slug: 'gys', n: 4 }, { name: 'tech', slug: 'tech', n: 3 }]; fs.writeFileSync(DIRF, JSON.stringify(d)); };
module.exports = { SHELVES, ITEMS, writeDir, SVC };
