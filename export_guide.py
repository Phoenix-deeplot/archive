#!/usr/bin/env python3
"""
export_guide.py — the illustrated guide (library/notes/guide/index.html) as files to paste into other platforms.

    python export_guide.py                    # -> ../my-archive-export/
    python export_guide.py --out D:\\export    # somewhere else
    python export_guide.py --no-cards         # skip the Xiaohongshu picture cards (they need Edge or Chrome)

The guide page is the one source: change its text there, run this again. Per tab (使用说明 = usage, 安装部署 = deploy) it writes
  <tab>.docx   Word, pictures inside      -> Zhihu: write an article > "导入文档" > pick this file (headings, lists, tables and pictures come along)
  <tab>.md     Markdown + images/         -> any Markdown editor (Zhihu's import takes it too; pictures are uploaded by hand from images/)
and, for the usage tab, xiaohongshu/ : 3:4 picture cards (1242 x 1660) and a caption, because that is how a note there is made.

Needs lxml and Pillow; python-docx for the Word files (pip install python-docx). The result goes next to the project, never into it:
the project folder is what gets deployed.
"""
import argparse
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

try:
    from lxml import html as LH
    from PIL import Image
except ImportError as e:                                         # pragma: no cover
    sys.exit('export_guide.py needs lxml and Pillow: pip install lxml Pillow  (%s)' % e)

ROOT = os.path.dirname(os.path.abspath(__file__))
GUIDE = os.path.join(ROOT, 'library', 'notes', 'guide')
ICONS = {'i-star': '⭐', 'i-pin': '📌', 'i-hide': '🙈', 'i-move': '📁', 'i-globe': '🌐', 'i-shuffle': '🔀', 'i-ext': '↗️', 'i-trash': '🗑️'}
TABS = {'usage': '使用说明', 'deploy': '安装部署'}


def site_url():
    try:
        m = re.search(r'--site-url\s+(https?://[^\s"\\|]+)', open(os.path.join(ROOT, 'vercel.json'), encoding='utf-8').read())
        return m.group(1).rstrip('/') if m else ''
    except OSError:
        return ''


# ---------------------------------------------------------------- the page -> a list of blocks
def cls(el):
    return set((el.get('class') or '').split())


def segs(el, flags=None, out=None, pre=False):
    """Inline content of `el` -> [(text, {'b','code','href'})]."""
    flags = flags or {}
    out = [] if out is None else out

    def text(s, f):
        if not s:
            return
        if not pre:
            s = re.sub(r'\s+', ' ', s)
        if s:
            out.append((s, dict(f)))

    text(el.text, flags)
    for c in el:
        tag = c.tag if isinstance(c.tag, str) else ''
        f = dict(flags)
        if tag in ('b', 'strong'):
            f['b'] = True
        elif tag in ('code', 'kbd'):
            f['code'] = True
        elif tag == 'a':
            f['href'] = c.get('href') or ''
        elif tag == 'svg':
            ref = ''.join(u.get('href') or '' for u in c.iter('use')).lstrip('#')
            text(ICONS.get(ref, ''), f)
            text(c.tail, flags)
            continue
        elif tag == 'br':
            text(' ', flags)
            text(c.tail, flags)
            continue
        segs(c, f, out, pre)
        text(c.tail, flags)
    return out


def plain(el):
    return re.sub(r'\s+', ' ', ''.join(s for s, _ in segs(el))).strip()


def trim(sg):
    """Collapse spaces at the edges of a paragraph."""
    sg = [list(x) for x in sg]
    while sg and not sg[0][0].strip():
        sg.pop(0)
    while sg and not sg[-1][0].strip():
        sg.pop()
    if sg:
        sg[0][0] = sg[0][0].lstrip()
        sg[-1][0] = sg[-1][0].rstrip()
    return [tuple(x) for x in sg]


