#!/usr/bin/env python3
"""
convert.py: turn the files of library/ into readable HTML and plain data ONCE (when they are added or built), so that reading and searching
never need a server to compute anything.

For every PDF / Markdown / TXT / HTML file of library/ (a tool folder is a program, not a document: left alone) a small package is written to
converted/<id>/, where <id> is the first 12 characters of the file's SHA-1 (the same content is converted once; a changed file gets a new package):

    doc.json    {title, author, lang, pages, chars, toc[{t, l, p}], summary, keywords, quality, ...}      the "data": what the public directory may search
    text.json   {u: 'page' | 'part', p: [1, 2, ...], t: ['text of page 1', ...]}                         the text, page by page (PDF) or part by part: for the full-text search of "my shelf"
    body.html   a readable, reflowed version of a PDF (headings, paragraphs, page markers); only for a PDF whose text could be read

The page shows body.html in its own reader (so the reading settings, the contents panel, the colours and a phone's small screen all work) and keeps the original PDF one
click away. A scanned PDF, a PDF whose fonts cannot be read, or anything else that cannot be converted keeps being the original file: nothing is lost, nothing is guessed.

    python convert.py              convert what is new or changed (hidden items are never converted), print what was done
    python convert.py --force      convert everything again
    python convert.py --prune      also remove packages that no file of library/ needs any more

PDF reading needs PyMuPDF (pip install pymupdf); without it a PDF stays as it is and Markdown / TXT / HTML are still converted (the standard library is enough for those).
Run it on your own computer and commit converted/: the build on Vercel only reads it. An item can opt out with `"convert": false` in library/_meta.json.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import time
from html import escape as esc
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(ROOT, 'converted')
VERSION = 1                          # change when what is written changes: every package is then made again
TYPES = ('pdf', 'md', 'txt', 'html')
MAX_BODY = 4 * 1024 * 1024           # a reflowed book bigger than this stays the original PDF
SECTION_CHARS = 3000                 # the text of an article is kept in parts of about this size
TEXT_SAMPLE = 200_000                # characters looked at for keywords
MIN_TEXT_PAGE = 40                   # a PDF page with fewer characters than this counts as having no text (a scan, a picture)

CJK = re.compile(r'[㐀-鿿豈-﫿]')
CJK_RUN = re.compile(r'[㐀-鿿豈-﫿]+')
SENTENCE_END = '。！？!?.;；:：”」』）)…"\''


def _clean(s):
    return re.sub(r'\s+', ' ', s or '').strip()


# ------------------------------------------------------------------------------------------------ identity and cache
_SHA = {}


def sha1_file(path):
    """SHA-1 of a file, kept for as long as the file does not change (a scan asks for it again and again)."""
    st = os.stat(path)
    key = (path, st.st_mtime_ns, st.st_size)
    if key not in _SHA:
        h = hashlib.sha1()
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(1 << 20), b''):
                h.update(chunk)
        _SHA[key] = h.hexdigest()
    return _SHA[key]


def package_dir(pid, root=None):
    return os.path.join(root or CACHE, pid)


def read_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_atomic(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    os.replace(tmp, path)


def load_doc(pid, root=None):
    """doc.json of a package made by this version, or None."""
    d = read_json(os.path.join(package_dir(pid, root), 'doc.json'))
    return d if isinstance(d, dict) and d.get('v') == VERSION else None


# ------------------------------------------------------------------------------------------------ language, summary, keywords
def lang_of(text):
    cjk = len(CJK.findall(text))
    words = len(re.findall(r'[A-Za-z]+', text))
    if cjk > 200 and words > 600:
        return 'mixed'
    return 'zh' if cjk >= words else 'en'


ZH_STOP_CHARS = set('的了是在和与及或也都就而但并被把对于从到有为以其之这那我你他她它们个一不人中大上下来去说着过会要能可还没很更最已所如若则因由此向使又只才将等为让给用比像该各每某么吗呢吧啊呀哦')
ZH_STOP_WORDS = set('星期 月日 年月 日期 星期一 星期二 星期三 星期四 星期五 星期六 星期日 我们 你们 他们 她们 它们 自己 可以 能够 进行 通过 因此 所以 但是 如果 因为 这个 那个 这些 那些 什么 怎么 没有 已经 以及 或者 而且 不是 就是 还是 只是 之后 之前 时候 一个 一些 一种 方面 问题 情况 东西 目前 开始 出来 起来 下来 这样 那样 然后 同时 其中 相关 主要 重要 需要 可能 由于 对于 关于 其实 比较 非常 更加 本书 作者 读者 内容 部分 第一 第二 第三 之间 之一 其他 现在 当时 为了 成为 发展 工作 公司 企业 我国 国家 社会'.split())
EN_STOP = set('''a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours
however therefore thus also one two three may might must shall many much new use used using like make made well first second chapter figure table page pages part section et al etc ie eg via per vs'''.split())


def keywords(text, lang, limit=8):
    """Words that say what a text is about (no dictionary, so a Chinese word is a repeated 2-4 character run): frequent, not made of common characters, the longer of two overlapping candidates wins."""
    text = text[:TEXT_SAMPLE]
    cands = {}
    if lang in ('zh', 'mixed'):
        counts = {}
        for run in CJK_RUN.findall(text):
            n = len(run)
            for size in (2, 3, 4):
                for i in range(0, n - size + 1):
                    g = run[i:i + size]
                    if any(ch in ZH_STOP_CHARS for ch in g) or g in ZH_STOP_WORDS:
                        continue
                    counts[g] = counts.get(g, 0) + 1
        floor = 3 if len(text) > 4000 else 2
        for g, c in counts.items():
            if c >= floor:
                cands[g] = c * (len(g) ** 1.5)
    if lang in ('en', 'mixed'):
        counts = {}
        for w in re.findall(r"[A-Za-z][A-Za-z\-']{2,}", text):
            lw = w.lower()
            if lw in EN_STOP or len(lw) < 3:
                continue
            counts[lw] = counts.get(lw, 0) + 1
        for ph in re.findall(r'\b([A-Z][a-z]+(?:[ ][A-Z][a-z]+){1,2})\b', text):         # a name of two or three capitalised words
            key = ph.lower()
            if not any(wd in EN_STOP for wd in key.split()):
                counts[key] = counts.get(key, 0) + 2
        floor = 3 if lang == 'en' else 5
        for g, c in counts.items():
            if c >= floor:
                cands[g] = c * (len(g) ** 0.7) * (1 if lang == 'en' else 0.8)
    chosen = []
    for g, _s in sorted(cands.items(), key=lambda x: (-x[1], x[0])):
        if any(g in c or c in g for c in chosen):
            continue
        chosen.append(g)
        if len(chosen) >= limit:
            break
    return [g.title() if lang == 'en' and ' ' in g and g.islower() else g for g in chosen]


NOT_A_SUMMARY = re.compile(r'(https?://|www\.|©|ISBN|All rights reserved|版权所有|出版社|版次|印刷|印张|定价|CIP|\.{5,}|…{3,}|·{5,}|目\s*录|Contents\b)', re.I)


def summary(paragraphs, lang, limit=200):
    """The first paragraph that reads like prose (not a copyright line, not a contents page), cut at a sentence end."""
    need = 60 if lang in ('zh', 'mixed') else 120
    for p in paragraphs[:600]:
        p = _clean(p)
        if len(p) < need or NOT_A_SUMMARY.search(p) or sum(c.isdigit() for c in p) > 0.25 * len(p):
            continue
        if len(p) <= limit:
            return p
        cut = p[:limit]
        ends = [m.end() for m in re.finditer(r'[。！？!?]|\.\s', cut)]
        if ends and ends[-1] > limit * 0.5:
            return cut[:ends[-1]].strip()
        return cut.rstrip(' ，,、;；') + '…'
    return ''


# ------------------------------------------------------------------------------------------------ reflow
def join_lines(lines):
    """The lines of one block of a PDF (cut where the line ended on the page) -> one paragraph: no space between two Chinese characters, a hyphen at the end of a line is closed up."""
    out = ''
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if not out:
            out = ln
        elif out.endswith('-') and out[-2:-1].isalpha() and ln[:1].islower():
            out = out[:-1] + ln
        elif (CJK.match(out[-1]) or out[-1] in '，。、；：！？）」』”》') and (CJK.match(ln[0]) or ln[0] in '，。、；：！？（「『“《'):
            out += ln
        else:
            out += ' ' + ln
    return out


def _is_heading_text(t):
    return 0 < len(t) <= 80 and not t.endswith(('。', '.', ';', '；', ',', '，', '、'))


# ------------------------------------------------------------------------------------------------ a PDF
def _fitz():
    try:
        import pymupdf
        return pymupdf
    except ImportError:
        try:
            import fitz
            return fitz
        except ImportError:
            return None


def have_pdf_reader():
    return _fitz() is not None


def read_pdf(path):
    """-> {pages: [[block...]], toc, meta, n} or None. A block is {'t': text, 'size': font size, 'bold': bool, 'y0', 'y1', 'lines': n, 'page': page number}."""
    fz = _fitz()
    if fz is None:
        return None
    try:
        doc = fz.open(path)
        if doc.needs_pass and not doc.authenticate(''):
            doc.close()
            return None
    except Exception:                                                     # noqa: BLE001  (a file that is not a PDF, a broken one)
        return None
    pages, n = [], doc.page_count
    for i in range(n):
        try:
            page = doc.load_page(i)
            h, w = float(page.rect.height) or 1.0, float(page.rect.width) or 1.0
            blocks = []
            for b in page.get_text('dict').get('blocks', []):
                if b.get('type') != 0:
                    continue
                lines, sizes, bold, chars = [], {}, 0, 0
                for ln in b.get('lines', []):
                    txt = ''.join(s.get('text', '') for s in ln.get('spans', []))
                    if not txt.strip():
                        continue
                    lines.append(txt)
                    for s in ln.get('spans', []):
                        k = round(float(s.get('size', 0)) * 2) / 2
                        sizes[k] = sizes.get(k, 0) + len(s.get('text', ''))
                        if (int(s.get('flags', 0)) & 16) or 'bold' in str(s.get('font', '')).lower():
                            bold += len(s.get('text', ''))
                        chars += len(s.get('text', ''))
                if not lines:
                    continue
                size = max(sizes.items(), key=lambda x: x[1])[0] if sizes else 0
                blocks.append({'t': join_lines(lines), 'size': size, 'bold': chars > 0 and bold >= 0.6 * chars, 'y0': b['bbox'][1] / h, 'y1': b['bbox'][3] / h, 'x0': b['bbox'][0] / w, 'x1': b['bbox'][2] / w,
                               'w': w, 'lines': len(lines), 'page': i + 1})
            pages.append(blocks)
        except Exception:                                                 # noqa: BLE001  (one page that cannot be read does not spoil the book)
            pages.append([])
    toc = []
    try:
        toc = [(int(l), _clean(t), int(p)) for l, t, p in doc.get_toc() if _clean(t)]
    except Exception:                                                     # noqa: BLE001
        toc = []
    meta = {k: v for k, v in (doc.metadata or {}).items() if v}
    doc.close()
    return {'pages': pages, 'toc': toc, 'meta': meta, 'n': n}


def _merge_lines(blocks, body_size):
    """Some PDFs store every line of a paragraph as a block of its own. Where a page is made of such lines, the lines that run on (the one before reaches the right edge, this one is not indented,
    the gap is that of two lines of one paragraph) are put together again; a short line ends a paragraph, an indent starts one."""
    singles = [b for b in blocks if b['lines'] == 1]
    if len(singles) < max(8, int(0.6 * len(blocks))):
        return blocks
    x0s = sorted(b['x0'] for b in singles)
    x1s = sorted(b['x1'] for b in singles)
    col0, col1 = x0s[len(x0s) // 4], x1s[int(len(x1s) * 0.85)]
    out = []
    for b in blocks:
        prev = out[-1] if out else None
        em = b['size'] / b['w']
        if (prev is not None and prev.get('_line') and b['lines'] == 1 and abs(b['size'] - prev['size']) < 0.6 and b['size'] < body_size * 1.2 and not b['bold'] and not prev['bold']
                and 0 <= b['y0'] - prev['y1'] < 0.9 * (prev['y1'] - prev['y0']) and prev['x1'] >= col1 - 1.5 * em and b['x0'] <= col0 + 0.9 * em):
            prev['t'] = join_lines([prev['t'], b['t']])
            prev['x1'], prev['y1'] = b['x1'], b['y1']
            continue
        b = dict(b)
        b['_line'] = b['lines'] == 1
        out.append(b)
    return out


def _noise(pages):
    """Running heads, running feet and page numbers: lines in the top or the bottom of the page that come back on many pages."""
    n = len(pages)
    seen = {}
    for blocks in pages:
        keys = set()
        for b in blocks:
            if b['y1'] < 0.09 or b['y0'] > 0.91:
                keys.add(re.sub(r'\d+', '#', b['t'].strip())[:80])
        for k in keys:
            seen[k] = seen.get(k, 0) + 1
    floor = max(3, int(0.25 * n))
    return {k for k, c in seen.items() if c >= floor}


def _body_size(pages):
    sizes = {}
    for blocks in pages:
        for b in blocks:
            sizes[b['size']] = sizes.get(b['size'], 0) + len(b['t'])
    return max(sizes.items(), key=lambda x: x[1])[0] if sizes else 10


def convert_pdf(path):
    """-> {'doc': {...}, 'units': [text of each page], 'body': html or ''} or None (no PDF reader, not a readable PDF)."""
    raw = read_pdf(path)
    if raw is None:
        return None
    pages, n = raw['pages'], raw['n']
    noise = _noise(pages)
    body_size = _body_size(pages)
    items, page_text, bad, chars, text_pages = [], [], 0, 0, 0
    heads = []                                                            # (size, index in items)
    for blocks in pages:
        keep = []
        for b in blocks:
            key = re.sub(r'\d+', '#', b['t'].strip())[:80]
            if (b['y1'] < 0.09 or b['y0'] > 0.91) and (key in noise or re.fullmatch(r'[\s\-–—·#\d]+|[ivxlcdm]+|第\s*\d+\s*页', b['t'].strip(), re.I)):
                continue
            keep.append(b)
        keep = _merge_lines(keep, body_size)
        ptxt = []
        for b in keep:
            t = b['t']
            bad += t.count('�') + len(re.findall(r'[-]', t))
            chars += len(t)
            head = b['lines'] <= 2 and _is_heading_text(t) and (b['size'] >= body_size * 1.25 or (b['bold'] and b['size'] >= body_size * 1.05 and len(t) <= 60))
            items.append({'k': 'h' if head else 'p', 't': t, 'size': b['size'], 'page': b['page']})
            if head:
                heads.append(b['size'])
            ptxt.append(t)
        page_text.append('\n'.join(ptxt))
        if sum(len(x) for x in ptxt) >= MIN_TEXT_PAGE:
            text_pages += 1
    sizes = sorted({s for s in heads}, reverse=True)[:3]
    for it in items:
        if it['k'] == 'h':
            it['l'] = (sizes.index(it['size']) + 1) if it['size'] in sizes else len(sizes) or 1
    # a paragraph that is cut by the end of a page goes on on the next one
    merged = []
    for it in items:
        prev = merged[-1] if merged else None
        if prev and prev['k'] == 'p' and it['k'] == 'p' and it['page'] == prev['page'] + 1 and prev['t'] and prev['t'][-1] not in SENTENCE_END + '：' and len(prev['t']) > 12 and not prev.get('joined'):
            prev['t'] = join_lines([prev['t'], it['t']])
            prev['joined'] = True
            prev.setdefault('cuts', []).append((len(prev['t']) - len(it['t']), it['page']))        # where the next page begins inside this paragraph
            continue
        merged.append(it)
    quality = round((text_pages / n if n else 0) * max(0.0, 1 - min(1.0, bad / max(1, chars) * 20)), 3)
    full = '\n'.join(page_text)
    lang = lang_of(full)
    paragraphs = [it['t'] for it in merged if it['k'] == 'p']
    toc = _toc_from(raw['toc'], merged)
    title = _clean(raw['meta'].get('title') or '') or next((it['t'] for it in merged if it['k'] == 'h' and it.get('l', 1) == 1 and it['page'] <= 2 and len(it['t']) >= 4), '')
    doc = {'title': title[:120], 'author': _clean(raw['meta'].get('author') or '')[:120], 'lang': lang, 'pages': n, 'chars': chars, 'toc': toc, 'summary': summary(paragraphs, lang),
           'keywords': keywords(full, lang), 'quality': quality, 'kind': 'pdf', 'unit': 'page'}
    ok = quality >= 0.6 and chars >= 300
    body = _pdf_html(merged, raw['toc'], toc) if ok else ''
    if len(body.encode('utf-8')) > MAX_BODY:
        body, ok = '', False
        doc['note'] = 'too big to reflow'
    doc['ok'] = bool(body)
    return {'doc': doc, 'units': page_text, 'body': body}


def _toc_from(bookmarks, items):
    """The contents: the PDF's own bookmarks when it has some, else the headings found."""
    if len(bookmarks) >= 3:
        return [{'t': t[:100], 'l': min(max(l, 1), 3), 'p': p} for l, t, p in bookmarks[:400]]
    return [{'t': it['t'][:100], 'l': it.get('l', 1), 'p': it['page']} for it in items if it['k'] == 'h'][:400]


