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
import translate  # noqa: E402
try:
    import translateapi  # noqa: E402
except ImportError:                                                       # (a directory without the translation service: the demo has no translate button)
    translateapi = None

agg.ALLOW_LOCAL = True
try:
    import bookapi
except ImportError:                                                       # (a directory without the shared copy of the books: the page reads them through /api/feed)
    bookapi = None
ENV = {'ALLOW_LOCAL_ORIGIN': '1', 'IP_SALT': 'dev'}
STORE = syncapi.MemoryStore()
COUNT = {'sync': 0, 'actions': {}}
LOCK = threading.Lock()
for k in syncapi.LIMITS:                                                # the tests run from one address: no rate limits here
    syncapi.LIMITS[k] = (10**6, syncapi.LIMITS[k][1])
syncapi.CREATE_LIMIT = (10**6, 86400)
for k in feedapi.LIMITS:
    feedapi.LIMITS[k] = (10**6, feedapi.LIMITS[k][1])
TRANS_STORE = syncapi.MemoryStore()                                     # the translation service: its counters and its cache
TRANS = {'mode': 'ok', 'calls': []}                                     # mode: ok | off (not set up) | limit (a reader's day is 1000 characters) | quota | fail
BOOK = {'mode': 'ok', 'asked': 0}                                    # mode: ok | down (the server answers 503) | junk (it answers something that is not JSON)
BOOK_STORE = syncapi.MemoryStore()                                      # the shared copy of the picked books' chapters: Redis (this) and PostgreSQL (below)


class BookDurable:
    """The long-term layer in a dict: what bookapi.Durable does in PostgreSQL."""
    rows = {}

    def get(self, b, c):
        return self.rows.get((b, c))

    def put(self, b, c, rec, license):
        self.rows[(b, c)] = rec
        return True


if bookapi and not os.environ.get('E2E_REAL_BOOKS'):                    # (E2E_REAL_BOOKS=1: the real list of the directory folder, read from the real sites: for looking at the real books, not for the tests)
    # the books of the tests: chapters on the fake site of read_site.py (http, 127.0.0.1:8850); "closed" may not be kept on a server
    _chs = {'s': '127.0.0.1:' + os.environ.get('E2E_READ_PORT', '8850'), 'p': 'Tale/', 'n': ['Chapter 1', 'Chapter 2', 'Chapter 3']}
    BOOKS = {'tale': {'id': 'tale', 'license': 'public-domain', 'keep': True, 'ch': _chs, 'source': 'fake.example'},
             'closed': {'id': 'closed', 'license': 'cc-by-nc', 'ch': _chs, 'source': 'fake.example'}}
    bookapi.catalog = lambda: BOOKS
    bookapi.chapter_url = lambda ch, name: 'http://%s/wiki/%s' % (ch['s'], __import__('urllib.parse').parse.quote((ch['p'] + name).replace(' ', '_'), safe="/:()',;!*~"))
STAT_STORE = syncapi.MemoryStore()                                      # the anonymous counters (a store of their own: /__peek only knows the sync keys)
LISTEN = {'mode': 'ok', 'asked': 0, 'log': [], 'delay': 0, 'fail': set(), 'extra': False, 'v2': False, 'rs': 'ok', 'search': 'ok', 'pool': 'ok', 'log2': []}      # extra: one more list, "fo-test", whose songs have several sounds each (/__listen?extra=1)
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
    if LISTEN['extra'] and mode != 'junk':
        groups.append(g('fo-test', '候选音源', 'Candidate sounds', 'list', 8))
    order = {'daily': 0, 'chart': 1, 'list': 2, 'style': 3}
    groups = sorted([x for x in groups if isinstance(x, dict)] if mode != 'junk' else groups, key=lambda x: (order.get(x['kind'], 9), 0 if x.get('lang') in (lang, '*') else 1 if not x.get('lang') else 2) if isinstance(x, dict) else (9, 9)) if mode != 'junk' else groups
    return {'ok': True, 'date': '2026-10-28', 'updated': 0, 'lang': lang, 'groups': groups}


