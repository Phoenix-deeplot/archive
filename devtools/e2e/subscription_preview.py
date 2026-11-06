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
    args = ap.parse_args()
    sys.path.insert(0, args.api_root)
    import feedapi
    root = Path(__file__).resolve().parent / '.demo' / 'dist'
    if not (root / 'index.html').is_file():
        ap.error('Build the isolated demo first with make_demo.py')
    base = 'http://127.0.0.1:' + str(args.port)
    env = {'ALLOW_LOCAL_ORIGIN': '1', 'IP_SALT': 'subscription-preview'}
    if os.environ.get('RSSHUB_BASE'):
        env['RSSHUB_BASE'] = os.environ['RSSHUB_BASE']
    lock = threading.Lock()  # aggregate's reading budget is process-wide

    class Handler(SimpleHTTPRequestHandler):
        def do_POST(self):
            if self.path == '/api/feed':
                with lock:
                    feedapi.respond(self, env, 'POST')
            else:
                self.send_error(404)

        def do_OPTIONS(self):
            feedapi.respond(self, env, 'OPTIONS')

        def do_GET(self):
            if self.path.split('?')[0] == '/dir/directory.json':
                data = json.loads((root / 'dir' / 'directory.json').read_text(encoding='utf-8'))
                data.update(feed_api=base + '/api/feed', submit_api='', hot_api='', listen_api='')
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