def _pdf_html(items, bookmarks, toc):
    """The readable page: headings, paragraphs and a marker where a page of the PDF begins (an address inside the page: #p12)."""
    out, last_page, sid = [], 0, 0
    pending = {}
    if len(bookmarks) >= 3:                                              # a bookmark that points to a page puts its heading in front of that page's text (unless the page has that heading itself)
        for l, t, p in bookmarks:
            pending.setdefault(p, []).append((min(max(l, 1), 3), t))
    have_heads = {}
    for it in items:
        if it['k'] == 'h':
            have_heads.setdefault(it['page'], set()).add(re.sub(r'\s+', '', it['t']))
    for it in items:
        if it['page'] > last_page:
            for pg in range(last_page + 1, it['page'] + 1):
                out.append('<div class="pg" id="p%d" data-p="%d">%d</div>' % (pg, pg, pg))
            last_page = it['page']
            for l, t in pending.pop(it['page'], []):
                if re.sub(r'\s+', '', t) not in have_heads.get(it['page'], set()):
                    sid += 1
                    out.append('<h%d id="s%d">%s</h%d>' % (l + 1, sid, esc(t), l + 1))
        if it['k'] == 'h':
            sid += 1
            lvl = min(it.get('l', 1) + 1, 4)
            out.append('<h%d id="s%d">%s</h%d>' % (lvl, sid, esc(it['t']), lvl))
        else:
            text, at, parts = it['t'], 0, []
            for cut, pg in it.get('cuts', []):                           # a paragraph that runs over a page break: an anchor for the next page where the page changes
                parts.append(esc(text[at:cut]) + '<span class="pgi" id="p%d" data-p="%d"></span>' % (pg, pg))
                at = cut
                last_page = max(last_page, pg)
            out.append('<p>%s</p>' % (''.join(parts) + esc(text[at:])))
    return '\n'.join(out) + '\n'