def blocks(root):
    out = []
    for el in root:
        tag = el.tag if isinstance(el.tag, str) else ''
        c = cls(el)
        if tag == 'ul' and 'toc' in c:
            continue
        if tag == 'h2':
            num = ''.join(n.text or '' for n in el.iter('span') if 'n' in cls(n)).strip()
            out.append(('h2', num, plain(el)[len(num):].strip() if plain(el).startswith(num) else plain(el)))
        elif tag == 'h3':
            out.append(('h3', plain(el)))
        elif tag == 'p':
            out.append(('p', trim(segs(el))))
        elif tag == 'figure':
            out += figures([el])
        elif tag == 'div' and 'phones' in c:
            out.append(('row', figures(el.iter('figure'))))
        elif tag == 'div' and 'cards3' in c:
            out.append(('list', False, [[('p', [(plain(d.find('h3')), {'b': True}), ('：' + plain(d.find('p')), {})])] for d in el.findall('div')]))
        elif tag == 'div' and ('tip' in c or 'warn' in c):
            title = ''.join(plain(h) for h in el.iter('b') if 'h' in cls(h))
            out.append(('callout', title, [trim(segs(p)) for p in el.findall('p')], 'warn' if 'warn' in c else 'tip'))
        elif tag in ('ul', 'ol'):
            out.append(('list', tag == 'ol', [item(li) for li in el.findall('li')]))
        elif tag == 'table':
            out.append(('table', [[trim(segs(td)) for td in tr if td.tag in ('td', 'th')] for tr in el.iter('tr')], 'icons' in c))
        elif tag == 'pre':
            code = el.find('code')
            out.append(('code', ''.join((code if code is not None else el).itertext())))
        elif tag == 'details':
            summ = el.find('summary')
            out.append(('qa', plain(summ) if summ is not None else '', [trim(segs(p)) for p in el.findall('p')]))
    return out


def figures(figs):
    res = []
    for f in figs:
        img = f.find('img')
        cap = f.find('figcaption')
        if img is not None:
            res.append(('img', img.get('src') or '', img.get('alt') or '', plain(cap) if cap is not None else ''))
    return res


def item(li):
    """A list item -> [('p', inline)] plus the blocks nested in it (code, table, paragraph): everything from the first block element on."""
    holder = LH.Element('span')
    holder.text = li.text or ''
    nested = []
    for c in list(li):
        if nested or (isinstance(c.tag, str) and c.tag in ('pre', 'table', 'div', 'figure', 'ul', 'ol')):
            nested.append(c)
        else:
            holder.append(c)
    return [('p', trim(segs(holder)))] + blocks_of(nested)


def blocks_of(elements):
    wrap = LH.Element('div')
    for e in elements:
        wrap.append(e)
    return blocks(wrap)


# ---------------------------------------------------------------- images
class Images:
    def __init__(self, out_dir):
        self.dir, self.map = out_dir, {}
        os.makedirs(out_dir, exist_ok=True)

    def get(self, src):
        """img/x.webp -> images/NN-x.jpg (a path relative to the export folder), converted."""
        if src in self.map:
            return self.map[src]
        path = os.path.join(GUIDE, *src.split('/'))
        name = '%02d-%s.jpg' % (len(self.map) + 1, os.path.splitext(os.path.basename(src))[0])
        dest = os.path.join(self.dir, name)
        im = Image.open(path).convert('RGB')
        if im.width > 1600:
            im = im.resize((1600, round(im.height * 1600 / im.width)), Image.LANCZOS)
        im.save(dest, 'JPEG', quality=90, optimize=True)
        self.map[src] = 'images/' + name
        return self.map[src]


# ---------------------------------------------------------------- Markdown
def md_inline(sg, site):
    """Runs -> Markdown. Neighbouring bold runs (a bold sentence with a `code` word in it) are wrapped once, so the stars always pair up."""
    groups, cur, buf = [], None, []

    def flush():
        if buf:
            groups.append((cur, ''.join(buf)))

    for text, f in sg:
        t = text.replace('|', '\\|') if f.get('table') else text
        if f.get('code'):
            t = '`' + t.strip() + '`' if t.strip() else t
        href = f.get('href') or ''
        if href and not href.startswith('#') and t.strip():
            url = site + href if href.startswith('/') else href
            if re.match(r'https?://', url):
                t = '[' + t + '](' + url + ')'
        b = bool(f.get('b'))
        if b != cur:
            flush()
            cur, buf = b, []
        buf.append(t)
    flush()
    out = []
    for bold, s in groups:
        if bold and s.strip():
            lead, core, tail = re.match(r'(\s*)(.*?)(\s*)$', s, re.S).groups()
            s = lead + '**' + core + '**' + tail
        out.append(s)
    return ''.join(out)


