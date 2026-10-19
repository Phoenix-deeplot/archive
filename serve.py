#!/usr/bin/env python3
"""
serve.py — run the archive locally with live folder scanning.

    python3 serve.py              # http://127.0.0.1:8000
    python3 serve.py --port 9000

* Drop an .html / .md / .txt / .pdf file into library/<category>/ and refresh — it appears.
* A web tool made of several files goes in as a folder: library/tools/<name>/index.html (+ css, js,
  images...). The folder is ONE card. The "Add" button can upload such a folder too.
* The "+" button in the page uploads files straight into library/<category>/.
* Featured stars, pinned items (kept at the top of the shelf), hidden items and title/summary edits
  are saved to library/_meta.json.
* A card can be moved to another category (its file or folder moves with it), or deleted for good (the
  page asks first). This is the owner's own computer: the deployed site has no such request, so nobody
  else can delete anything on the server. To remove a book from the website: delete it here, deploy again.
* manifest.json / manifest.js are kept up to date automatically (on start, on every page load, after
  every change in library/), so the same folder can be deployed as a static site at any time.

Only the Python standard library is used. The server listens on 127.0.0.1 by
default; it writes files, so do not expose it to a public network.
"""
import argparse
import hashlib
import http.server
import json
import os
import re
import shutil
import socketserver
import sys
import threading
import time
import urllib.parse
import webbrowser

from build_index import (LIBRARY, ROOT, SKIP_DIRS, load_meta, norm_category, project_entry, safe_dirname,
                         safe_filename, safe_relpath, save_meta, scan_library, site_directory, write_manifest)

MAX_UPLOAD = 80 * 1024 * 1024
RANGE_RE = re.compile(r'bytes=(\d*)-(\d*)$')

_SHA = {}                          # path -> (mtime_ns, size, sha1 of the content): a file is read again only when it changed


def file_sha1(path):
    try:
        st = os.stat(path)
    except OSError:
        return ''
    hit = _SHA.get(path)
    if hit and hit[:2] == (st.st_mtime_ns, st.st_size):
        return hit[2]
    h = hashlib.sha1()
    try:
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
    except OSError:
        return ''
    _SHA[path] = (st.st_mtime_ns, st.st_size, h.hexdigest())
    return h.hexdigest()


def item_sha1(it):
    return '' if it.get('project') else file_sha1(os.path.join(ROOT, *str(it.get('path') or '').split('/')))


def mark_duplicates(items):
    """Give every item whose file has exactly the content of an earlier one a `same` (the id of that earlier one). For the page only, never written
    to the manifest. A project folder (one card made of many files) is not compared."""
    first = {}
    for it in sorted(items, key=lambda x: (x.get('added', 0), x['id'])):
        sha = item_sha1(it)
        if not sha:
            continue
        if sha in first:
            it['same'] = first[sha]
        else:
            first[sha] = it['id']
    return items


class _Limited:
    """Read-only view of the first n bytes of a file object (for 206 responses)."""

    def __init__(self, f, n):
        self.f, self.n = f, n

    def read(self, size=-1):
        if self.n <= 0:
            return b''
        if size is None or size < 0 or size > self.n:
            size = self.n
        data = self.f.read(size)
        self.n -= len(data)
        return data

    def close(self):
        self.f.close()