# ------------------------------------------------------------------------------------------------ Markdown, plain text, HTML
def _front_matter(text):
    meta = {}
    m = re.match(r'^﻿?---\s*\n(.*?)\n---\s*(\n|$)', text, re.S)
    if not m:
        return meta, text
    for line in m.group(1).splitlines():
        if ':' in line and not line.startswith((' ', '\t', '-')):
            k, v = line.split(':', 1)
            meta[k.strip().lower()] = v.strip().strip('"\'')
    return meta, text[m.end():]


def _strip_md(s):
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', s)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'[*_`~]+', '', s)
    s = re.sub(r'<[^>]+>', '', s)
    return _clean(s)


CHAPTER = re.compile(r'^\s*(第\s*[零〇一二三四五六七八九十百千两0-9]+\s*[章节回卷部篇集]|卷\s*[一二三四五六七八九十0-9]+|chapter\s+(\d+|[ivxlc]+)\b|part\s+(\d+|[ivxlc]+)\b)', re.I)


def _parts(blocks):
    """[(heading or '', text)] -> units of about SECTION_CHARS: ([text of each unit], [first heading of each unit])."""
    units, heads, cur, cur_head = [], [], [], ''
    size = 0
    for head, text in blocks:
        if head and cur and size > 600:
            units.append('\n'.join(cur))
            heads.append(cur_head)
            cur, size, cur_head = [], 0, ''
        if head and not cur_head:
            cur_head = head
        cur.append(text)
        size += len(text)
        if size >= SECTION_CHARS:
            units.append('\n'.join(cur))
            heads.append(cur_head)
            cur, size, cur_head = [], 0, ''
    if cur:
        units.append('\n'.join(cur))
        heads.append(cur_head)
    return units, heads


def _place_toc(toc, units):
    """Say which part of the text each heading is in (the headings come in the order of the text, so the search only moves forward)."""
    pos = 0
    for t in toc:
        for i in range(pos, len(units)):
            if t['t'] and t['t'] in units[i]:
                t['p'] = i + 1
                pos = i
                break


def convert_markdown(path, txt=False):
    with open(path, 'r', encoding='utf-8-sig', errors='replace') as f:
        raw = f.read()
    fm, body = ({}, raw) if txt else _front_matter(raw)
    blocks, toc, paras, in_code, title, buf = [], [], [], False, '', []
    n_chapters = sum(1 for ln in body.splitlines() if len(ln.strip()) <= 60 and CHAPTER.match(ln)) if txt else 0
    for line in body.splitlines():
        l = line.strip()
        if l.startswith(('```', '~~~')):
            in_code = not in_code
            continue
        if in_code:
            continue
        h = None
        if txt:
            if n_chapters >= 2 and l and len(l) <= 60 and CHAPTER.match(l):
                h = (1, l)
        else:
            m = re.match(r'^(#{1,4})\s+(.+?)\s*#*$', l)
            if m:
                h = (len(m.group(1)), _strip_md(m.group(2)))
        if h:
            if buf:
                paras.append(' '.join(buf))
                blocks.append(('', paras[-1]))
                buf = []
            if h[0] == 1 and not title and not txt:
                title = h[1]
            toc.append({'t': h[1][:100], 'l': min(h[0], 3), 'p': 0})
            blocks.append((h[1], h[1]))
            continue
        if not l:
            if buf:
                paras.append(' '.join(buf))
                blocks.append(('', paras[-1]))
                buf = []
            continue
        if txt and not title:
            title = l[:120]
        buf.append(l if txt else _strip_md(l))
    if buf:
        paras.append(' '.join(buf))
        blocks.append(('', paras[-1]))
    units, heads = _parts(blocks)
    _place_toc(toc, units)
    full = '\n'.join(units)
    lang = lang_of(full)
    doc = {'title': _clean(fm.get('title') or title)[:120], 'author': _clean(fm.get('author') or '')[:120], 'lang': lang, 'pages': 0, 'chars': len(full), 'toc': toc[:400],
           'summary': summary(paras, lang), 'keywords': keywords(full, lang), 'quality': 1.0, 'kind': 'txt' if txt else 'md', 'unit': 'part', 'ok': False}
    return {'doc': doc, 'units': units, 'body': ''}


class _TextHtml(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks, self.toc, self.paras = [], [], []
        self.title, self.author = '', ''
        self._skip, self._buf, self._head = 0, [], None
        self._in_title = False

    BLOCK = {'p', 'div', 'li', 'tr', 'section', 'article', 'blockquote', 'pre', 'br', 'td', 'dd', 'dt'}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'template', 'svg', 'nav', 'aside', 'footer', 'head'):
            self._skip += 1
            if tag == 'head':
                self._skip -= 1                                           # the title is inside <head>
        elif tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            n = (a.get('name') or a.get('property') or '').lower()
            if n in ('author', 'archive:author') and a.get('content') and not self.author:
                self.author = _clean(a['content'])
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            self._flush()
            self._head = int(tag[1])
        elif tag in self.BLOCK:
            self._flush()

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'template', 'svg', 'nav', 'aside', 'footer'):
            self._skip = max(0, self._skip - 1)
        elif tag == 'title':
            self._in_title = False
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            t = _clean(''.join(self._buf))
            self._buf = []
            if t:
                self.toc.append({'t': t[:100], 'l': min(self._head or 1, 3), 'p': 0})
                self.blocks.append((t, t))
            self._head = None
        elif tag in self.BLOCK:
            self._flush()

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self._buf.append(data)

    def _flush(self):
        if self._head is not None:
            return
        t = _clean(''.join(self._buf))
        self._buf = []
        if t:
            self.paras.append(t)
            self.blocks.append(('', t))


