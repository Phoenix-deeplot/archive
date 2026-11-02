"""A fake blog on 127.0.0.1:8850 whose feed carries only excerpts, with articles that can and cannot be read: a Chinese article, an English one, a login wall, a page drawn by scripts,
a PDF, a slow article (3 s), one that robots.txt keeps out, one behind a 403, and one at an address nobody listens on. GET /__log shows the page requests that reached the pages."""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8850
BASE = 'http://127.0.0.1:%d' % PORT
LOG = []
EN = 'Lead time is the gap between the moment an order is placed and the moment the goods are on the shelf, and it moves with the supplier calendar. '
ZH = '库存周转率等于销货成本除以平均库存，周转天数则是它的倒数乘以三百六十五，数字越小说明货卖得越快，占用的资金也越少。'


def article(title, para, n=6, lang='en'):
    return ('<!doctype html><html lang="%s"><head><meta charset="utf-8"><title>%s | Test Blog</title><meta property="og:site_name" content="Test Blog"><meta name="author" content="Ann"></head><body>'
            '<nav><a href="/">Home</a><a href="/about">About</a></nav><article><h1>%s</h1>%s</article><aside class="sidebar"><ul><li><a href="/x">x</a></li></ul></aside><footer>© 2026 Test Blog</footer></body></html>'
            % (lang, title, title, ''.join('<p>%s %d</p>' % (para, i) for i in range(n))))


PAGES = {
    '/a/1': ('text/html; charset=utf-8', article('库存周转率怎么看', ZH, lang='zh-CN'), 0),
    '/a/2': ('text/html; charset=utf-8', article('Lead time in one picture', EN), 0),
    '/a/3': ('text/html; charset=utf-8', article('Safety stock without the maths', EN), 0),
    '/wall': ('text/html; charset=utf-8', '<html><head><title>登录</title></head><body><div class="login-box"><h2>请先登录</h2><p>登录后查看全文。</p></div></body></html>', 0),
    '/spa': ('text/html; charset=utf-8', '<html><body><div id="root"></div><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script></body></html>', 0),
    '/doc.pdf': ('application/pdf', b'%PDF-1.4 fake', 0),
    '/slow': ('text/html; charset=utf-8', article('A slow article', EN + 'Slow. '), 3),
    '/private/a': ('text/html; charset=utf-8', article('Kept out by robots', EN), 0),
    '/x403': ('text/html; charset=utf-8', 'forbidden', 0),
    # a book on a wiki-like site (the picked books of the directory: https://<site>/wiki/<prefix><chapter>)
    '/wiki/Tale': ('text/html; charset=utf-8', article('The Tale', 'The index of a made-up book.', 2), 0),
    '/wiki/Tale/Chapter_1': ('text/html; charset=utf-8', article('Chapter 1', 'It was the first chapter, and the lamps were lit early in the town.', 5), 0),
    '/wiki/Tale/Chapter_2': ('text/html; charset=utf-8', article('Chapter 2', 'It was the second chapter, and the travellers reached the river at noon.', 5), 0),
    '/wiki/Tale/Chapter_3': ('text/html; charset=utf-8', article('Chapter 3', 'It was the third chapter, and the bridge, at last, was found.', 5), 0),
}
POSTS = [(1, '库存周转率怎么看', '/a/1', 'Wed, 14 Oct 2026 08:00:00 GMT'), (2, 'Lead time in one picture', '/a/2', 'Tue, 13 Oct 2026 08:00:00 GMT'), (3, 'Members only', '/wall', 'Mon, 12 Oct 2026 08:00:00 GMT'),
         (4, 'Drawn by scripts', '/spa', 'Sun, 11 Oct 2026 08:00:00 GMT'), (5, 'A PDF report', '/doc.pdf', 'Sat, 10 Oct 2026 08:00:00 GMT'), (6, 'A slow article', '/slow', 'Fri, 09 Oct 2026 08:00:00 GMT'),
         (7, 'Kept out by robots', '/private/a', 'Thu, 08 Oct 2026 08:00:00 GMT'), (8, 'Behind a 403', '/x403', 'Wed, 07 Oct 2026 08:00:00 GMT'), (9, 'Nobody listens here', None, 'Tue, 06 Oct 2026 08:00:00 GMT')]


def rss():
    items = ''.join('<item><title>%s</title><link>%s</link><description>An excerpt of post %d, a line or two long.</description><pubDate>%s</pubDate></item>'
                    % (title, (BASE + path) if path else 'http://127.0.0.1:8899/none', n, date) for n, title, path, date in POSTS)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Excerpt Blog</title><link>%s/blog/</link><description>A made-up blog whose feed carries excerpts only</description>%s</channel></rss>'
            % (BASE, items))


class H(BaseHTTPRequestHandler):
    def send(self, status, body=b'', ctype='text/html; charset=utf-8', extra=None):
        body = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/__log':
            return self.send(200, json.dumps(LOG), 'application/json')
        if p in ('/blog/', '/blog'):
            return self.send(200, '<!doctype html><html><head><title>Excerpt Blog</title><link rel="alternate" type="application/rss+xml" href="/blog/feed.xml"></head><body><h1>Excerpt Blog</h1></body></html>')
        if p == '/blog/feed.xml':
            return self.send(200, rss(), 'application/rss+xml; charset=utf-8')
        if p == '/robots.txt':
            return self.send(200, 'User-agent: *\nDisallow: /private/\n', 'text/plain')
        if p in PAGES:
            ctype, body, delay = PAGES[p]
            LOG.append({'path': p, 'ua': self.headers.get('User-Agent'), 'cookie': self.headers.get('Cookie')})
            if delay:
                time.sleep(delay)
            return self.send(403 if p == '/x403' else 200, body, ctype)
        return self.send(404, 'not found')

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