class Handler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'   # keep-alive: the PDF viewer opens several requests per file
    timeout = 60                    # drop idle keep-alive connections
    pending_projects = set()        # folders created by /api/project/begin and not finished yet

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # API answers must never be cached; files are revalidated (a cheap 304) so edits show on refresh
        api = urllib.parse.urlparse(getattr(self, 'path', '')).path.startswith('/api/')
        self.send_header('Cache-Control', 'no-store' if api else 'no-cache')
        if not api:
            self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '/api/' in getattr(self, 'path', ''):
            super().log_message(fmt, *args)

    # ---------- helpers ----------
    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        if code >= 400:
            self.close_connection = True    # the request body may be unread; do not reuse the connection
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _same_origin(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        return urllib.parse.urlparse(origin).netloc == self.headers.get('Host')

    def _host_ok(self):
        """Only answer requests addressed to this machine (localhost / 127.0.0.1 / the --host given).

        Without this a web page on the internet could point its own domain at 127.0.0.1 ("DNS
        rebinding") and then talk to this server, which can write files.
        """
        allowed = getattr(self.server, 'allowed_hosts', None)
        if allowed is None:
            return True
        host = (self.headers.get('Host') or '').strip().lower()
        name = host[:host.find(']') + 1] if host.startswith('[') else host.split(':')[0]
        if name in allowed:
            return True
        self._json({'error': 'unknown host name'}, 403)
        return False

    def _category_dir(self, category):
        """Folder name under library/ for a category, reusing an existing one such as 书籍/."""
        cat = norm_category(category or 'notes')
        cat_dir = re.sub(r'[\\/:*?"<>|.\x00-\x1f]', '', cat).strip() or 'notes'
        for d in sorted(os.listdir(LIBRARY)):
            if os.path.isdir(os.path.join(LIBRARY, d)) and norm_category(d) == cat:
                return d
        return cat_dir

    def _inside_library(self, path):
        return os.path.realpath(path).startswith(os.path.realpath(LIBRARY) + os.sep)

    # ---------- static files, with Range support ----------
    def send_head(self):
        m = RANGE_RE.match((self.headers.get('Range') or '').strip())
        if not m or not (m.group(1) or m.group(2)):
            return super().send_head()
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()      # 404 / directory handling
        try:
            f = open(path, 'rb')
        except OSError:
            return super().send_head()
        size = os.fstat(f.fileno()).st_size
        if m.group(1):
            start = int(m.group(1))
            end = min(int(m.group(2)), size - 1) if m.group(2) else size - 1
        else:                               # "bytes=-500": the last 500 bytes
            start, end = max(0, size - int(m.group(2))), size - 1
        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        return _Limited(f, end - start + 1)

    # ---------- routes ----------
    def do_HEAD(self):
        if self._host_ok():
            super().do_HEAD()

    def do_GET(self):
        if not self._host_ok():
            return
        if urllib.parse.urlparse(self.path).path == '/api/list':
            return self._json({'mode': 'server', 'items': mark_duplicates(refresh()), 'directory': site_directory()})
        return super().do_GET()

    def do_POST(self):
        if not self._host_ok():
            return
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path
        if not self._same_origin():
            return self._json({'error': 'cross-origin request refused'}, 403)
        length = int(self.headers.get('Content-Length') or 0)
        if length > MAX_UPLOAD:
            return self._json({'error': 'file too large (max 80 MB)'}, 413)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}

        if route == '/api/upload':
            # raw file bytes in the body; metadata in the query string
            data = self.rfile.read(length) if length else b''
            if not data:
                return self._json({'error': 'empty file'}, 400)
            name = safe_filename(q.get('filename'))
            if not name:
                return self._json({'error': 'unsupported file type'}, 400)
            folder = os.path.realpath(os.path.join(LIBRARY, self._category_dir(q.get('category'))))
            if not self._inside_library(folder):
                return self._json({'error': 'bad category'}, 400)
            if q.get('force') not in ('1', 'true'):               # the same content is in the library already: say so, unless the page insists
                sha = hashlib.sha1(data).hexdigest()
                for it in refresh():
                    if item_sha1(it) == sha:
                        return self._json({'error': 'duplicate', 'id': it['id'], 'title': it.get('title', '')}, 409)
            os.makedirs(folder, exist_ok=True)
            stem, ext = os.path.splitext(name)
            target, n = os.path.join(folder, name), 2
            while os.path.exists(target):
                target = os.path.join(folder, f'{stem}-{n}{ext}')
                n += 1
            with open(target, 'wb') as f:
                f.write(data)
            rel = os.path.relpath(target, LIBRARY).replace(os.sep, '/')
            self._store_meta(rel, q)
            refresh()
            return self._json({'ok': True, 'id': rel})

        # A project folder is uploaded in three steps so that nothing half-finished ever shows up:
        #   begin  -> reserves library/<category>/<name>/ (a free name is chosen)
        #   file   -> one request per file, written below that folder only
        #   finish -> checks index.html is there, stores title/summary, rescans
        # (abort removes the folder again if something went wrong.)
        if route == '/api/project/begin':
            name = safe_dirname(q.get('name'))
            parent = os.path.realpath(os.path.join(LIBRARY, self._category_dir(q.get('category'))))
            if not self._inside_library(parent):
                return self._json({'error': 'bad category'}, 400)
            os.makedirs(parent, exist_ok=True)
            target, n = os.path.join(parent, name), 2
            while os.path.exists(target):
                target = os.path.join(parent, f'{name}-{n}')
                n += 1
            os.makedirs(target)
            rel = os.path.relpath(target, LIBRARY).replace(os.sep, '/')
            self.pending_projects.add(rel)
            return self._json({'ok': True, 'dir': rel})

        if route in ('/api/project/file', '/api/project/finish', '/api/project/abort'):
            rel = q.get('dir') or ''
            if rel not in self.pending_projects:
                return self._json({'error': 'unknown project upload'}, 400)
            folder = os.path.realpath(os.path.join(LIBRARY, rel))
            if not self._inside_library(folder):
                return self._json({'error': 'bad folder'}, 400)

            if route == '/api/project/file':
                parts = safe_relpath(q.get('path'))
                if not parts:
                    return self._json({'error': 'bad file path'}, 400)
                target = os.path.realpath(os.path.join(folder, *parts))
                if not target.startswith(folder + os.sep):
                    return self._json({'error': 'bad file path'}, 400)
                data = self.rfile.read(length) if length else b''   # empty files are fine here
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'wb') as f:
                    f.write(data)
                return self._json({'ok': True})

            if route == '/api/project/abort':
                shutil.rmtree(folder, ignore_errors=True)
                self.pending_projects.discard(rel)
                return self._json({'ok': True})

            entry = project_entry(folder)
            if not entry:
                return self._json({'error': 'the folder has no index.html'}, 400)
            self.pending_projects.discard(rel)
            item_id = rel + '/' + entry
            self._store_meta(item_id, q)
            refresh()
            return self._json({'ok': True, 'id': item_id})

        # Move a card to another category (the file, or a whole tool folder, really moves) or delete it for good.
        # Only cards the scan knows about can be touched; a delete has to say it was confirmed (the page asks the owner first).
        if route in ('/api/move', '/api/delete'):
            try:
                body = json.loads((self.rfile.read(length) if length else b'{}').decode('utf-8') or '{}')
            except Exception:
                return self._json({'error': 'bad request'}, 400)
            item_id = str(body.get('id') or '')
            item = next((i for i in refresh() if i['id'] == item_id), None)
            if not item:
                return self._json({'error': 'no such item'}, 404)
            path = os.path.join(LIBRARY, *item_id.split('/'))
            parent = os.path.dirname(path)
            is_project = bool(item.get('project'))
            unit = parent if is_project else path          # a tool is a whole folder
            if not self._inside_library(unit) or os.path.realpath(unit) == os.path.realpath(LIBRARY):
                return self._json({'error': 'bad item'}, 400)
            meta = load_meta()
            try:
                if route == '/api/delete':
                    if body.get('confirm') is not True:
                        return self._json({'error': 'a delete has to be confirmed'}, 400)
                    shutil.rmtree(unit) if is_project else os.remove(unit)
                    meta.pop(item_id, None)
                    new_id = None
                else:
                    category = norm_category(body.get('category'))
                    if category == item['category']:
                        return self._json({'error': 'already in this category'}, 400)
                    folder = os.path.join(LIBRARY, self._category_dir(category))
                    os.makedirs(folder, exist_ok=True)
                    name = os.path.basename(unit)
                    stem, ext = (name, '') if is_project else os.path.splitext(name)
                    target, n = os.path.join(folder, name), 2
                    while os.path.exists(target):
                        target = os.path.join(folder, f'{stem}-{n}{ext}')
                        n += 1
                    shutil.move(unit, target)
                    new_id = os.path.relpath(target, LIBRARY).replace(os.sep, '/')
                    if is_project:
                        new_id += '/' + os.path.basename(path)
                    if item_id in meta:                    # title / summary / star / hidden follow the card
                        meta[new_id] = meta.pop(item_id)
                save_meta(meta)
                _prune_empty(os.path.dirname(unit))
            except OSError as e:                           # e.g. the file is open in another program
                return self._json({'error': str(e)}, 500)
            refresh()
            return self._json({'ok': True, 'id': new_id})

        if route == '/api/meta':
            try:
                body = json.loads((self.rfile.read(length) if length else b'{}').decode('utf-8') or '{}')
            except Exception:
                return self._json({'error': 'bad request'}, 400)
            item_id = str(body.get('id') or '')
            if not item_id or '..' in item_id:
                return self._json({'error': 'bad id'}, 400)
            meta = load_meta()
            entry = meta.get(item_id, {})
            for k in ('featured', 'hidden', 'title', 'summary', 'nodirectory', 'pinned'):
                if k in body:
                    if k == 'pinned' and not isinstance(body[k], (bool, int, float)):      # the time it was pinned, or false
                        continue
                    entry[k] = body[k]
            meta[item_id] = entry
            save_meta(meta)
            refresh()
            return self._json({'ok': True})

        return self._json({'error': 'not found'}, 404)

    def _store_meta(self, item_id, q):
        """Save the title / summary / featured flag chosen in the Add dialog."""
        entry = {k: q[k] for k in ('title', 'summary') if q.get(k)}
        if q.get('featured') in ('1', 'true'):
            entry['featured'] = True
        if entry:
            meta = load_meta()
            meta[item_id] = {**meta.get(item_id, {}), **entry}
            save_meta(meta)