def convert_html(path):
    with open(path, 'r', encoding='utf-8-sig', errors='replace') as f:
        raw = f.read()
    p = _TextHtml()
    try:
        p.feed(raw)
        p.close()
        p._flush()
    except Exception:                                                     # noqa: BLE001
        pass
    units, _heads = _parts(p.blocks)
    _place_toc(p.toc, units)
    full = '\n'.join(units)
    lang = lang_of(full)
    doc = {'title': _clean(p.title)[:120], 'author': p.author[:120], 'lang': lang, 'pages': 0, 'chars': len(full), 'toc': p.toc[:400], 'summary': summary(p.paras, lang),
           'keywords': keywords(full, lang), 'quality': 1.0, 'kind': 'html', 'unit': 'part', 'ok': False}
    return {'doc': doc, 'units': units, 'body': ''}


# ------------------------------------------------------------------------------------------------ one file -> one package
def convert_path(path, kind):
    if kind == 'pdf':
        return convert_pdf(path)
    if kind in ('md', 'txt'):
        return convert_markdown(path, txt=(kind == 'txt'))
    if kind == 'html':
        return convert_html(path)
    return None


def write_package(pid, result, sha, size, root=None):
    d = package_dir(pid, root)
    doc = dict(result['doc'])
    doc.update({'v': VERSION, 'id': pid, 'converted': time.strftime('%Y-%m-%d'), 'from': {'sha1': sha, 'size': size}})
    units = result['units']
    write_atomic(os.path.join(d, 'text.json'), json.dumps({'v': VERSION, 'u': doc.get('unit', 'part'), 'p': list(range(1, len(units) + 1)), 't': units}, ensure_ascii=False, separators=(',', ':')))
    body_path = os.path.join(d, 'body.html')
    if result['body']:
        write_atomic(body_path, result['body'])
    elif os.path.exists(body_path):
        os.remove(body_path)
    write_atomic(os.path.join(d, 'doc.json'), json.dumps(doc, ensure_ascii=False, indent=1))
    return doc


