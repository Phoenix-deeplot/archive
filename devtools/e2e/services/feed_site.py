"""A made-up blog for the browser tests (port 8841): /blog/ (a home page that announces its feed), /blog/feed.xml?d=<name> (an Atom feed of five entries that
changes when /__add?d=<name> is called, answers 304 to a repeated If-None-Match), /blog/post-<name>-<n> (an article page), /__reset (back to the start).
Written again after the first one was lost: the titles are "<name> 第 N 篇", so a test that needs other words has to say so itself."""
import hashlib
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8841
EXTRA = {}                                                       # name -> how many entries were added since the start


def entries(name):
    n = 5 + EXTRA.get(name, 0)
    return [(i, '%s 第 %d 篇' % (name, i), '2026-10-%02d' % min(28, 10 + i)) for i in range(n, 0, -1)]


def feed(name, base):
    es = entries(name)
    items = ''.join('<entry><title>%s</title><link href="%s/blog/post-%s-%d"/><id>%s/blog/post-%s-%d</id><updated>%sT08:00:00Z</updated><summary>%s 的摘要：这是第 %d 篇。</summary></entry>' % (t, base, name, i, base, name, i, d, t, i) for i, t, d in es)
    return '<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>%s</title><link rel="alternate" href="%s/blog/"/><id>%s/blog/feed.xml?d=%s</id><updated>2026-10-28T08:00:00Z</updated>%s</feed>' % (name, base, base, name, items)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='text/html; charset=utf-8', extra=None):
        b = body.encode('utf-8') if isinstance(body, str) else body
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Access-Control-Allow-Origin', '*')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        base = 'http://127.0.0.1:%d' % PORT
        name = (q.get('d') or ['blog'])[0]
        if u.path == '/__reset':
            EXTRA.clear()
            return self.send(200, json.dumps({'ok': True}), 'application/json')
        if u.path == '/__add':
            EXTRA[name] = EXTRA.get(name, 0) + 1
            return self.send(200, json.dumps({'ok': True, 'n': len(entries(name))}), 'application/json')
        if u.path == '/blog/feed.xml':
            body = feed(name, base)
            etag = '"%s"' % hashlib.sha1(body.encode('utf-8')).hexdigest()[:16]
            if self.headers.get('If-None-Match') == etag:
                return self.send(304, b'', extra={'ETag': etag})
            return self.send(200, body, 'application/atom+xml; charset=utf-8', {'ETag': etag})
        if u.path in ('/blog', '/blog/'):
            return self.send(200, '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>%s</title><link rel="alternate" type="application/atom+xml" href="%s/blog/feed.xml?d=%s"></head><body><h1>%s</h1></body></html>' % (name, base, name, name))
        if u.path.startswith('/blog/post-'):
            title = u.path.rsplit('/', 1)[-1][len('post-'):]
            return self.send(200, '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>%s</title></head><body><article><h1>%s</h1><p>%s</p></article></body></html>' % (title, title, '这是一篇用来测试的文章。' * 20))
        self.send(404, 'not found')


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