def to_md(title, lead, bs, images, site, source_note):
    lines = ['# ' + title, '', lead, '']
    if source_note:
        lines += [source_note, '']

    def ind(text, n):
        return '\n'.join((' ' * n + l) if l.strip() else l for l in text.split('\n'))

    def render(b, depth=0):
        k = b[0]
        if k == 'h2':
            return '## %s%s' % (b[1] + '. ' if b[1] and b[1] != '0' else '', b[2])
        if k == 'h3':
            return '### ' + b[1]
        if k == 'p':
            return md_inline(b[1], site)
        if k == 'img':
            return '![%s](%s)\n\n*%s*' % (b[2], images.get(b[1]), b[3]) if b[3] else '![%s](%s)' % (b[2], images.get(b[1]))
        if k == 'row':
            return '\n\n'.join(render(x) for x in b[1])
        if k == 'callout':
            body = '\n>\n> '.join(md_inline(p, site) for p in b[2])
            return '> **%s**\n>\n> %s' % (b[1], body) if b[1] else '> ' + body
        if k == 'list':
            res = []
            for i, it in enumerate(b[2], 1):
                head = render(it[0])
                rest = [render(x) for x in it[1:]]
                res.append(('%d. ' % i if b[1] else '- ') + head + ''.join('\n\n' + ind(r, 4) for r in rest))
            return '\n'.join(res) if not any(len(it) > 1 for it in b[2]) else '\n\n'.join(res)
        if k == 'table':
            rows = [[md_inline([(t, dict(f, table=True)) for t, f in cell], site) or ' ' for cell in r] for r in b[1] if r]
            if b[2]:                                                     # the icon table has no header row
                rows.insert(0, ['按钮', '作用'])
            width = max(len(r) for r in rows)
            rows = [r + [' '] * (width - len(r)) for r in rows]
            return '\n'.join(['| ' + ' | '.join(rows[0]) + ' |', '|' + ' --- |' * width] + ['| ' + ' | '.join(r) + ' |' for r in rows[1:]])
        if k == 'code':
            return '```\n' + b[1].strip('\n') + '\n```'
        if k == 'qa':
            return '**问：%s**\n\n%s' % (b[1], '\n\n'.join(md_inline(p, site) for p in b[2]))
        return ''

    for b in bs:
        lines += [render(b), '']
    return '\n'.join(lines).rstrip() + '\n'