def eligible(item):
    """A document: a file (not a tool folder) of a kind that can be converted, not hidden, not opted out."""
    return (item.get('type') in TYPES and not item.get('project') and not item.get('hidden') and item.get('noconvert') is not True)


def convert_items(items, library, force=False, log=print, root=None):
    """Make (or refresh) the package of every eligible item. -> {'done': n, 'kept': n, 'failed': [id], 'skipped': [id]}"""
    stats = {'done': 0, 'kept': 0, 'failed': [], 'skipped': []}
    for it in items:
        if not eligible(it):
            continue
        path = os.path.join(library, *it['id'].split('/'))
        if not os.path.isfile(path):
            continue
        sha = sha1_file(path)
        pid = sha[:12]
        if not force and load_doc(pid, root):
            stats['kept'] += 1
            continue
        if it['type'] == 'pdf' and not have_pdf_reader():
            stats['skipped'].append(it['id'])
            continue
        res = convert_path(path, it['type'])
        if res is None:
            stats['failed'].append(it['id'])
            log('  could not read %s' % it['id'])
            continue
        doc = write_package(pid, res, sha, os.path.getsize(path), root)
        stats['done'] += 1
        log('  %s: %s%s, %s chars%s' % (it['id'], it['type'], ' (%d pages)' % doc['pages'] if doc.get('pages') else '', doc['chars'],
                                         ', readable page made' if doc.get('ok') else (', original PDF kept (quality %s)' % doc['quality'] if it['type'] == 'pdf' else '')))
    return stats


