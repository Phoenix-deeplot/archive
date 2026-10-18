#!/usr/bin/env python3
"""After a deploy, tell the search engines that use IndexNow (Bing, Yandex, Naver, Seznam, Yep) which pages are new or changed.
Google does not use IndexNow (and has no way to request indexing by program): for Google the sitemap is the way, see README.

    python indexnow.py --init        make a key and write it into site.json ("indexnow_key"); build and deploy once so that <key>.txt is online
    python indexnow.py               compare the live sitemap.xml with what was sent last time, send the new and changed addresses only
    python indexnow.py --dry-run     show what would be sent, send nothing
    python indexnow.py --all         send every address again

    vercel --prod && python indexnow.py          # deploy, then tell them (one command)

What counts as changed: an address that was not in the sitemap last time, or whose <lastmod> there is different (the build gives a page the date
of its file, so a page you edit moves). What was sent is remembered in .indexnow-state.json (not published, not committed).
The key is not a secret: IndexNow wants it published at https://your-site/<key>.txt so that the engines can see the site is yours.
Nothing is sent unless you run this script, and only addresses of your own site are sent. Only the standard library is used.
"""
import argparse
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.abspath(__file__))
ENDPOINT = 'https://api.indexnow.org/IndexNow'
STATE = os.path.join(ROOT, '.indexnow-state.json')
BATCH = 10000                                           # what one request may carry
UA = 'indexnow.py'


def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8-sig') as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def site_url(arg, site):
    """https://your-site : --site, else site.json "site_url", else the --site-url of the build command in vercel.json."""
    for cand in (arg, site.get('site_url')):
        if cand:
            return str(cand).strip().rstrip('/')
    m = re.search(r'--site-url\s+(https://[^\s|"]+)', json.dumps(load_json(os.path.join(ROOT, 'vercel.json'))))
    return m.group(1).rstrip('/') if m else ''


def get(url, limit=4 * 1024 * 1024):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=30) as r:
        return r.read(limit)


def live_sitemap(base):
    """-> {address: lastmod} of the sitemap that is online now."""
    root = ET.fromstring(get(base + '/sitemap.xml'))
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    out = {}
    for u in root.findall('s:url', ns):
        loc = u.find('s:loc', ns)
        mod = u.find('s:lastmod', ns)
        if loc is not None and (loc.text or '').strip():
            out[loc.text.strip()] = (mod.text or '').strip() if mod is not None else ''
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description='Tell IndexNow about the new and changed pages of the site.')
    ap.add_argument('--init', action='store_true', help='make a key and save it in site.json')
    ap.add_argument('--dry-run', action='store_true', help='show what would be sent, send nothing')
    ap.add_argument('--all', action='store_true', help='send every address, not only the new and changed ones')
    ap.add_argument('--site', default='', help='the site address, e.g. https://books.zhitree.cn (default: from site.json or vercel.json)')
    a = ap.parse_args(argv)
    site = load_json(os.path.join(ROOT, 'site.json'))
    if a.init:
        if site.get('indexnow_key'):
            print('site.json already has a key: %s' % site['indexnow_key'])
            return 0
        site['indexnow_key'] = secrets.token_hex(16)
        with open(os.path.join(ROOT, 'site.json'), 'w', encoding='utf-8', newline='\n') as f:
            json.dump(site, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print('Key saved in site.json. Now build and deploy (the build writes %s.txt to the site), then run this script again.' % site['indexnow_key'])
        return 0
    key = str(site.get('indexnow_key') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9-]{8,128}', key):
        print('No usable "indexnow_key" in site.json: run  python indexnow.py --init  first.')
        return 2
    base = site_url(a.site, site)
    if not base.startswith('https://'):
        print('I do not know the address of the site: give it with --site https://your-site')
        return 2
    host = urllib.parse.urlsplit(base).netloc
    try:
        live = live_sitemap(base)
    except (urllib.error.URLError, OSError, ET.ParseError) as e:
        print('Cannot read %s/sitemap.xml (%s). Is the site deployed?' % (base, e))
        return 2
    live = {u: m for u, m in live.items() if urllib.parse.urlsplit(u).netloc == host}          # only this site's own addresses
    state = load_json(STATE)
    sent = state.get('sent') if state.get('host') == host and isinstance(state.get('sent'), dict) else {}
    todo = [u for u, m in live.items() if a.all or sent.get(u) != m]
    print('Site %s: %d address(es) in the sitemap, %d new or changed since last time.' % (base, len(live), len(todo)))
    if not todo:
        print('Nothing to send.')
        return 0
    key_url = '%s/%s.txt' % (base, key)
    if a.dry_run:
        print('\n'.join(todo))
        return 0
    try:                                                                       # the key file must be online and say the key, otherwise the engines refuse the whole request
        body = get(key_url, 1024).decode('utf-8', 'replace').strip()
    except (urllib.error.URLError, OSError) as e:
        print('The key file %s is not online yet (%s). Deploy first, then run again.' % (key_url, e))
        return 1
    if body != key:
        print('%s does not contain the key. Deploy the latest build first.' % key_url)
        return 1
    status = 0
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        payload = json.dumps({'host': host, 'key': key, 'keyLocation': key_url, 'urlList': part}).encode('utf-8')
        req = urllib.request.Request(ENDPOINT, data=payload, method='POST', headers={'Content-Type': 'application/json; charset=utf-8', 'User-Agent': UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print('sent %d address(es): HTTP %s %s' % (len(part), r.status, {200: 'OK', 202: 'accepted (the key is being checked)'}.get(r.status, '')))
                sent.update({u: live[u] for u in part})
        except urllib.error.HTTPError as e:
            print('HTTP %s %s' % (e.code, {400: 'bad request', 403: 'the key is not valid for this site', 422: 'addresses do not belong to the host', 429: 'too many requests, try later'}.get(e.code, '')))
            status = 1
        except (urllib.error.URLError, OSError) as e:
            print('could not reach IndexNow: %s' % e)
            status = 1
    with open(STATE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'host': host, 'sent': sent}, f, ensure_ascii=False, indent=1)
        f.write('\n')
    return status


if __name__ == '__main__':
    sys.exit(main())
