"""The services the demo page talks to, on 127.0.0.1:8840: /api/feed (the update service) and /api/sync (the sync service over an in-memory store).
GET /__peek  -> what the sync store holds (keys, sizes) and how many requests came; POST /__quota?n=  -> the vault quota (characters); POST /__reset -> forget everything;
POST /__expire -> forget the vaults (as if they had expired) but keep the poll."""
import json
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs

sys.path.insert(0, os.environ.get('SHELF_DIRECTORY', r'E:\Ztree\shelf-directory'))
import aggregate as agg  # noqa: E402
import feedapi  # noqa: E402
import syncapi  # noqa: E402
import statapi  # noqa: E402
import hotapi  # noqa: E402
import hotdetail  # noqa: E402
import listen  # noqa: E402

agg.ALLOW_LOCAL = True
ENV = {'ALLOW_LOCAL_ORIGIN': '1', 'IP_SALT': 'dev'}
STORE = syncapi.MemoryStore()
COUNT = {'sync': 0, 'actions': {}}
LOCK = threading.Lock()
for k in syncapi.LIMITS:                                                # the tests run from one address: no rate limits here
    syncapi.LIMITS[k] = (10**6, syncapi.LIMITS[k][1])
syncapi.CREATE_LIMIT = (10**6, 86400)
for k in feedapi.LIMITS:
    feedapi.LIMITS[k] = (10**6, feedapi.LIMITS[k][1])
STAT_STORE = syncapi.MemoryStore()                                      # the anonymous counters (a store of their own: /__peek only knows the sync keys)
LISTEN = {'mode': 'ok', 'asked': 0, 'log': [], 'delay': 0, 'fail': set()}
POD = 'http://127.0.0.1:' + os.environ.get('E2E_POD_PORT', '8843')
WORDS = ['Delta', 'Alpha', 'Echo', 'Charlie', 'Bravo', 'Foxtrot', 'Hotel', 'Golf', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'Xray', 'Yankee', 'Zulu']


def listen_index(mode, lang='zh'):
    """The lists of the day as /api/listen says them (what comes first follows the reader's language)."""
    g = lambda i, zh, en, kind, n=0, net='cn', typ='music', lg='': {'id': i, 'name': zh, 'name_en': en, 'kind': kind, 'type': typ, 'net': net, **({'n': n} if n else {}), **({'lang': lg} if lg else {})}
    groups = [g('daily', '每日推荐', 'Daily picks', 'daily'), g('hot-cn', '华语热歌', 'Chinese hits', 'chart', 0, 'cn', 'music', 'zh'), g('hot-west', '欧美热歌', 'Western hits', 'chart', 0, 'cn', 'music', 'en'), g('kr', '韩流', 'Korea', 'chart'),
              g('dzp-3155776842', 'Deezer 全球 Top 100', 'Deezer Top Worldwide', 'list', 100), g('dzp-1313621735', 'Deezer 美国 Top 100', 'Deezer Top USA', 'list', 100, 'cn', 'music', 'en'),
              g('dzp-1111142221', 'Deezer 英国 Top 100', 'Deezer Top UK', 'list', 100, 'cn', 'music', 'en'), g('dzp-7001', 'bedroom rave', 'bedroom rave', 'list', 50), g('dzp-7002', 'Techno Tunnel', 'Techno Tunnel', 'list', 100),
              g('aup-PLaaa', 'Hot & New', 'Hot & New', 'list', 20),
              g('rock', '摇滚', 'Rock', 'style'), g('hiphop', '说唱', 'Hip-hop & rap', 'style'), g('classical', '古典', 'Classical', 'style'), g('chill', '放松', 'Chill', 'style'),
              g('video', '音乐视频', 'Music videos', 'style', 0, 'global'),
              g('pod-hot', '热门播客', 'Top podcasts', 'chart', 0, 'cn', 'podcast', '*'), g('pod-cn', '中国大陆播客榜', 'Podcasts · mainland China', 'chart', 0, 'cn', 'podcast', 'zh'), g('pod-us', '美国播客榜', 'Podcasts · US', 'chart', 0, 'cn', 'podcast', 'en'),
              g('pc-news', '新闻', 'News', 'style', 0, 'cn', 'podcast'), g('pc-story', '故事', 'Stories', 'style', 0, 'cn', 'podcast'), g('pc-english', '英语学习', 'Learn English', 'style', 0, 'cn', 'podcast'), g('pc-business', '商业', 'Business', 'style', 0, 'cn', 'podcast')]
    if mode == 'junk':
        groups = [{'id': 'bad id!', 'name': 'x', 'name_en': 'x', 'kind': 'style'}, {'id': 'weird-1', 'name': '怪', 'name_en': 'w', 'kind': 'weird'}, 'junk', None, {'id': 'no-name', 'name': '', 'kind': 'style'},
                  g('good', '好的', 'Good', 'style'), g('good2', '也好', 'Good too', 'chart'), g('goodpod', '好播客', 'Good pod', 'chart', 0, 'cn', 'podcast')]
    order = {'daily': 0, 'chart': 1, 'list': 2, 'style': 3}
    groups = sorted([x for x in groups if isinstance(x, dict)] if mode != 'junk' else groups, key=lambda x: (order.get(x['kind'], 9), 0 if x.get('lang') in (lang, '*') else 1 if not x.get('lang') else 2) if isinstance(x, dict) else (9, 9)) if mode != 'junk' else groups
    return {'ok': True, 'date': '2026-10-28', 'updated': 0, 'lang': lang, 'groups': groups}