def prune(items, root=None):
    """Remove the packages that no eligible item needs. -> list of removed ids"""
    import shutil
    root = root or CACHE
    keep = set()
    for it in items:
        if eligible(it) and it.get('conv'):
            keep.add(it['conv']['id'])
    gone = []
    if os.path.isdir(root):
        for name in sorted(os.listdir(root)):
            p = os.path.join(root, name)
            if os.path.isdir(p) and re.fullmatch(r'[0-9a-f]{12}', name) and name not in keep:
                shutil.rmtree(p)
                gone.append(name)
    return gone


# ------------------------------------------------------------------------------------------------ what the manifest takes from a package
def apply_to_items(items, library, root=None):
    """Fill the cards from the packages (no conversion here, so a scan stays quick): summary / keywords / author / pages / language where the card has none, and `conv` (which package, how good,
    whether there is a readable page). A package of a file that changed since is not used."""
    for it in items:
        if not eligible(it):
            continue
        path = os.path.join(library, *it['id'].split('/'))
        try:
            sha = sha1_file(path)
        except OSError:
            continue
        doc = load_doc(sha[:12], root)
        if not doc or (doc.get('from') or {}).get('sha1') != sha:
            continue
        if not it.get('summary') and doc.get('summary'):
            it['summary'] = doc['summary'][:220]
        if not it.get('keywords') and doc.get('keywords'):
            it['keywords'] = list(doc['keywords'])
        if not it.get('author') and doc.get('author'):
            it['author'] = doc['author']
        if it['type'] == 'pdf':
            if doc.get('pages'):
                it['pages'] = doc['pages']
            if doc.get('lang'):
                it['lang'] = doc['lang']
        it['conv'] = {'id': doc['id'], 'q': doc.get('quality', 0), 'ok': 1 if doc.get('ok') else 0, 'u': doc.get('unit', 'part'), 'n': len(doc.get('toc') or []), 'c': doc.get('chars', 0)}


