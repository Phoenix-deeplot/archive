"""A fake blog on 127.0.0.1:8842 whose feed carries the text of its articles (content:encoded), one that is only an excerpt, one with a hostile body.
GET /__log shows the requests; POST /__nocontent drops the text from the feed (to see an older state)."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8842
BASE = 'http://127.0.0.1:%d' % PORT
LOG = []
STATE = {'content': True}
EN = ('Lead time moves with the order size and with the supplier’s calendar. ' * 14)
ZH = ('库存周转率等于销货成本除以平均库存，周转天数则是它的倒数乘以三百六十五。' * 14)
HOSTILE = ('<p onclick="x()">Hostile body ' + 'word ' * 130 + '</p><script>window.__pwned=1</script><img src="https://cdn.example/a.png" onerror="window.__pwned=2" alt="A picture">'
           '<a href="javascript:window.__pwned=3">bad link</a><iframe src="https://evil.example/"></iframe><a href="/relative/page">a relative link</a>')
POSTS = [
    (1, 'Lead time in one picture', 'A short excerpt of the first post.', '<p>%s</p><p><img src="/img/a.png" alt="chart"></p><p><a href="/about">about</a></p>' % EN, 'Wed, 14 Oct 2026 08:00:00 GMT'),
    (2, '库存周转率怎么看', '周转率和周转天数，一张图讲清楚。', '<h2>公式</h2><p>%s</p>' % ZH, 'Tue, 13 Oct 2026 08:00:00 GMT'),
    (3, 'Only an excerpt', 'This feed only carries an excerpt of this one, a couple of lines long.', '', 'Mon, 12 Oct 2026 08:00:00 GMT'),
    (4, 'Hostile body', 'Something that tries to run.', HOSTILE, 'Sun, 11 Oct 2026 08:00:00 GMT'),
]


def rss():
    items = ''
    for n, title, desc, body, date in POSTS:
        enc = '<content:encoded><![CDATA[%s]]></content:encoded>' % body if body and STATE['content'] else ''
        items += '<item><title>%s</title><link>%s/blog/post/%d</link><description>%s</description>%s<pubDate>%s</pubDate></item>' % (title, BASE, n, desc, enc, date)
    return ('<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Text Blog</title><link>%s/blog/</link>'
            '<description>A made-up blog that carries its text</description>%s</channel></rss>' % (BASE, items))


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

    def do_POST(self):
        if self.path == '/__nocontent':
            STATE['content'] = False
            return self.send(200, json.dumps(STATE), 'application/json')
        if self.path == '/__content':
            STATE['content'] = True
            return self.send(200, json.dumps(STATE), 'application/json')
        self.send(404)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/__log':
            return self.send(200, json.dumps(LOG), 'application/json')
        if p in ('/blog/', '/blog'):
            return self.send(200, '<!doctype html><html><head><title>Text Blog</title><link rel="alternate" type="application/rss+xml" href="/blog/feed.xml"></head><body><h1>Text Blog</h1></body></html>')
        if p == '/blog/feed.xml':
            etag = '"t%d"' % (1 if STATE['content'] else 2)
            LOG.append({'path': p, 'if_none_match': self.headers.get('If-None-Match')})
            if self.headers.get('If-None-Match') == etag:
                return self.send(304, b'', 'application/rss+xml', {'ETag': etag})
            return self.send(200, rss(), 'application/rss+xml; charset=utf-8', {'ETag': etag})
        if p == '/robots.txt':
            return self.send(404)
        return self.send(404, 'not found')

    def log_message(self, *a):
        pass


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