# ---------------------------------------------------------------- Word
def to_docx(path, title, lead, bs, images, out_dir, site, source_note):
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        from docx.shared import Inches, Pt, RGBColor
    except ImportError:
        print('  (python-docx is not installed: no Word file. pip install python-docx)')
        return False
    doc = Document()
    sec = doc.sections[0]
    sec.left_margin = sec.right_margin = Inches(0.9)
    for name, size in (('Normal', 11), ('Heading 1', 20), ('Heading 2', 16), ('Heading 3', 13), ('Title', 24)):
        st = doc.styles[name]
        st.font.name = 'Microsoft YaHei'
        st.font.size = Pt(size)
        rpr = st.element.get_or_add_rPr()
        rf = rpr.find(qn('w:rFonts'))
        if rf is None:
            rf = OxmlElement('w:rFonts')
            rpr.append(rf)
        for a in ('w:ascii', 'w:hAnsi', 'w:eastAsia'):
            rf.set(qn(a), 'Microsoft YaHei')
    doc.styles['Normal'].paragraph_format.space_after = Pt(6)
    doc.styles['Normal'].paragraph_format.line_spacing = 1.35

    def runs(par, sg, base_bold=False):
        for text, f in sg:
            r = par.add_run(text)
            r.bold = bool(f.get('b')) or base_bold
            if f.get('code'):
                r.font.name = 'Consolas'
                r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Consolas')
                r.font.size = Pt(10)
                r.font.color.rgb = RGBColor(0x1F, 0x7A, 0x6D)
            if f.get('href') and re.match(r'https?://|/', f['href']):
                r.font.color.rgb = RGBColor(0x1F, 0x7A, 0x6D)
                r.underline = True

    def shade(cell, fill):
        tcpr = cell._tc.get_or_add_tcPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), fill)
        tcpr.append(shd)

    def indent(par, inches):
        par.paragraph_format.left_indent = Inches(inches)

    def render(b, level=0):
        k = b[0]
        if k == 'h2':
            doc.add_heading('%s%s' % (b[1] + '. ' if b[1] and b[1] != '0' else '', b[2]), 1)
        elif k == 'h3':
            doc.add_heading(b[1], 2)
        elif k == 'p':
            p = doc.add_paragraph()
            runs(p, b[1])
            indent(p, 0.3 * level)
        elif k == 'img':
            doc.add_picture(os.path.join(out_dir, images.get(b[1])), width=Inches(6.2 if level == 0 else 5.4))
            doc.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if b[3]:
                c = doc.add_paragraph()
                r = c.add_run(b[3])
                r.italic = True
                r.font.size = Pt(9)
                r.font.color.rgb = RGBColor(0x5A, 0x66, 0x70)
                c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif k == 'row':
            t = doc.add_table(rows=1, cols=len(b[1]))
            for cell, im in zip(t.rows[0].cells, b[1]):
                cell.paragraphs[0].add_run().add_picture(os.path.join(out_dir, images.get(im[1])), width=Inches(5.9 / len(b[1]) - 0.25))
                cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                if im[3]:
                    cap = cell.add_paragraph()
                    r = cap.add_run(im[3])
                    r.italic = True
                    r.font.size = Pt(9)
                    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif k == 'callout':
            t = doc.add_table(rows=1, cols=1)
            cell = t.rows[0].cells[0]
            shade(cell, 'FBEDEB' if b[3] == 'warn' else 'E3F1EE')
            first = True
            if b[1]:
                runs(cell.paragraphs[0], [(b[1], {'b': True})])
                first = False
            for sg in b[2]:
                p = cell.paragraphs[0] if first else cell.add_paragraph()
                first = False
                runs(p, sg)
            doc.add_paragraph()
        elif k == 'list':
            for i, it in enumerate(b[2], 1):
                p = doc.add_paragraph()
                indent(p, 0.3 * level + 0.3)
                p.paragraph_format.first_line_indent = Inches(-0.25)
                p.add_run('%d. ' % i if b[1] else '•  ')
                runs(p, it[0][1])
                for x in it[1:]:
                    render(x, level + 1)
        elif k == 'table':
            rows = [r for r in b[1] if r]
            if b[2]:
                rows.insert(0, [[('按钮', {})], [('作用', {})]])
            width = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=width)
            t.style = 'Table Grid'
            if b[2]:                                                     # the button table: a narrow column for the icon
                t.autofit = False
                for row in t.rows:
                    row.cells[0].width, row.cells[1].width = Inches(0.9), Inches(5.4)
            for ri, r in enumerate(rows):
                for ci in range(width):
                    cell = t.rows[ri].cells[ci]
                    runs(cell.paragraphs[0], r[ci] if ci < len(r) else [], base_bold=(ri == 0))
                    if ri == 0:
                        shade(cell, 'F0F2F1')
            doc.add_paragraph()
        elif k == 'code':
            t = doc.add_table(rows=1, cols=1)
            cell = t.rows[0].cells[0]
            shade(cell, 'F0F2F1')
            first = True
            for line in b[1].strip('\n').split('\n'):
                p = cell.paragraphs[0] if first else cell.add_paragraph()
                first = False
                r = p.add_run(line)
                r.font.name = 'Consolas'
                r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Consolas')
                r.font.size = Pt(9.5)
                p.paragraph_format.space_after = Pt(0)
            doc.add_paragraph()
        elif k == 'qa':
            p = doc.add_paragraph()
            r = p.add_run('问：' + b[1])
            r.bold = True
            for sg in b[2]:
                runs(doc.add_paragraph(), sg)

    doc.add_heading(title, 0)
    runs(doc.add_paragraph(), [(lead, {})])
    if source_note:
        runs(doc.add_paragraph(), [(source_note, {})])
    for b in bs:
        render(b)
    doc.save(path)
    return True