# ------------------------------------------------------------------------------------------------ the small index that says which documents can hold a word
def grams(text):
    """What a word is looked up by: every two neighbouring Chinese characters, every three neighbouring letters / digits of a Latin word. A word shorter than that has no gram (and no filter)."""
    out = set()
    low = text.lower()
    for run in CJK_RUN.findall(low):
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    for w in re.findall(r'[a-z0-9]+', low):
        for i in range(len(w) - 2):
            out.add(w[i:i + 3])
    return out


def build_ft(items, root=None):
    """-> {'v', 'ids': [package ids], 'g': {gram: [index of every document that has it]}, 'u': [grams that every document has]} for the converted, visible documents. A gram that is in neither
    is in no document. (The grams every document has say nothing and are only listed, when there are 4 documents or more.)"""
    root = root or CACHE
    ids, sets = [], []
    for it in items:
        c = it.get('conv')
        if not c or not eligible(it) or c['id'] in ids:
            continue
        t = read_json(os.path.join(package_dir(c['id'], root), 'text.json'))
        if not isinstance(t, dict) or not isinstance(t.get('t'), list):
            continue
        ids.append(c['id'])
        sets.append(grams('\n'.join(t['t'])))
    index = {}
    for i, s in enumerate(sets):
        for g in s:
            index.setdefault(g, []).append(i)
    everywhere = []
    if len(ids) >= 4:
        everywhere = sorted(g for g, v in index.items() if len(v) == len(ids))
        index = {g: v for g, v in index.items() if len(v) < len(ids)}
    return {'v': 1, 'ids': ids, 'u': everywhere, 'g': index}


