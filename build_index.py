#!/usr/bin/env python3
"""
build_index.py — scan library/ and write manifest.json + manifest.js

Usage:
    python3 build_index.py               # scan and write the manifest
    python3 build_index.py --keep-dates  # keep the old "added" dates of unchanged items (used on Vercel)

Every .html / .md / .txt / .pdf file under library/ becomes a card. The first-level folder decides the
category (books / tools / notes / featured, or 书籍 / 工具 / 个人笔记 / 精选);
any other folder name becomes a new category automatically.

A web tool made of several files is a *project folder*: any folder below a category that
contains an index.html (e.g. library/tools/supplychain/index.html) becomes ONE card, and the
css / js / images next to it are treated as its assets, not as separate cards.

Title and summary are read from the page itself; optional meta tags override them:

    <meta name="description" content="...">
    <meta name="keywords" content="supply chain, 采购">
    <meta name="archive:category" content="books">
    <meta name="archive:featured" content="true">
    <meta name="archive:cover" content="cover.jpg">
    <meta name="archive:date" content="2026-10-13">

Markdown files may use front matter (title, description, tags, date, category,
featured, cover). PDF titles come from the document metadata, else the file name.

Edits made in the web page (featured star, hidden, title, summary) are stored in
library/_meta.json and merged here.
"""
import argparse
import json
import os
import re
import sys
import time
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
LIBRARY = os.path.join(ROOT, 'library')
META_FILE = os.path.join(LIBRARY, '_meta.json')
MANIFEST_JSON = os.path.join(ROOT, 'manifest.json')

TYPES = {'.html': 'html', '.htm': 'html', '.md': 'md', '.markdown': 'md', '.txt': 'txt', '.pdf': 'pdf'}
ENTRY_NAMES = ('index.html', 'index.htm')   # a folder holding one of these is a project
SKIP_DIRS = {'node_modules', '__pycache__', '__MACOSX'}

CATEGORY_ALIASES = {
    'books': 'books', 'book': 'books', '书籍': 'books', '书': 'books',
    'tools': 'tools', 'tool': 'tools', '工具': 'tools',
    'notes': 'notes', 'note': 'notes', '个人笔记': 'notes', '笔记': 'notes',
    'featured': 'featured', '精选': 'featured',
}


def norm_category(name):
    if not name:
        return 'notes'
    key = name.strip()
    return CATEGORY_ALIASES.get(key.lower(), CATEGORY_ALIASES.get(key, key))


class _PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = {}
        self.title = ''
        self.h1 = ''
        self.lead = ''
        self.first_p = ''
        self.text = []
        self._stack = []
        self._skip = 0
        self._in_title = False
        self._h1_buf = None
        self._p_buf = None
        self._p_is_lead = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'template'):
            self._skip += 1
        elif tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            name = (a.get('name') or a.get('property') or '').strip().lower()
            if name and a.get('content') is not None and name not in self.meta:
                self.meta[name] = a.get('content').strip()
        elif tag == 'h1' and not self.h1:
            self._h1_buf = []
        elif tag == 'p':
            self._p_buf = []
            self._p_is_lead = 'lead' in (a.get('class') or '').split()

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'template'):
            self._skip = max(0, self._skip - 1)
        elif tag == 'title':
            self._in_title = False
        elif tag == 'h1' and self._h1_buf is not None:
            self.h1 = _clean(''.join(self._h1_buf))
            self._h1_buf = None
        elif tag == 'p' and self._p_buf is not None:
            t = _clean(''.join(self._p_buf))
            if self._p_is_lead and not self.lead and len(t) >= 12:
                self.lead = t
            if not self.first_p and len(t) >= 30:
                self.first_p = t
            self._p_buf = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
            return
        if self._skip:
            return
        self.text.append(data)
        if self._h1_buf is not None:
            self._h1_buf.append(data)
        if self._p_buf is not None:
            self._p_buf.append(data)


def _clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


def _truncate(s, n=220):
    s = _clean(s)
    return s if len(s) <= n else s[:n].rstrip() + '…'


_cache = {}


def _text_stats(text):
    cjk = len(re.findall(r'[\u4e00-\u9fff]', text))
    words = len(re.findall(r'[A-Za-z]+', text))
    lang = 'zh' if cjk >= words else 'en'
    if cjk > 200 and words > 600:
        lang = 'mixed'
    return lang, max(1, round(cjk / 400 + words / 220))