# ---------------------------------------------------------------- Xiaohongshu cards
CARDS = [
    ('cover', '知树阅读', '个人数字图书馆', ['笔记、书、PDF、小工具，放进一个网页书架', '不用注册，打开就能读', '手机上能装到主屏幕，离线也能看'], 'home.webp', 'wide'),
    ('home', '认识首页', '先看这五样', ['① 我的书架 / 公共目录，点一下切换', '② 分类和标签，找东西更快', '③ 搜索：按 / 键直接跳到搜索框', '④ 卡片：点开就读', '⑤ 添加：放进你自己的文件'], 'home.webp', 'wide'),
    ('read', '读一篇', '一个阅读器，四种格式', ['目录、书签、读到哪里自动记住', '五种阅读颜色：浅色 / 深色 / 米黄 / 护眼绿', 'Markdown 和 TXT 还能调字号、行距、宽度'], 'reader-settings.webp', 'wide'),
    ('mine', '放进你自己的文件', '一次选很多个，分成“合集”', ['HTML / Markdown / TXT / PDF 都行', '只存在你的浏览器里，不上传，别人看不到', '手机上想读，就导入一个合集'], 'add.webp', 'wide'),
    ('follow', '订阅别人的博客', '新文章出现在你自己的书架里', ['贴一个博客或订阅源 → 查找 → 订阅', '一个订阅一个合集，新文章带“新”标记', '打开页面时自动更新；订阅清单可导出，换设备也能用'], 'subscribed.webp', 'wide'),
    ('phone', '手机上用', '装到主屏幕，像 App', ['Android / iPhone 都能装，没网也能再读', '左侧目录里的合集，一点就切换', '目录里往左一滑，删除或隐藏'], ['m-drawer.webp', 'm-swipe.webp'], 'phones'),
    ('dir', '公共目录与投稿', '不用注册，也不用 GitHub 账号', ['只记标题、摘要和回原站的链接', '贴网址 → 检查 → 提交，三种方式', '站长审核后出现在目录里'], 'directory.webp', 'wide'),
    ('end', '你的数据在你手里', '文件、进度、书签、订阅，都只在你的浏览器里', ['想自己搭一个？有完整的安装部署教程', '更多图文：打开网站首页，置顶的第一张卡片', '站名：知树阅读 · 个人数字图书馆'], 'home.webp', 'none'),
]

