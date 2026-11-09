"""Local subscription preview, with the isolated API worktree and demo library.

Build with E2E_APP_PORT=8936, then run with --api-root <API worktree>.
No environment files or production credentials are loaded.
"""
import argparse
import json
import os
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--api-root', required=True)
    ap.add_argument('--port', type=int, default=8936)
    ap.add_argument('--demo-root', default=str(Path(__file__).resolve().parent / '.demo' / 'dist'))
    ap.add_argument('--feed-api', default='', help='optional feed API URL, for reusing a local API process that can reach public feeds')
    ap.add_argument('--submit-api', default='', help='optional submit API URL; the local route is check-only unless a database is explicitly configured')
    args = ap.parse_args()
    sys.path.insert(0, args.api_root)
    import feedapi
    import submission
    root = Path(args.demo_root).resolve()
    if not (root / 'index.html').is_file():
        ap.error('Build the isolated demo first with make_demo.py')
    base = 'http://127.0.0.1:' + str(args.port)
    feed_api = args.feed_api or base + '/api/feed'
    submit_api = args.submit_api or base + '/api/submit'
    env = {'ALLOW_LOCAL_ORIGIN': '1', 'IP_SALT': 'subscription-preview'}
    feedback = []
    if os.environ.get('RSSHUB_BASE'):
        env['RSSHUB_BASE'] = os.environ['RSSHUB_BASE']
    lock = threading.Lock()  # aggregate's reading budget is process-wide

    class Handler(SimpleHTTPRequestHandler):
        def do_POST(self):
            if self.path == '/api/feed':
                with lock:
                    feedapi.respond(self, env, 'POST')
            elif self.path == '/api/submit':
                with lock:
                    submission.respond(self, env, 'POST')
            elif self.path == '/api/feedback':
                try:
                    length = min(int(self.headers.get('Content-Length') or 0), 6000)
                    feedback.append(json.loads(self.rfile.read(length).decode('utf-8')))
                except (ValueError, UnicodeDecodeError):
                    return self.send_error(400)
                body = b'{"ok":true}'
                self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
            else:
                self.send_error(404)

        def do_OPTIONS(self):
            if self.path == '/api/submit':
                submission.respond(self, env, 'OPTIONS')
            else:
                feedapi.respond(self, env, 'OPTIONS')

        def do_GET(self):
            if self.path.split('?')[0] == '/api/feed':
                return feedapi.respond(self, env, 'GET')
            if self.path.split('?')[0] == '/api/submit':
                return submission.respond(self, env, 'GET')
            if self.path.split('?')[0] == '/api/feedback':
                body = b'{"ok":true,"service":"shelf-feedback","configured":true}'
                self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                return
            if self.path.split('?')[0] == '/__feedback':
                body = json.dumps(feedback, ensure_ascii=False).encode('utf-8')
                self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                return
            if self.path.split('?')[0] == '/site.json':
                site_path = root / 'site.json'
                if not site_path.is_file():
                    site_path = root.parent / 'site.json'
                data = json.loads(site_path.read_text(encoding='utf-8'))
                data['directory'] = base + '/dir/'
                body = json.dumps(data, ensure_ascii=False).encode('utf-8')
                self.send_response(200); self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                return
            if self.path.split('?')[0] in ('/manifest.js', '/manifest.json'):
                data = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
                data['directory'] = base + '/dir/'
                body = json.dumps(data, ensure_ascii=False).encode('utf-8')
                if self.path.split('?')[0] == '/manifest.js':
                    body = b'window.ARCHIVE_MANIFEST = ' + body + b';\n'
                    content_type = 'application/javascript; charset=utf-8'
                else:
                    content_type = 'application/json; charset=utf-8'
                self.send_response(200); self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
                return
            if self.path.split('?')[0] == '/dir/directory.json':
                data = json.loads((root / 'dir' / 'directory.json').read_text(encoding='utf-8'))
                data.update(feed_api=feed_api, submit_api=submit_api, feedback_api=base + '/api/feedback', hot_api='', listen_api='')
                body = json.dumps(data, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            super().do_GET()

        def log_message(self, *args):
            pass

    with ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=str(root))) as server:
        print('Subscription preview: ' + base + '/?lang=zh', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