# ---- the newer questions of /api/listen (B1: caps=resolve, search, resolve, pool): the fake service answers them from a fixed catalogue (/__listen?v2=1 turns them on; without it the service is the one of before)
REGION_OF = {'hot-cn': 'cn', 'hot-west': 'west', 'kr': 'jp-kr', 'dzp-1313621735': 'west', 'dzp-1111142221': 'west', 'dy-hot': 'cn', 'pod-cn': 'cn', 'pod-us': 'west'}
LRC = ('[00:00.50]First line of the song\n[00:03.00]Second line of the song\n[00:06.00]Third line of the song\n[00:09.00]Fourth line of the song')
SEARCH_SONGS = [   # title, artist, dur, how it sounds: 'whole' (a whole sound), 'preview' (a preview and a stub that resolve can fill), 'stub' (only a stub)
    ('Search Alpha', 'Singer A', 200, 'whole'), ('Search Beta', 'Singer B', 210, 'preview'), ('Search Gamma', 'Singer C', 190, 'stub'), ('Search Delta', 'Singer A', 205, 'whole'),
    ('Search Epsilon', 'Singer G', 195, 'both'), ('Search Nothing', 'Singer D', 180, 'stub'), ('Moon River', 'Singer E', 170, 'whole'), ('Moonlight', 'Singer F', 160, 'preview')]


def listen_index_v2(lang, region):
    groups = [dict(x) for x in listen_index('ok', lang)['groups']]
    groups.append({'id': 'dy-hot', 'name': '抖音热歌榜', 'name_en': 'Douyin hot songs', 'kind': 'chart', 'type': 'music', 'net': 'cn', 'lang': 'zh', 'resolve': True})
    for i, (gid, zh, en) in enumerate((('workout', '运动', 'Workout'), ('commute', '通勤', 'Commute'), ('study', '学习', 'Study'))):
        groups.append({'id': gid, 'name': zh, 'name_en': en, 'kind': 'scene', 'type': 'music', 'net': 'cn'})
    for x in groups:
        if x['id'] in ('chill', 'focus', 'sleep'):
            x['kind'] = 'scene'
        if x['type'] == 'music':
            x['region'] = REGION_OF.get(x['id'], 'global') if x['kind'] != 'daily' else x.get('region', 'global')
        if x['id'] == 'dzp-7001':
            x['cover'] = 'https://img.example/pl7001.jpg'
    order = {'daily': 0, 'chart': 1, 'list': 2, 'scene': 3, 'style': 4}
    rank = {'cn': {'cn': 0, 'jp-kr': 1, 'global': 2, 'west': 3}, 'global': {'west': 0, 'global': 1, 'jp-kr': 2, 'cn': 3}}[region]
    groups.sort(key=lambda x: (order.get(x['kind'], 9), rank.get(x.get('region', 'global'), 2), 0 if x.get('lang') in (lang, '*') else 1 if not x.get('lang') else 2))
    return {'ok': True, 'date': '2026-10-28', 'updated': 0, 'lang': lang, 'region': region, 'groups': groups}


def dy_group():
    items = [{'id': 'dy:%02d' % i, 'title': 'Douyin Song %d' % i, 'artist': 'DY Artist %d' % (i % 9), 'cover': ('https://img.example/dy%d.jpg' % i) if i % 3 == 0 else '', 'dur': 0, 'mode': 'stream', 'audio': '', 'url': '', 'lic': '',
              'from': '抖音热歌榜', 'hot': i + 1, 'resolve': True, 'cands': [], 'market': 'cn'} for i in range(40)]
    return {'id': 'dy-hot', 'name': '抖音热歌榜', 'name_en': 'Douyin hot songs', 'kind': 'chart', 'type': 'music', 'net': 'cn', 'region': 'cn', 'resolve': True, 'sub': '来源：抖音热歌榜', 'sub_en': 'From Douyin hot songs', 'items': items}