def _prune_empty(path):
    """Remove folders left empty by a move / delete, but never a category folder itself."""
    lib = os.path.realpath(LIBRARY)
    path = os.path.realpath(path)
    while path.startswith(lib + os.sep) and os.path.dirname(path) != lib:
        try:
            os.rmdir(path)
        except OSError:
            break
        path = os.path.dirname(path)


_scan_lock = threading.Lock()


def refresh():
    """Scan library/, keep manifest.json / manifest.js up to date, and return the items."""
    with _scan_lock:
        items = scan_library(skip=Handler.pending_projects)
        write_manifest(items)
        return items


def _library_signature():
    sig = []
    for d, dns, fns in os.walk(LIBRARY):
        dns[:] = [x for x in dns if not x.startswith('.') and x not in SKIP_DIRS]
        for n in fns:
            try:
                st = os.stat(os.path.join(d, n))
            except OSError:
                continue
            sig.append((os.path.join(d, n), st.st_mtime_ns, st.st_size))
    return tuple(sorted(sig))


def watch_library(interval=2.0):
    """Rescan whenever something in library/ changes, so the manifest is right even if nobody has
    the page open (files copied in by hand, deleted, renamed ...)."""
    last = _library_signature()
    while True:
        time.sleep(interval)
        try:
            now = _library_signature()
            if now != last:
                last = now
                refresh()
        except Exception as e:                  # never let the watcher die
            print('watcher:', e)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    allowed_hosts = None                        # set in main(); None = accept any Host header

    def handle_error(self, request, client_address):
        # a browser cancelling a download (the PDF viewer does this routinely) is not an error
        if isinstance(sys.exc_info()[1], (ConnectionError, TimeoutError)):
            return
        super().handle_error(request, client_address)


def main():
    ap = argparse.ArgumentParser(description='Run the HTML archive locally.')
    ap.add_argument('--port', type=int, default=8000)
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args()
    os.makedirs(LIBRARY, exist_ok=True)
    refresh()
    threading.Thread(target=watch_library, daemon=True).start()
    url = f'http://{args.host}:{args.port}/'
    with Server((args.host, args.port), Handler) as httpd:
        if args.host in ('0.0.0.0', '::'):
            print('WARNING: listening on the whole network; anyone who can reach this port can add files.')
        else:
            httpd.allowed_hosts = {'localhost', '127.0.0.1', '[::1]', args.host.lower()}
        print(f'Archive running at {url}  (Ctrl+C to stop)')
        print(f'Library folder: {LIBRARY}')
        if not args.no_browser:
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nStopped.')


if __name__ == '__main__':
    main()