def _front_matter(text):
    """Very small YAML front-matter reader: key: value, key: [a, b]."""
    meta = {}
    m = re.match(r'^\ufeff?---\s*\n(.*?)\n---\s*(\n|$)', text, re.S)
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        if ':' in line and not line.startswith((' ', '\t', '-')):
            k, v = line.split(':', 1)
            v = v.strip().strip('"\'')
            if v.startswith('[') and v.endswith(']'):
                v = [x.strip().strip('"\'') for x in v[1:-1].split(',') if x.strip()]
            meta[k.strip().lower()] = v
    return meta, text[m.end():]


def _strip_md(s):
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', s)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'[*_`~]+', '', s)
    s = re.sub(r'<[^>]+>', '', s)
    return _clean(s)


def _extract_md(path, st, is_txt=False):
    with open(path, 'r', encoding='utf-8-sig', errors='replace') as f:   # -sig: Notepad adds a BOM
        raw = f.read()
    fm, body = ({}, raw) if is_txt else _front_matter(raw)
    lines = body.splitlines()
    title, summary, in_code, para = '', '', False, []
    for line in lines:
        l = line.strip()
        if l.startswith('```') or l.startswith('~~~'):
            in_code = not in_code
            continue
        if in_code:
            continue
        if not title:
            if is_txt and l:
                title = l[:120]
                continue
            h = re.match(r'^#\s+(.+)', l)
            if h:
                title = _strip_md(h.group(1))
                continue
        if not summary:
            if l and not re.match(r'^(#{1,6}\s|[-*+]\s|\d+\.\s|>|\||!\[|<)', l):
                para.append(l)
            elif para:
                summary = _strip_md(' '.join(para))
                para = []
            if para and len(' '.join(para)) > 260:
                summary = _strip_md(' '.join(para))
    if not summary and para:
        summary = _strip_md(' '.join(para))
    lang, minutes = _text_stats(_strip_md(body))
    kw = fm.get('tags') or fm.get('keywords') or []
    if isinstance(kw, str):
        kw = [k.strip() for k in re.split(r'[,，、;；]', kw) if k.strip()]
    out = {
        'title': _truncate(fm.get('title') or title or os.path.splitext(os.path.basename(path))[0], 120),
        'summary': _truncate(fm.get('description') or fm.get('summary') or summary, 220),
        'keywords': kw, 'lang': lang, 'minutes': minutes,
        'date': str(fm.get('date') or '')[:10],
        'cover': fm.get('cover') or '', 'featured': str(fm.get('featured', '')).lower() in ('true', '1', 'yes'),
        'metaCategory': fm.get('category') or '',
    }
    if fm.get('slug'):                               # the address part to use on the published site (see seo.py)
        out['slug'] = str(fm['slug']).strip()
    if str(fm.get('directory', '')).strip().lower() in ('false', 'no', '0', 'off'):      # keep it out of every public directory (see seo.py `_shelf.listed`)
        out['nodirectory'] = True
    return out


def _pdf_string(raw):
    raw = raw.strip()
    if raw.startswith('<') and raw.endswith('>'):
        try:
            b = bytes.fromhex(re.sub(r'\s', '', raw[1:-1]))
            return b.decode('utf-16') if b[:2] in (b'\xfe\xff', b'\xff\xfe') else b.decode('latin-1')
        except Exception:
            return ''
    if raw.startswith('(') and raw.endswith(')'):
        s = raw[1:-1]
        b = s.encode('latin-1', 'ignore')
        if b[:2] == b'\xfe\xff':
            try:
                return b.decode('utf-16')
            except Exception:
                return ''
        return re.sub(r'\\([()\\])', r'\1', s)
    return ''


def _extract_pdf(path, st):
    title, pages = '', None
    with open(path, 'rb') as f:
        data = f.read(min(st.st_size, 64 * 1024 * 1024))
    txt = data.decode('latin-1')
    m = re.search(r'<dc:title>.*?<rdf:li[^>]*>(.*?)</rdf:li>', txt, re.S)
    if m:
        try:
            title = m.group(1).encode('latin-1').decode('utf-8')
        except Exception:
            title = m.group(1)
    if not title:
        m = re.search(r'/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)', txt)
        if m:
            title = _pdf_string(m.group(1))
    # the gap between /Type /Pages and /Count is a few keys at most; an unbounded
    # [^>]*? would scan megabytes of binary per match on large PDFs
    counts = [int(x) for x in re.findall(r'/Type\s*/Pages\b[^>]{0,400}?/Count\s+(\d+)', txt)]
    counts += [int(x) for x in re.findall(r'/Count\s+(\d+)[^>]{0,400}?/Type\s*/Pages\b', txt)]
    if counts:
        pages = max(counts)
    else:
        n = len(re.findall(r'/Type\s*/Page\b', txt))
        pages = n or None
    title = _clean(title)
    return {
        'title': _truncate(title or os.path.splitext(os.path.basename(path))[0], 120),
        'summary': '', 'keywords': [], 'lang': 'zh' if re.search(r'[\u4e00-\u9fff]', title) else 'en',
        'minutes': None, 'pages': pages, 'date': '', 'cover': '', 'featured': False, 'metaCategory': '',
    }


def extract(path, name=None, mtime=None, size=None):
    """Read one file and return its card metadata.

    For a project folder the card stands for the whole folder: `mtime` / `size` are then the
    newest modification time and total size of its files, and `name` (the folder name) is
    the title used when index.html has none.
    """
    st = os.stat(path)
    key = (path, st.st_mtime, st.st_size, name, mtime, size)
    if key in _cache:
        return dict(_cache[key])
    ftype = TYPES.get(os.path.splitext(path)[1].lower(), 'html')
    if ftype == 'html':
        out = _extract_html(path, st, name)
    elif ftype == 'pdf':
        out = _extract_pdf(path, st)
    else:
        out = _extract_md(path, st, is_txt=(ftype == 'txt'))
    stamp = mtime if mtime is not None else st.st_mtime
    if not out.get('date'):
        out['date'] = time.strftime('%Y-%m-%d', time.localtime(stamp))
    out.update({'type': ftype, 'size': size if size is not None else st.st_size, 'added': int(stamp)})
    _cache[key] = out
    return dict(out)


def _extract_html(path, st, name=None):
    with open(path, 'r', encoding='utf-8-sig', errors='replace') as f:
        html = f.read()
    p = _PageParser()
    try:
        p.feed(html)
    except Exception:
        pass
    m = p.meta
    lang, minutes = _text_stats(_clean(' '.join(p.text)))
    title = m.get('archive:title') or _clean(p.title) or p.h1 or name or os.path.splitext(os.path.basename(path))[0]
    summary = m.get('description') or m.get('og:description') or p.lead or p.first_p or ''
    keywords = [k.strip() for k in re.split(r'[,，、;；]', m.get('keywords', '')) if k.strip()]
    date = m.get('archive:date') or m.get('article:published_time', '')[:10]
    out = {
        'title': _truncate(title, 120),
        'summary': _truncate(summary, 220),
        'keywords': keywords,
        'lang': lang,
        'minutes': minutes,
        'date': date,
        'cover': m.get('archive:cover') or m.get('og:image') or '',
        'featured': (m.get('archive:featured', '').lower() in ('true', '1', 'yes')),
        'metaCategory': m.get('archive:category', ''),
    }
    if 'noindex' in m.get('robots', '').lower():     # the page itself asks search engines to skip it
        out['noindex'] = True
    if m.get('archive:slug'):                        # the address part to use on the published site (see seo.py)
        out['slug'] = m['archive:slug'].strip()
    if m.get('archive:directory', '').strip().lower() in ('no', 'false', '0', 'off'):   # <meta name="archive:directory" content="no">: out of every public directory
        out['nodirectory'] = True
    return out


def load_meta():
    try:
        with open(META_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_meta(data):
    os.makedirs(LIBRARY, exist_ok=True)
    tmp = META_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, META_FILE)


def project_entry(dirpath):
    """Name of the index.html inside a folder, or None when it is not a project."""
    try:
        names = os.listdir(dirpath)
    except OSError:
        return None
    for want in ENTRY_NAMES:
        for n in names:
            if n.lower() == want and os.path.isfile(os.path.join(dirpath, n)):
                return n
    return None


def project_stats(dirpath):
    """(total bytes, file count, newest mtime) over every file of a project folder."""
    total = count = 0
    newest = 0.0
    for d, dns, fns in os.walk(dirpath):
        dns[:] = [x for x in dns if not x.startswith('.') and x not in SKIP_DIRS]
        for n in fns:
            if n.startswith('.'):
                continue
            try:
                st = os.stat(os.path.join(d, n))
            except OSError:
                continue
            total += st.st_size
            count += 1
            newest = max(newest, st.st_mtime)
    return total, count, newest


def _apply_overrides(item, overrides):
    o = overrides.get(item['id']) or {}
    for k in ('title', 'summary', 'featured', 'hidden', 'keywords', 'cover', 'noindex', 'slug', 'nodirectory'):
        if k in o and o[k] not in (None, ''):
            item[k] = o[k]
    if item.get('nodirectory') is False:             # switched back on in the page: the key only exists while it is true
        del item['nodirectory']


def load_previous():
    """Items of the manifest written last time, by id."""
    try:
        with open(MANIFEST_JSON, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {i['id']: i for i in data.get('items', []) if isinstance(i, dict) and 'id' in i}
    except (OSError, ValueError):
        return {}


def scan_library(keep_dates=False, skip=()):
    """Return a list of card dicts for everything under library/.

    keep_dates: reuse "added" / "date" of the previous manifest for items that did not change
        (same size). On a fresh checkout or deployment every file has the same modification
        time, so without this all dates would collapse to the deploy time.
    skip: relative folder paths to ignore (uploads still in progress).
    """
    items = []
    if not os.path.isdir(LIBRARY):
        return items
    overrides = load_meta()
    previous = load_previous() if keep_dates else {}
    skip = set(skip)
    for dirpath, dirnames, filenames in os.walk(LIBRARY):
        rel_dir = os.path.relpath(dirpath, LIBRARY).replace(os.sep, '/')
        if rel_dir in skip:
            dirnames[:] = []
            continue
        dirnames[:] = sorted(d for d in dirnames if not d.startswith(('.', '_')) and d not in SKIP_DIRS)
        depth = 0 if rel_dir == '.' else rel_dir.count('/') + 1
        if depth >= 2:                      # below a category folder: library/<category>/<folder>/...
            entry = project_entry(dirpath)
            if entry:
                total, count, newest = project_stats(dirpath)
                info = extract(os.path.join(dirpath, entry), name=os.path.basename(dirpath), mtime=newest, size=total)
                info.pop('metaCategory', None)
                rel = rel_dir + '/' + entry
                item = {'id': rel, 'path': 'library/' + rel, 'category': norm_category(rel_dir.split('/')[0]),
                        **info, 'project': True, 'files': count}
                _apply_overrides(item, overrides)
                items.append(item)
                dirnames[:] = []            # its css / js / images are assets, not cards
                continue
        for name in sorted(filenames):
            if name.startswith(('.', '_')) or os.path.splitext(name)[1].lower() not in TYPES:
                continue
            full = os.path.join(dirpath, name)
            rel = name if rel_dir == '.' else rel_dir + '/' + name
            info = extract(full)
            top = rel.split('/')[0] if '/' in rel else ''
            category = norm_category(top) if top else norm_category(info['metaCategory'] or 'notes')
            info.pop('metaCategory', None)
            item = {'id': rel, 'path': 'library/' + rel, 'category': category, **info}
            _apply_overrides(item, overrides)
            items.append(item)
    if previous:
        for item in items:
            old = previous.get(item['id'])
            if old and old.get('size') == item.get('size') and old.get('files') == item.get('files') \
                    and old.get('added') and old.get('date'):
                item['added'], item['date'] = old['added'], old['date']
    items.sort(key=lambda x: x['added'], reverse=True)
    return items


_WARNED = []


def site_directory():
    """site.json "directory": the address of the public directory (the docs/ of a shelf-directory repo). '' when not set.

    https only; plain http only for this computer (trying the directory locally). The page reads it from the manifest.
    """
    try:
        with open(os.path.join(ROOT, 'site.json'), 'r', encoding='utf-8-sig') as f:
            url = str((json.load(f) or {}).get('directory') or '').strip()
    except (OSError, ValueError, AttributeError):
        return ''
    if not re.match(r'^(https://|http://(127\.0\.0\.1|localhost)(:\d+)?/)', url):
        return ''
    if not url.startswith('https://') and not _WARNED:
        _WARNED.append(1)
        print('NOTE: site.json "directory" is an address of this computer (%s): the public space works here only. Put the https:// address there before you deploy.' % url, file=sys.stderr)
    return url.rstrip('/') + '/'


def write_manifest(items, root=None):
    """Write manifest.json and manifest.js (into `root`, the project folder by default), but only when the library changed.

    Rewriting an identical file on every page load would keep touching it (editors ask to reload,
    deploys see a change), and `generated` then means "when the library last changed".
    """
    root = root or ROOT
    json_path = os.path.join(root, 'manifest.json')
    js_path = os.path.join(root, 'manifest.js')
    directory = site_directory()
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            old = json.load(f)
            if old.get('items') == items and old.get('directory', '') == directory and os.path.exists(js_path):
                return
    except (OSError, ValueError):
        pass
    data = {'generated': time.strftime('%Y-%m-%d %H:%M')}
    if directory:
        data['directory'] = directory
    data['items'] = items
    text = json.dumps(data, ensure_ascii=False, indent=1)
    with open(json_path, 'w', encoding='utf-8') as f:
        f.write(text)
    # manifest.js lets index.html work when opened directly from disk (file://)
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write('window.ARCHIVE_MANIFEST = ' + text + ';\n')


def safe_filename(name):
    base = os.path.basename(name or '').strip() or 'untitled.html'
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '-', base)
    stem, ext = os.path.splitext(base)
    if ext.lower() not in TYPES:
        return None
    return stem[:140] + ext.lower()


def safe_dirname(name):
    """A folder name that is safe to create under library/<category>/."""
    base = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '-', str(name or '')).strip().strip('.').strip()
    return base[:100] or 'project'