CARD_HTML = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0}
body{width:1242px;height:1660px;background:#FBFBF9;color:#1A2229;font-family:"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif;position:relative;overflow:hidden}
.top{position:absolute;left:80px;right:80px;top:70px;display:flex;justify-content:space-between;font-size:30px;color:#5A6670;font-weight:600}
.top b{color:#1F7A6D}
.bar{position:absolute;left:80px;top:128px;width:120px;height:10px;border-radius:5px;background:#1F7A6D}
h1{position:absolute;left:80px;right:80px;top:168px;margin:0;font:900 96px/1.2 "Songti SC","Noto Serif SC","SimSun",serif;letter-spacing:-1px}
.sub{position:absolute;left:80px;right:80px;top:300px;font-size:44px;line-height:1.45;color:#1F7A6D;font-weight:700}
ul{position:absolute;left:80px;right:80px;top:%(ul_top)dpx;margin:0;padding:0;list-style:none;font-size:46px;line-height:1.55}
li{margin:0 0 20px;padding-left:44px;position:relative}
li::before{content:"";position:absolute;left:0;top:26px;width:16px;height:16px;border-radius:50%%;background:#1F7A6D}
.shot{position:absolute;left:80px;right:80px;bottom:90px;border-radius:26px;border:2px solid #DDE1DF;box-shadow:0 20px 60px rgba(0,0,0,.14);overflow:hidden;background:#fff}
.shot img{display:block;width:100%%}
.phones{position:absolute;left:80px;right:80px;bottom:80px;display:flex;gap:40px;justify-content:center}
.phones img{display:block;height:%(ph)dpx;border-radius:40px;border:2px solid #DDE1DF;box-shadow:0 20px 60px rgba(0,0,0,.14)}
.logo{position:absolute;left:0;right:0;top:860px;text-align:center}
.logo img{width:520px;border-radius:120px}
.foot{position:absolute;left:80px;right:80px;bottom:46px;font-size:28px;color:#5A6670;text-align:center}
</style></head><body>
<div class="top"><span>知树阅读 · 个人数字图书馆</span><span><b>%(n)d</b> / %(total)d</span></div><div class="bar"></div>
<h1>%(title)s</h1><div class="sub">%(sub)s</div>
<ul>%(items)s</ul>
%(media)s
</body></html>'''


def data_uri(path, width):
    im = Image.open(path).convert('RGB')
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=88)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii'), im.size


def find_browser():
    for p in (r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
              r'C:\Program Files\Google\Chrome\Application\chrome.exe', r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'):
        if os.path.exists(p):
            return p
    return shutil.which('msedge') or shutil.which('chrome') or shutil.which('google-chrome') or shutil.which('chromium')


CAPTION = '''我做了个能装进手机的个人书架 📚

把笔记、书、PDF、小工具放进一个网页，就是一个书架：能搜、能读、能分类，不用注册，打开就能用。

✅ 一个阅读器看四种格式：HTML / Markdown / TXT / PDF，有目录、书签，读到哪里自动记住，还有五种阅读颜色
✅ 你自己的文件可以一次选很多个，分成“合集”，只存在你的浏览器里，不上传
✅ 订阅别人的博客：新文章出现在你自己的书架里，打开页面时更新
✅ 手机上装到主屏幕，没网也能再读；目录里往左一滑就能删除
✅ 还有个“公共目录”：只记标题和回原站的链接，投稿不用账号

想看带图的完整教程：搜“知树阅读 个人数字图书馆”，网站首页置顶的第一张卡片就是使用指南；想自己搭一个，里面也有安装部署的步骤。

#个人知识库 #读书笔记 #效率工具 #PDF阅读 #RSS订阅 #知识管理 #独立开发 #手机阅读
'''


def make_cards(out_dir, browser):
    os.makedirs(out_dir, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='cards-')
    made = []
    try:
        for n, (key, title, sub, items, media, kind) in enumerate(CARDS, 1):
            lis = ''.join('<li>%s</li>' % t for t in items)
            if kind == 'wide':
                m = '<div class="shot"><img src="%s"></div>' % data_uri(os.path.join(GUIDE, 'img', media), 1100)[0]
            elif kind == 'phones':
                m = '<div class="phones">%s</div>' % ''.join('<img src="%s">' % data_uri(os.path.join(GUIDE, 'img', f), 600)[0] for f in media)
            else:                                                        # the last card: the logo, centred in the empty half
                logo = os.path.join(ROOT, 'icons', 'zhishishu-icon.png')
                m = '<div class="logo"><img src="%s"></div>' % data_uri(logo, 520)[0] if os.path.exists(logo) else ''
            page = CARD_HTML % {'ul_top': 400, 'ph': 800, 'n': n, 'total': len(CARDS), 'title': title, 'sub': sub, 'items': lis, 'media': m}
            html_path = os.path.join(tmp, '%02d.html' % n)
            open(html_path, 'w', encoding='utf-8').write(page)
            png = os.path.join(out_dir, '%02d-%s.png' % (n, key))
            subprocess.run([browser, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1242,1760',
                            '--screenshot=' + png, 'file:///' + html_path.replace('\\', '/')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            if os.path.exists(png):
                im = Image.open(png).convert('RGB')
                im = im.crop((0, 0, 1242, 1660))                         # the window is a little taller than the card: headless browsers add a strip at the bottom
                im.save(png, optimize=True)
                made.append(png)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    open(os.path.join(out_dir, '文案.txt'), 'w', encoding='utf-8').write(CAPTION)
    return made


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(ROOT), 'my-archive-export'))
    ap.add_argument('--site', default=site_url())
    ap.add_argument('--no-cards', action='store_true')
    a = ap.parse_args()
    out, site = os.path.abspath(a.out), a.site
    if os.path.commonpath([out, ROOT]) == ROOT:
        sys.exit('The export must not go inside the project folder (it would be deployed): %s' % out)
    page = LH.parse(os.path.join(GUIDE, 'index.html')).getroot()
    os.makedirs(out, exist_ok=True)
    images = Images(os.path.join(out, 'images'))
    title = plain(page.find('.//title')).split('：')[0] or '知树阅读使用指南'
    for tab, label in TABS.items():
        panel = page.xpath('//section[@id="%s"]' % tab)[0]
        bs = blocks(panel)
        full = '知树阅读使用指南：' + label
        lead = '知树阅读是一个放笔记、书、PDF 和小工具的网页书架，不用注册，打开就能读。' if tab == 'usage' else '想自己搭一个这样的网站？这里是在自己电脑上用、部署上线、开通公共目录和审核页的完整步骤。'
        note = ('在线图文版：%s/notes/guide/（带“使用说明 / 安装部署”切换）' % site) if site else ''
        md = to_md(full, lead, bs, images, site, note)
        open(os.path.join(out, label + '.md'), 'w', encoding='utf-8', newline='\n').write(md)
        ok = to_docx(os.path.join(out, label + '.docx'), full, lead, bs, images, out, site, note)
        print('  %s: %s.md%s  (%d blocks)' % (label, label, ' + %s.docx' % label if ok else '', len(bs)))
    print('  images: %d in %s' % (len(images.map), os.path.join(out, 'images')))
    if not a.no_cards:
        browser = find_browser()
        if not browser:
            print('  (no Edge or Chrome found: no picture cards)')
        else:
            made = make_cards(os.path.join(out, 'xiaohongshu'), browser)
            print('  xiaohongshu: %d cards + 文案.txt' % len(made))
    print('done ->', out)


if __name__ == '__main__':
    main()