def listen_group(gid, mode, lang='zh'):
    """The songs of one list as /api/listen?g=ID says them (made-up songs; the sounds are the fake podcast's tones, so they really play); None for a list there is not."""
    ids = [x['id'] for x in listen_index('ok')['groups'] if isinstance(x, dict)]
    if mode == 'junk' and gid in ('good', 'good2', 'goodpod'):
        return {'id': gid, 'name': '好的', 'name_en': 'Good', 'kind': 'style', 'type': 'podcast' if gid == 'goodpod' else 'music', 'sub': '来源：Test', 'sub_en': 'From Test', 'items': [
            {'id': 'x1', 'title': '<img src=x onerror=alert(1)>', 'artist': '<b>a</b>', 'cover': 'http://insecure.example/c.jpg', 'dur': 30, 'mode': 'stream', 'audio': POD + '/ep1.wav', 'url': 'javascript:alert(2)', 'lic': '', 'from': 'x', 'date': 'not a date', 'show': 'x' * 40},
            {'id': 'x2', 'title': 'bad sound', 'mode': 'stream', 'audio': 'javascript:alert(3)', 'url': 'https://example.org/'}, {'id': 'x3', 'title': 'bad mode', 'mode': 'script', 'audio': POD + '/ep1.wav'},
            {'id': '', 'title': 'no id', 'mode': 'embed', 'url': 'https://music.163.com/#/song?id=1'}, 'junk', None]}
    if gid not in ids:
        return None
    x = next(y for y in listen_index('ok')['groups'] if y['id'] == gid)
    kind, podcast = x['kind'], x['type'] == 'podcast'
    n = 200 if gid in ('rock', 'pod-hot', 'pc-news') else {'daily': 100, 'hot-cn': 90, 'hot-west': 40, 'kr': 24, 'chill': 18, 'video': 6, 'aup-PLaaa': 20, 'dzp-7001': 50}.get(gid, 100 if kind == 'list' else 40)
    sounds = ['/ep1.wav', '/ep2.wav', '/ep3.wav']
    tag = '%s-%s' % (gid, lang) if podcast or gid == 'daily' else gid                       # (the daily picks and the podcasts of the reader's language are other songs)
    frms = {'daily': ['Deezer', 'Audius', 'Apple Music'], 'hot-cn': ['Apple Music'], 'hot-west': ['Deezer', 'Apple Music'], 'kr': ['Apple Music'], 'rock': ['Deezer', 'Audius', 'Apple Music'], 'chill': ['Audius', 'Apple Music']}.get(gid, ['Deezer'] if kind == 'list' and gid.startswith('dzp') else ['Audius'] if kind == 'list' else ['Deezer', 'Audius'])
    items = []
    for i in range(n):
        if podcast:
            items.append({'id': 'pc:%s-%d' % (gid, i), 'title': 'Episode %d of %s' % (i, tag), 'artist': 'Show %d' % i, 'cover': ('https://img.example/p%d.jpg' % i) if i % 2 == 0 else '', 'dur': 1200 + (i * 53) % 1800, 'mode': 'stream', 'audio': POD + sounds[i % 3],
                          'url': 'https://podcasts.apple.com/us/podcast/x/id%d' % i, 'lic': '', 'from': 'Apple Podcasts', 'date': '2026-10-%02d' % (28 - (i * 7) % 20), 'show': str(1000 + i)})
            continue
        frm = frms[i % len(frms)]
        pv = frm in ('Deezer', 'Apple Music')
        it = {'id': '%s:%s-%d' % (frm[:2].lower(), gid, i), 'title': '%s %s %d' % (tag, WORDS[(i * 7) % 26], i), 'artist': 'Artist %s' % chr(65 + (i * 5) % 26), 'cover': ('https://img.example/%s%d.jpg' % (gid, i)) if i % 2 == 0 else '',
              'dur': 30 if pv else 150 + (i * 37) % 200, 'mode': 'stream', 'audio': POD + sounds[i % 3], 'url': 'https://%s.example/track/%d' % (frm[:2].lower(), i), 'lic': ('%s 30 秒试听' % frm) if pv else frm, 'from': frm}
        if pv:
            it['preview'] = True
        items.append(it)
    if gid == 'rock':
        items[3]['audio'] = POD + '/gone.mp3'                                  # a song whose sound is gone (404): the bar goes on to the next one
        items[3]['title'] = 'rock Gone Track'
    if gid == 'video':
        items = [{'id': 'yt:abcdefghi%02d' % i, 'title': 'Video %d' % i, 'artist': 'Channel %d' % i, 'cover': 'https://i.ytimg.com/vi/x/mq.jpg', 'dur': 0, 'mode': 'embed', 'url': 'https://www.youtube.com/watch?v=abcdefghi%02d' % i, 'from': 'YouTube', 'net': 'global'} for i in range(n)]
    names = list(dict.fromkeys(y['from'] for y in items))
    return {**{k: x[k] for k in ('id', 'name', 'name_en', 'kind', 'type', 'net')}, 'sub': '来源：' + ' · '.join(names), 'sub_en': 'From ' + ' · '.join(names), 'items': items}