def search_items(q):
    c = lambda p, k, path=None, **ex: {'p': p, 'k': k, **({'audio': POD + path} if path else {}), 'net': ex.pop('net', 'any'), **ex}
    out = []
    for i, (title, artist, dur, how) in enumerate(SEARCH_SONGS):
        if q.lower() not in (title + ' ' + artist).lower():
            continue
        if how == 'whole':
            cs = [c('audius', 'full', '/ep1.wav', lic='Audius')]
        elif how == 'preview':
            cs = [c('deezer', 'preview', '/ep3.wav', lic='Deezer 30 秒试听')]
        elif how == 'both':                                                       # a preview at hand, and a source of China that says it has the whole song (no address yet)
            cs = [c('bodian', 'full', big=True, lyr=True, resolve=True, net='cn', lic='波点音乐'), c('deezer', 'preview', '/ep3.wav', lic='Deezer 30 秒试听')]
        else:
            cs = [c('bodian', 'full', big=True, lyr=True, resolve=True, net='cn', lic='波点音乐')]
        first = next((x for x in cs if x.get('audio')), None)
        it = {'id': 'sr:%02d' % i, 'title': title, 'artist': artist, 'cover': '', 'dur': dur, 'mode': 'stream', 'audio': first['audio'] if first else '', 'url': 'https://sr.example/track/%d' % i, 'lic': (first or {}).get('lic', ''), 'from': first['p'] if first else 'bodian', 'cands': cs}
        if first and first['k'] == 'preview':
            it['preview'] = True
        if not first:
            it['resolve'] = True
        out.append(it)
    return out