def write_ft(items, out_root, root=None):
    """converted/ft.json for the visible documents. Nothing is written when no document is converted (and an old file goes)."""
    data = build_ft(items, root)
    path = os.path.join(out_root, 'ft.json')
    if not data['ids']:
        if os.path.exists(path):
            os.remove(path)
        return 0
    write_atomic(path, json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    return len(data['ids'])


# ------------------------------------------------------------------------------------------------ command line
def main(argv=None):
    ap = argparse.ArgumentParser(description='Convert the files of library/ into readable HTML and data (see the top of this file).')
    ap.add_argument('--force', action='store_true', help='convert everything again')
    ap.add_argument('--prune', action='store_true', help='remove packages that no file needs any more')
    args = ap.parse_args(argv)
    import build_index
    items = build_index.scan_library()
    if not have_pdf_reader():
        print('NOTE: PyMuPDF is not installed (pip install pymupdf): PDF files stay as they are; Markdown, TXT and HTML are converted.')
    stats = convert_items(items, build_index.LIBRARY, force=args.force)
    print('converted %d, up to date %d%s%s' % (stats['done'], stats['kept'], ', not converted (no PDF reader): %d' % len(stats['skipped']) if stats['skipped'] else '',
                                              ', could not be read: %s' % ', '.join(stats['failed']) if stats['failed'] else ''))
    items = build_index.scan_library()
    if args.prune:
        gone = prune(items)
        print('removed %d package(s) no file needs any more' % len(gone))
    n = write_ft(items, CACHE)
    print('full-text prefilter: %d document(s)' % n)
    build_index.write_manifest(items)
    return 0


if __name__ == '__main__':
    sys.exit(main())