HOT = {'down': False, 'fail': set(), 'delay': 0, 'asked': []}              # down: the hot-list service answers 503; fail: platforms whose list cannot be read; delay: ms before a list is answered; asked: the platforms asked for
NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']


REAL = {                                                                  # rows that look like the real ones (the pages of the "rich" tests): /__hot?real=1
    'bilibili': [{'title': '一个视频', 'url': 'https://www.bilibili.com/video/BV1VvHK6FEV5', 'heat': '播放 94.5 万', 'note': '阿狸', 'img': 'https://i0.hdslb.com/a.jpg', 'body': '视频的简介，足够长的一段文字，用来显示在播放窗里面。' * 2}],
    'weibo': [{'title': '姆巴佩事件', 'url': 'https://s.weibo.com/weibo?q=%23x%23', 'heat': '热度 1070 万', 'note': '爆'}, {'title': 'fail 的话题', 'url': 'https://s.weibo.com/weibo?q=%23f%23', 'heat': '热度 9 万'}],
    'zhihu': [{'title': '一个知乎问题', 'url': 'https://www.zhihu.com/question/2098356191105643056', 'heat': '2800 万热度', 'note': '3365 回答', 'body': '这是问题的摘录，大概有一两句话的长度，用来显示在卡片里面。', 'img': 'https://picx.zhimg.com/a.jpg'}],
    'v2ex': [{'title': '停电了', 'url': 'https://www.v2ex.com/t/1252074', 'heat': '回复 149', 'note': '生活', 'body': '昨天早上'}],
    'github': [{'title': 'o/r', 'url': 'https://github.com/o/r', 'heat': '今日 +1,500 ★', 'note': 'Rust · A tool', 'body': 'A tool'}],
    'netease': [{'title': '季候风 — 王菲', 'url': 'https://music.163.com/#/song?id=300591', 'note': '执迷不悔', 'img': 'https://p2.music.126.net/a.jpg'}],
    'apple_pod_cn': [{'title': '声动早咖啡', 'url': 'https://podcasts.apple.com/cn/podcast/x/id1573189055', 'note': '声动活泼 · 商务', 'img': 'https://is1.example/a.jpg'}],
    'steam': [{'title': '影之刃零', 'url': 'https://store.steampowered.com/app/4115450/', 'heat': '¥268'}],
}
DETAIL_ASKED = []
_https0 = hotdetail._https
hotdetail._https = lambda u: u if str(u).startswith('http://127.0.0.1') else _https0(u)