def pool_items(side):
    mk = ['cn', 'cn', 'cn', 'jp-kr', 'west'] if side == 'cn' else ['west', 'west', 'west', 'jp-kr', 'cn']
    tags = ['pop', 'rock', 'hiphop', 'electronic', 'jazz', 'folk', 'classical']
    out = []
    for i in range(120):
        m = mk[i % 5]
        out.append({'id': 'pool:%s%03d' % (side, i), 'title': 'Pool %s Song %d' % (m, i), 'artist': 'Pool Artist %s%d' % (m[:2].upper(), (i // 5) % 12), 'cover': '', 'dur': 180 + i % 40, 'rank': i % 50 + 1, 'market': m, 'tags': [tags[i % 7]], 'from': 'Test'})
    return out


def listen_group(gid, mode, lang='zh'):
    """The songs of one list as /api/listen?g=ID says them (made-up songs; the sounds are the fake podcast's tones, so they really play); None for a list there is not."""
    ids = [x['id'] for x in listen_index('ok')['groups'] if isinstance(x, dict)]
    if mode == 'junk' and gid in ('good', 'good2', 'goodpod'):
        return {'id': gid, 'name': '好的', 'name_en': 'Good', 'kind': 'style', 'type': 'podcast' if gid == 'goodpod' else 'music', 'sub': '来源：Test', 'sub_en': 'From Test', 'items': [
            {'id': 'x1', 'title': '<img src=x onerror=alert(1)>', 'artist': '<b>a</b>', 'cover': 'http://insecure.example/c.jpg', 'dur': 30, 'mode': 'stream', 'audio': POD + '/ep1.wav', 'url': 'javascript:alert(2)', 'lic': '', 'from': 'x', 'date': 'not a date', 'show': 'x' * 40},
            {'id': 'x2', 'title': 'bad sound', 'mode': 'stream', 'audio': 'javascript:alert(3)', 'url': 'https://example.org/'}, {'id': 'x3', 'title': 'bad mode', 'mode': 'script', 'audio': POD + '/ep1.wav'},
            {'id': '', 'title': 'no id', 'mode': 'embed', 'url': 'https://music.163.com/#/song?id=1'}, 'junk', None]}
    if gid == 'fo-test' and LISTEN['extra']:                                     # songs with several sounds: how the bar goes from one sound to the next (see s_music_failover)
        c = lambda p, k, path, **ex: {'p': p, 'k': k, 'audio': path if path.startswith('http') else POD + path, 'net': ex.pop('net', 'any'), **ex}
        rows = [('Bad first', 200, [c('netease', 'full', '/missing.mp3'), c('audius', 'full', '/ep1.wav')]),                      # the first sound is gone (404): the second plays
                ('Hangs first', 200, [c('bodian', 'full', 'http://127.0.0.1:%s/__hang.wav' % PORT), c('audius', 'full', '/ep2.wav')]),   # the first sound never answers: after a few seconds the second plays
                ('Wrong length', 3000, [c('netease', 'full', '/ep1.wav'), c('audius', 'full', '/ep2.wav')]),                           # the first sound is a few seconds long, the song 50 minutes: the second is tried
                ('Preview then whole', 6, [c('apple', 'preview', '/ep1.wav'), c('audius', 'full', '/ep3.wav')]),                        # a whole sound is tried before a preview (ep3 is 6 seconds long: the length of the song)
                ('Big and small', 12, [c('bodian', 'full', '/ep1.wav', big=True, size=30000000), c('audius', 'full', '/ep2.wav')]),     # on mobile data the small one (ep1 is 12 seconds long)
                ('Only big', 200, [c('bodian', 'full', '/ep3.wav', big=True, size=30000000)]),                                           # on mobile data it is asked for
                ('Only bad', 12, [c('netease', 'full', '/missing2.mp3')]),                                                             # nothing plays: on to the next song
                ('Last one', 200, [c('audius', 'full', '/ep1.wav')])]
        items = [{'id': 'fo:%d' % i, 'title': 'fo %s' % name, 'artist': 'Artist F%d' % i, 'cover': '', 'dur': dur, 'mode': 'stream', 'audio': cs[0]['audio'], 'url': 'https://fo.example/track/%d' % i, 'lic': '', 'from': 'Test', 'cands': cs} for i, (name, dur, cs) in enumerate(rows)]
        return {'id': gid, 'name': '候选音源', 'name_en': 'Candidate sounds', 'kind': 'list', 'type': 'music', 'net': 'cn', 'sub': '来源：Test', 'sub_en': 'From Test', 'items': items}
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


HOT = {'down': False, 'fail': set(), 'delay': 0, 'asked': [], 'events': 'ok'}  # events: ok | empty | fail; deterministic event-response control for the browser tests
ANALYTICS = {'enabled': True, 'events': []}
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


def fake_entries(pid, now=None, env=None, region='', timeout=None, period='day'):
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
FEEDBACK = {'on': True, 'mode': 'ok', 'log': []}                        # the fake feedback service: set up or not, how it answers, what the page sent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8840


class H(BaseHTTPRequestHandler):
    def route(self, method):
        p = urlsplit(self.path)
        if p.path == '/api/analytics/config' and method == 'GET':
            if not ANALYTICS['enabled']:
                return self.reply(200, {'ok': True, 'experiment': {'id': 'hot-layout-v1', 'status': 'off', 'allocation': {}, 'variants': []}})
            return self.reply(200, {'ok': True, 'experiment': {'id': 'hot-layout-v1', 'status': 'active', 'allocation': {'control': 50, 'treatment': 50}, 'variants': [{'id': 'control', 'label': 'Cards'}, {'id': 'treatment', 'label': 'Compact'}]}})
        if p.path == '/api/analytics/events':
            if method == 'OPTIONS':
                self.send_response(204); self.cors(); self.end_headers(); return
            if method != 'POST': return self.reply(405, {'ok': False, 'error': 'method'})
            try: payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
            except (ValueError, TypeError): payload = {}
            events = payload.get('events', []) if isinstance(payload, dict) else []
            if isinstance(events, list): ANALYTICS['events'].extend(x for x in events if isinstance(x, dict))
            return self.reply(200, {'ok': True, 'accepted': len(events) if isinstance(events, list) else 0})
        if p.path == '/__analytics':
            q = parse_qs(p.query)
            if q.get('reset'): ANALYTICS['events'].clear()
            if 'enabled' in q: ANALYTICS['enabled'] = q['enabled'][0] != '0'
            return self.json({'ok': True, 'enabled': ANALYTICS['enabled']})
        if p.path == '/__analytics_events': return self.json(ANALYTICS['events'])
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
        if p.path == '/api/feedback':                                         # a stand-in for the feedback service (the real one is tested in shelf-directory): GET says whether it is set up, POST keeps what the page sent
            if method == 'OPTIONS':
                self.send_response(204)
                self.cors()
                self.end_headers()
                return
            if method == 'GET':
                return self.reply(200, {'ok': True, 'service': 'shelf-feedback', 'configured': FEEDBACK['on']})
            n = int(self.headers.get('Content-Length') or 0)
            try:
                payload = json.loads(self.rfile.read(n) or b'{}')
            except ValueError:
                payload = {}
            FEEDBACK['log'].append(payload)
            if FEEDBACK['mode'] == 'rate':
                return self.reply(429, {'ok': False, 'error': 'rate', 'message': '今天发得够多了，明天再来', 'message_en': 'That is enough for today; come back tomorrow'})
            if FEEDBACK['mode'] == 'bad':
                return self.reply(400, {'ok': False, 'error': 'request', 'message': '请求格式不对（内容不能为空，最多 1000 字）', 'message_en': 'Bad request (write something; at most 1000 characters)'})
            if FEEDBACK['mode'] == 'down':
                return self.reply(503, {'ok': False, 'error': 'storage', 'message': '反馈服务暂时不可用', 'message_en': 'Feedback is unavailable for the moment'})
            return self.reply(200, {'ok': True})
        if p.path == '/__fb':                                                 # ?on=0|1&mode=ok|rate|bad|down ; /__fb?reset=1 forgets what was sent
            q = parse_qs(p.query)
            if q.get('reset'):
                FEEDBACK['log'].clear()
            if q.get('on'):
                FEEDBACK['on'] = q['on'][0] == '1'
            if q.get('mode'):
                FEEDBACK['mode'] = q['mode'][0]
            return self.json({'on': FEEDBACK['on'], 'mode': FEEDBACK['mode'], 'log': FEEDBACK['log']})
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
            if LISTEN['v2'] and LISTEN['mode'] == 'ok':
                caps = (q.get('caps') or [''])[0].split(',')
                region = (q.get('region') or [''])[0]
                region = region if region in ('cn', 'global') else ('cn' if lang == 'zh' else 'global')
                UA = 'HeadlessChrome' in (self.headers.get('User-Agent') or '')
                if (q.get('search') or [''])[0]:
                    word = (q.get('search') or [''])[0]
                    if UA:
                        LISTEN['log2'].append('search:' + word)
                    if LISTEN['search'] == 'down':
                        return self.reply(503, {'ok': False, 'error': 'down'})
                    if LISTEN['search'] == 'slow':
                        time.sleep(1.2)
                    items = [] if LISTEN['search'] == 'empty' else search_items(word)
                    return self.reply(200, {'ok': True, 'q': word, 'items': items, **({'partial': True} if LISTEN['search'] == 'partial' else {})})
                if (q.get('resolve') or [''])[0]:
                    title = (q.get('t') or [''])[0]
                    if UA:
                        LISTEN['log2'].append('resolve:' + title)
                    if LISTEN['rs'] == 'down':
                        return self.reply(503, {'ok': False, 'error': 'down'})
                    if LISTEN['rs'] == 'slow':
                        time.sleep(1.5)
                    if LISTEN['rs'] == 'none' or 'Nothing' in title:
                        return self.reply(200, {'ok': True, 'id': (q.get('id') or [''])[0], 'ttl': 60, 'cands': []})
                    cand = {'p': 'bodian', 'k': 'full', 'audio': POD + '/ep1.wav', 'net': 'cn', 'lyr': True, 'lic': '波点音乐'}
                    if LISTEN['rs'] == 'big':
                        cand.update(big=True, size=31457280)
                    if LISTEN['rs'] == 'short':
                        cand['ttl_test'] = True
                    body = {'ok': True, 'id': (q.get('id') or [''])[0], 'ttl': 2 if LISTEN['rs'] == 'short' else 600, 'cands': [cand]}
                    if LISTEN['rs'] != 'nolyr':
                        body['lyrics'] = {'fmt': 'lrc', 'text': LRC, 'from': '波点音乐'}
                    return self.reply(200, body)
                if (q.get('pool') or [''])[0]:
                    side = (q.get('pool') or [''])[0]
                    if UA:
                        LISTEN['log2'].append('pool:' + side)
                    if LISTEN['pool'] == 'down':
                        return self.reply(503, {'ok': False, 'error': 'down'})
                    return self.reply(200, {'ok': True, 'updated': 0, **({'stale': True} if LISTEN['pool'] == 'stale' else {}), 'items': pool_items(side) if side in ('cn', 'global') else []})
                if 'resolve' in caps:
                    if not gid:
                        if UA:
                            LISTEN['log2'].append('index:' + region)
                        return self.reply(200, listen_index_v2(lang, region))
                    if gid == 'dy-hot':
                        return self.reply(200, {'ok': True, 'date': '2026-10-28', 'updated': 0, 'group': dy_group()})
            if not gid:
                return self.reply(200, listen_index(LISTEN['mode'], lang))
            if LISTEN['mode'] == 'empty' or gid in LISTEN['fail']:
                return self.reply(502, {'ok': False, 'error': 'empty', 'message': '这个榜单现在读不到', 'message_en': 'This list cannot be read right now'})
            g = listen_group(gid, LISTEN['mode'], lang)
            if g is None:
                return self.reply(404, {'ok': False, 'error': 'none', 'message': '没有这个榜单', 'message_en': 'No such list'})
            return self.reply(200, {'ok': True, 'date': '2026-10-28', 'updated': 0, 'group': g})
        if p.path == '/__hang.wav':                                           # a sound that never comes: the bar gives it up after a few seconds
            time.sleep(40)
            return
        if p.path == '/__listen':
            q = parse_qs(p.query)
            LISTEN['extra'] = q.get('extra', [''])[0] == '1'
            LISTEN['mode'] = q.get('mode', ['ok'])[0]
            LISTEN['delay'] = int(q.get('delay', ['0'])[0] or 0)
            LISTEN['fail'] = {x for x in q.get('fail', [''])[0].split(',') if x}
            LISTEN['v2'] = q.get('v2', [''])[0] == '1'                      # the newer questions (caps=resolve, search, resolve, pool)
            LISTEN['rs'] = q.get('rs', ['ok'])[0]                           # resolve: ok | none | down | big | slow | nolyr | short (an address that is good for 2 seconds)
            LISTEN['search'] = q.get('search', ['ok'])[0]                    # search: ok | partial | down | empty | slow
            LISTEN['pool'] = q.get('pool', ['ok'])[0]                       # pool: ok | stale | down
            if q.get('reset'):
                LISTEN['asked'] = 0
                LISTEN['log'].clear()
                LISTEN['log2'].clear()
            return self.json({'ok': True})
        if p.path == '/__listen_log2':
            return self.json(LISTEN['log2'])
        if p.path == '/__listen_asked':
            return self.json(LISTEN['asked'])
        if p.path == '/__listen_log':
            return self.json(LISTEN['log'])
        if p.path == '/api/hot/events':
            if HOT['down'] or HOT['events'] == 'fail':
                return self.reply(503, {'ok': False, 'error': 'events_down'})
            if HOT['delay']:
                time.sleep(HOT['delay'] / 1000)
            if HOT['events'] == 'empty':
                return self.reply(200, {'ok': True, 'updated': int(time.time()), 'events': []})
            lang = parse_qs(p.query).get('lang', ['zh'])[0]
            now = int(time.time())
            events = [
                {'id': 'iran-israel', 'title': '伊以局势持续发展' if lang != 'en' else 'Iran–Israel tensions continue', 'category': 'world', 'last_updated': now - 90, 'source_count': 3, 'trend': 'rising', 'items': [
                    {'title': '外交与安全局势最新进展', 'url': 'https://example.org/world/iran-israel', 'source': 'Example World Desk', 'published_at': now - 120, 'excerpt': '多家来源持续更新相关报道，事件仍在发展中。'},
                    {'title': 'Regional situation update', 'url': 'https://example.net/world/iran-israel', 'source': 'Example Global News', 'published_at': now - 240, 'excerpt': 'A second source reports new developments.'}]},
                {'id': 'ai-news', 'title': 'AI 模型与产品更新' if lang != 'en' else 'New AI model and product updates', 'category': 'ai', 'last_updated': now - 300, 'source_count': 2, 'trend': 'steady', 'items': [
                    {'title': '模型能力与产品发布动态', 'url': 'https://example.org/technology/ai-update', 'source': 'Example Tech', 'published_at': now - 360, 'excerpt': '官方发布与行业报道持续跟进。'}]}
            ]
            return self.reply(200, {'ok': True, 'updated': now, 'events': events})
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
            HOT['events'] = q.get('events', ['ok'])[0]
            DETAIL_ASKED.clear()
            if q.get('reset'):
                HOT['asked'].clear()
            return self.json({'ok': True})
        if p.path == '/__hot_asked':
            return self.json(HOT['asked'])
        if p.path == '/__detail_asked':
            return self.json(DETAIL_ASKED)
        if p.path == '/api/book' and bookapi:
            BOOK['asked'] += 1
            if BOOK['mode'] == 'down':
                return self.reply(503, {'ok': False, 'error': 'down'})
            if BOOK['mode'] == 'junk':
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.cors()
                self.send_header('Content-Length', '6')
                self.end_headers()
                self.wfile.write(b'<html>')
                return
            return bookapi.respond(self, ENV, method, BOOK_STORE, BookDurable())
        if p.path == '/__book_reset':                                        # forget the copies (Redis and the long-term layer) and the counters; ?hot=1: only what Redis holds; ?mode=down|junk|ok
            q = parse_qs(p.query)
            BOOK_STORE.d.clear()
            BOOK_STORE.exp.clear()
            if q.get('hot', ['0'])[0] != '1':
                BookDurable.rows.clear()
            BOOK['mode'], BOOK['asked'] = q.get('mode', ['ok'])[0], 0
            bookapi._LOCAL_USED.clear()
            return self.json({'ok': True})
        if p.path == '/__book_state':                                        # what is kept where
            return self.json({'hot': sorted(k for k in BOOK_STORE.d if k.startswith('bk:1:')), 'durable': sorted('%s:%d' % k for k in BookDurable.rows), 'asked': BOOK['asked']})
        if p.path == '/api/translate' and translateapi:
            env = {'ALLOW_LOCAL_ORIGIN': '1', 'IP_SALT': 'dev', **({} if TRANS['mode'] == 'off' else {'DEEPL_API_KEY': 'fake:fx'}), **({'TRANSLATE_DAY_CHARS': '1000'} if TRANS['mode'] == 'limit' else {})}

            def fake(texts, to, src, env_):
                TRANS['calls'].append({'to': to, 'n': len(texts), 'chars': sum(len(x) for x in texts), 'first': texts[0] if texts else ''})
                if TRANS['mode'] in ('quota', 'fail'):
                    raise translate.Unavailable(TRANS['mode'])
                return 'deepl', ['译:' + x if to == 'zh' else 'EN:' + x for x in texts]
            return translateapi.respond(self, env, method, TRANS_STORE, translator=fake)
        if p.path == '/__trans':                                             # ?mode=ok|off|limit|quota|fail  &reset=1 (forget the counters, the cache and the log)
            q = parse_qs(p.query)
            if q.get('reset', ['0'])[0] == '1':
                TRANS_STORE.d.clear()
                TRANS_STORE.exp.clear()
                TRANS['calls'].clear()
            TRANS['mode'] = q.get('mode', ['ok'])[0]
            return self.json({'ok': True, 'mode': TRANS['mode']})
        if p.path == '/__trans_log':
            return self.json(TRANS['calls'])
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