def safe_relpath(rel):
    """Split a path from the browser into safe segments, or None if it is not acceptable.

    Rejects '..', hidden names (.git, .env, ...) and node_modules so an upload can never
    leave its project folder or bring junk along.
    """
    parts = []
    for seg in str(rel or '').replace('\\', '/').split('/'):
        if seg in ('', '.'):
            continue
        if seg == '..' or seg.startswith('.') or seg in SKIP_DIRS:
            return None
        seg = re.sub(r'[:*?"<>|\x00-\x1f]', '-', seg).strip().rstrip('.')
        if not seg:
            return None
        parts.append(seg[:140])
    return parts if parts and len(parts) <= 12 else None


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Scan library/ and write manifest.json / manifest.js.')
    ap.add_argument('--keep-dates', action='store_true',
                    help='keep the old added/date of unchanged items (use when building on Vercel)')
    ap.add_argument('--seo', action='store_true',
                    help='also build the site to deploy into dist/: SEO tags on every page, article pages, sitemap.xml, robots.txt, '
                         'no hidden items (see seo.py). Your own files are never changed.')
    ap.add_argument('--site-url', default='',
                    help='public address of the site, e.g. https://example.com (else $SITE_URL, else on Vercel the project domain)')
    ap.add_argument('--out', default='dist', help='folder for --seo (default: dist)')
    args = ap.parse_args()
    found = scan_library(keep_dates=args.keep_dates)
    write_manifest(found)
    cats = {}
    for it in found:
        cats[it['category']] = cats.get(it['category'], 0) + 1
    projects = sum(1 for it in found if it.get('project'))
    print(f'manifest.json / manifest.js written: {len(found)} items ({projects} project folders)', cats)
    if args.seo:
        import seo
        base = seo.site_url(args.site_url)
        r = seo.publish(found, base, ROOT, LIBRARY, _front_matter, write_manifest, args.out)
        print(f'SEO: site for deployment written to {r["out"]}/ without {r["skipped"]["hidden"]} hidden item(s); '
              f'tags added to {r["patched"]} HTML page(s); {r["pages"]} Markdown/TXT article page(s) with full text')
        if base:
            print(f'SEO: sitemap.xml has {r["urls"]} URLs for {base}; robots.txt written; {r["skipped"]["noindex"]} noindex item(s) kept out of the sitemap')
            if r['sitemap_problems']:
                print(f'SEO: sitemap check found {len(r["sitemap_problems"])} problem(s) (Search Console would object):')
                for p in r['sitemap_problems']:
                    print('SEO:   - ' + p)
            else:
                print(f'SEO: sitemap check passed: all {r["urls"]} addresses are of this site, percent-encoded, unique, and exist in {r["out"]}/')
            if r['feeds']:
                print(f'SEO: subscription feeds written: {base}/feed.xml (Atom) and {base}/feed.json (JSON Feed)')
        else:
            print('SEO: no site address known, so sitemap.xml / robots.txt / canonical were NOT written: '
                  'set SITE_URL or pass --site-url https://your-domain')
        if r['notice']:
            print('SEO: ' + r['notice'])
        for problem, ids in r['problems'].items():
            print(f'SEO: {len(ids)} page(s) with {problem}: ' + ', '.join(ids[:5]) + (' ...' if len(ids) > 5 else ''))