def fake_get(url, accept='*/*', limit=0, headers=None):
    DETAIL_ASKED.append(url)
    if url.startswith('https://www.v2ex.com/api/topics/show.json'):
        body = json.dumps([{'id': 1252074, 'title': '停电了', 'content': 'x', 'replies': 2, 'member': {'username': 'alice'}, 'node': {'title': '生活'}, 'content_rendered': '<p>昨天早上停电，没有提前通知。</p>'}])
    elif url.startswith('https://www.v2ex.com/api/replies/show.json'):
        body = json.dumps([{'member': {'username': 'bob'}, 'content_rendered': '<p>第一条回复的内容</p>'}])
    elif url.startswith('https://raw.githubusercontent.com/o/r/HEAD/README.md'):
        body = '# Hello repo\n\nA short readme.\n\n![pic](https://img.example/a.png)\n\n[docs](docs/x.md)\n'
    elif url.startswith('https://news-at.zhihu.com/api/4/news/'):
        body = json.dumps({'title': '日报的一篇', 'image': 'https://pic.zhimg.com/x.jpg', 'body': '<div class="answer"><p>日报的正文。</p></div>'})
    elif url.startswith('https://www.bing.com/news/search'):
        if 'fail' in url:
            raise agg.Refused('现在连不上', 'down', 500)
        item = lambda t, u, s: '<item><title>%s</title><link>http://www.bing.com/news/apiclick.aspx?url=%s&amp;c=1</link><description>%s的一句摘要</description><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><News:Source xmlns:News="x">%s</News:Source></item>' % (t, u, t, s)
        body = ('<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>x</title>' + item('第一篇相关报道', 'http%3a%2f%2f127.0.0.1%3a8850%2fa%2f1', '来源甲')
                + item('第二篇相关报道', 'http%3a%2f%2f127.0.0.1%3a8850%2fa%2f2', '来源乙') + '</channel></rss>')
    else:
        raise agg.Refused('没有', 'no', 404)
    return url, {'content-type': 'text/plain; charset=utf-8'}, body.encode('utf-8')


hotdetail._get = fake_get
hotdetail.DETAILS = [(rx, (lambda m: {'kind': 'podcast', 'title': 'English Learning Show', 'feed': 'http://127.0.0.1:8843/feed.xml', 'image': '', 'content': '', 'meta': 'Tester · 商务 · 4 集'}) if 'podcasts' in rx.pattern else fn)
                     for rx, fn in hotdetail.DETAILS]


def fake_entries(pid, now=None, env=None, region=''):
    HOT['asked'].append(pid + (':' + region if region else ''))
    if HOT.get('real') and pid in REAL:
        return [hotapi._norm(r) for r in REAL[pid]], time.time() - 120
    if HOT['delay']:
        time.sleep(HOT['delay'] / 1000)
    if pid in HOT['fail']:
        raise agg.Refused('网站返回了错误（HTTP 500）', 'The site answered with HTTP 500')
    spec = hotapi.platforms(env)[pid]
    heat = ['1.2 万', '9000', '800'] + [''] * 9
    rows = [{'title': '项目 %s%s %s' % (pid, (' ' + region) if region else '', NUMS[i]), 'url': 'https://example.org/%s/%d' % (pid, i + 1), 'heat': heat[i], 'note': ('说明 %s' % pid) if i == 0 else '',
             'alt': ('https://example.org/%s/talk' % pid) if i == 0 and pid in ('hackernews', 'lobsters') else '', 'date': '' if spec['ranked'] else '2026-10-26'} for i in range(12)]
    return rows, time.time() - 120


hotapi.entries = fake_entries
STAT = {'off': False, 'log': []}                                        # off: answer "not configured"; log: what the page posted
ENV['STAT_DAILY_EVENTS'] = '5000'
CHECKS = []                                                             # the "check" requests (they create nothing)
SUBMITS = []                                                            # what the page sent to the (fake) submission service
SUBMIT = {'limit': None}                                                # accepted per "day"; None: no limit
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8840


class H(BaseHTTPRequestHandler):
    def route(self, method):
        p = urlsplit(self.path)
        if p.path == '/api/feed':
            return feedapi.respond(self, ENV, method)
        if p.path == '/api/submit':                                          # a stand-in for the submission service: addresses with "listed" / "pending" in them are answered like the real one
            if method == 'OPTIONS':
                self.send_response(204)
                self.cors()
                self.end_headers()
                return
            n = int(self.headers.get('Content-Length') or 0)
            try:
                payload = json.loads(self.rfile.read(n) or b'{}')
            except ValueError:
                payload = {}
            url = str(payload.get('url') or '')
            if payload.get('kind') == 'check':                                    # "check": what the bot would make of the address (nothing is created)
                CHECKS.append(payload)
                if payload.get('what') == 'url':
                    repo = 'github.com' in url
                    return self.reply(200, {'ok': True, 'result': {'what': 'url', 'kind': 'repo' if repo else 'feed', 'kind_zh': 'GitHub 仓库书架' if repo else '订阅源书架（整个网站 / 博客 / 频道）', 'kind_en': 'GitHub repository shelf' if repo else 'Feed shelf (a whole site, blog or channel)',
                                                          'name': '测试站', 'source': url, 'found': 3, 'lang': 'zh', 'description': '', 'license': '', 'tags': [], 'latest': [], 'warnings': [], 'unread': False}})
                return self.reply(400, {'ok': False, 'error': 'x', 'message': 'x', 'message_en': 'x'})
            SUBMITS.append(payload)
            if payload.get('rights') is not True:
                return self.reply(400, {'ok': False, 'error': 'rights', 'message': '请勾选“我有权发布这些内容”', 'message_en': 'Please confirm the rights'})
            if 'listed' in url:
                return self.reply(409, {'ok': False, 'error': 'listed', 'message': '这个网址已经在目录里了', 'message_en': 'This address is in the directory already'})
            if 'pending' in url:
                return self.reply(409, {'ok': False, 'error': 'pending', 'message': '这个网址已经提交过了，正在审核', 'message_en': 'This address is waiting for review already'})
            accepted = sum(1 for x in SUBMITS[:-1] if x.get('_ok'))
            if SUBMIT['limit'] is not None and accepted >= SUBMIT['limit']:
                SUBMITS[-1]['_rate'] = True
                return self.reply(429, {'ok': False, 'error': 'rate', 'message': '今天提交得太多了，请明天再试', 'message_en': 'Too many submissions today; please try again tomorrow'})
            SUBMITS[-1]['_ok'] = True
            return self.reply(200, {'ok': True, 'status': 'queued', 'kind': 'feed'})
        if p.path == '/api/listen':                                           # today's listening: /__listen?mode=ok|down|junk|empty&delay=ms&fail=ID
            q = parse_qs(p.query)
            gid = (q.get('g') or [''])[0]
            if 'HeadlessChrome' in (self.headers.get('User-Agent') or ''):         # (only the test browser is counted: a page the user has open on the same rig does not disturb the tests)
                LISTEN['asked'] += 1
                LISTEN['log'].append(gid + ('@en' if (q.get('lang') or [''])[0].startswith('en') else ''))
            if LISTEN['mode'] == 'down':
                return self.reply(503, {'ok': False, 'error': 'down'})
            if LISTEN['delay']:
                time.sleep(LISTEN['delay'] / 1000)
            if LISTEN['mode'] in ('real', 'real0'):                                # the real service on the real sources (real0: without the direct play of NetEase)
                env = {k: v for k, v in os.environ.items() if k in ('JAMENDO_CLIENT_ID', 'YOUTUBE_API_KEY', 'YOUTUBE_REGION')}
                if LISTEN['mode'] == 'real':
                    env['LISTEN_NETEASE_DIRECT'] = '1'
                status, ctype, body, cache = listen.handle(q, env)
                self.send_response(status)
                self.send_header('Content-Type', ctype)
                self.cors()
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            lang = 'en' if (q.get('lang') or [''])[0].startswith('en') else 'zh'
            if not gid:
                return self.reply(200, listen_index(LISTEN['mode'], lang))
            if LISTEN['mode'] == 'empty' or gid in LISTEN['fail']:
                return self.reply(502, {'ok': False, 'error': 'empty', 'message': '这个榜单现在读不到', 'message_en': 'This list cannot be read right now'})
            g = listen_group(gid, LISTEN['mode'], lang)
            if g is None:
                return self.reply(404, {'ok': False, 'error': 'none', 'message': '没有这个榜单', 'message_en': 'No such list'})
            return self.reply(200, {'ok': True, 'date': '2026-10-28', 'updated': 0, 'group': g})
        if p.path == '/__listen':
            q = parse_qs(p.query)
            LISTEN['mode'] = q.get('mode', ['ok'])[0]
            LISTEN['delay'] = int(q.get('delay', ['0'])[0] or 0)
            LISTEN['fail'] = {x for x in q.get('fail', [''])[0].split(',') if x}
            if q.get('reset'):
                LISTEN['asked'] = 0
                LISTEN['log'].clear()
            return self.json({'ok': True})
        if p.path == '/__listen_asked':
            return self.json(LISTEN['asked'])
        if p.path == '/__listen_log':
            return self.json(LISTEN['log'])
        if p.path == '/api/hot':
            if HOT['down']:
                return self.reply(503, {'ok': False, 'error': 'down'})
            return hotapi.respond(self, ENV, method)
        if p.path == '/__hot':                                               # ?enable=a,b  &disable=a,b  &down=1  &fail=a,b  &delay=500  &key=KEY (the YouTube key)  &reset=1 (forget what was asked)
            q = parse_qs(p.query)
            ENV['HOT_ENABLE'] = q.get('enable', [''])[0]
            ENV['HOT_DISABLE'] = q.get('disable', [''])[0]
            if q.get('key', [''])[0]:
                ENV['YOUTUBE_API_KEY'] = q['key'][0]
            else:
                ENV.pop('YOUTUBE_API_KEY', None)
            HOT['down'] = q.get('down', ['0'])[0] == '1'
            HOT['fail'] = {x for x in q.get('fail', [''])[0].split(',') if x}
            HOT['delay'] = int(q.get('delay', ['0'])[0] or 0)
            HOT['real'] = q.get('real', ['0'])[0] == '1'
            DETAIL_ASKED.clear()
            if q.get('reset'):
                HOT['asked'].clear()
            return self.json({'ok': True})
        if p.path == '/__hot_asked':
            return self.json(HOT['asked'])
        if p.path == '/__detail_asked':
            return self.json(DETAIL_ASKED)
        if p.path == '/api/stat':
            if method == 'POST':
                n = int(self.headers.get('Content-Length') or 0)
                raw = self.rfile.read(n)
                STAT['log'].append({'body': raw.decode('utf-8', 'replace'), 'dnt': self.headers.get('DNT') or '', 'cookie': self.headers.get('Cookie') or '', 'cred': self.headers.get('Authorization') or ''})
                self.rfile = __import__('io').BytesIO(raw)
            return statapi.respond(self, ENV, method, None if STAT['off'] else STAT_STORE)
        if p.path == '/__stat_reset':
            STAT_STORE.d.clear()
            STAT_STORE.exp.clear()
            STAT['log'].clear()
            STAT['off'] = parse_qs(p.query).get('off', ['0'])[0] == '1'
            return self.json({'ok': True})
        if p.path == '/__stat_log':
            return self.json(STAT['log'])
        if p.path == '/__stat_seed':                                         # ?d=[{"t":"open","k":"item","id":"x","n":12}]: n readers, each does it once
            for i, row in enumerate(json.loads(parse_qs(p.query)['d'][0])):
                for r in range(int(row.get('n', 1))):
                    statapi.count(STAT_STORE, {'events': [{'t': row['t'], 'k': row['k'], 'id': row['id']}]}, '10.%d.%d.%d' % (i, r // 250, r % 250), ENV)
            return self.json({'ok': True})
        if p.path == '/__submits':
            return self.json(SUBMITS)
        if p.path == '/__submit_reset':
            SUBMITS.clear()
            q = parse_qs(p.query).get('limit')
            SUBMIT['limit'] = int(q[0]) if q else None
            return self.json({'ok': True})
        if p.path == '/api/sync':
            if method == 'POST':
                n = int(self.headers.get('Content-Length') or 0)
                raw = self.rfile.read(n)
                try:
                    act = json.loads(raw).get('action')
                except ValueError:
                    act = '?'
                with LOCK:
                    COUNT['sync'] += 1
                    COUNT['actions'][act] = COUNT['actions'].get(act, 0) + 1
                self.rfile = __import__('io').BytesIO(raw)           # (respond() reads the body itself)
            return syncapi.respond(self, ENV, method, STORE)
        if p.path == '/__peek':
            dump = {k: (len(v) if isinstance(v, str) else {f: len(x) for f, x in v.items()}) for k, v in STORE.d.items()}
            return self.json({'keys': dump, 'count': COUNT, 'raw': json.dumps(STORE.d)})
        if p.path == '/__quota':
            ENV['SYNC_QUOTA'] = parse_qs(p.query)['n'][0]
            return self.json(ENV)
        if p.path == '/__reset':
            STORE.d.clear()
            STORE.exp.clear()
            COUNT['sync'], COUNT['actions'] = 0, {}
            ENV.pop('SYNC_QUOTA', None)
            return self.json({'ok': True})
        if p.path == '/__expire':
            for k in [k for k in STORE.d if k.startswith('v:')]:
                STORE.d.pop(k, None)
                STORE.exp.pop(k, None)
            return self.json({'ok': True})
        if p.path == '/__count':
            return self.json(COUNT)
        self.send_response(404)
        self.end_headers()

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def reply(self, status, obj):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.cors()
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def json(self, obj):
        data = json.dumps(obj).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self): self.route('OPTIONS')
    def do_GET(self): self.route('GET')
    def do_POST(self): self.route('POST')
    def log_message(self, *a): pass


ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
