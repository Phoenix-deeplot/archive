"""Put the real picked books (shelf-directory's registry/books.json) into the demo directory, so the page can be looked at with them.

  python -X utf8 devtools/e2e/books_preview.py [--shelf-directory <the folder of the directory service>] [--dist <the built demo>]

Run it after make_demo.py (which writes the made-up directory); the page reads the directory when it loads. The books are put through the directory's own build (aggregate.py, the shelf "精选图书"),
so the page gets them as the real site will. Their chapters are read from the real sites (zh.wikisource.org ...) by the rig's /api/feed: the machine needs the internet for that.
The tests that write their own directory (dir_fixture.js) replace it again.
"""
import argparse
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shelf-directory', default=os.environ.get('SHELF_DIRECTORY', r'E:\Ztree\shelf-directory'))
    ap.add_argument('--dist', default=os.path.join(HERE, '.demo', 'dist'))
    a = ap.parse_args()
    sd = os.path.abspath(a.shelf_directory)
    src = os.path.join(sd, 'registry', 'books.json')
    if not os.path.isfile(src):
        sys.exit('no registry/books.json in ' + sd)
    target = os.path.join(os.path.abspath(a.dist), 'dir', 'directory.json')
    if not os.path.isfile(target):
        sys.exit('no demo yet: run  python -X utf8 devtools/e2e/make_demo.py  first')
    sys.path.insert(0, sd)
    import aggregate as agg                                                                  # noqa: E402
    tmp = tempfile.mkdtemp()
    old = agg.ROOT
    try:
        os.makedirs(os.path.join(tmp, 'registry'))
        shutil.copy2(src, os.path.join(tmp, 'registry', 'books.json'))
        lists = os.path.join(sd, 'registry', 'booklists.json')                                  # (the book lists, when the service has them: the page shows them above the books)
        if os.path.isfile(lists):
            shutil.copy2(lists, os.path.join(tmp, 'registry', 'booklists.json'))
        agg.ROOT = tmp
        built = json.loads(agg.build()['directory.json'])
    finally:
        agg.ROOT = old
        shutil.rmtree(tmp, ignore_errors=True)
    with open(target, encoding='utf-8') as f:
        d = json.load(f)
    d['shelves'] = [s for s in d['shelves'] if s['id'] != 'books'] + [s for s in built['shelves'] if s['id'] == 'books']
    d['items'] = [i for i in d['items'] if i.get('shelf') != 'books'] + built['items']
    d['count'] = len(d['items'])
    if built.get('booklists'):
        d['booklists'] = built['booklists']
    else:
        d.pop('booklists', None)
    d['types'] = {}
    for i in d['items']:
        d['types'][i['type']] = d['types'].get(i['type'], 0) + 1
    with open(target, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    print('%d books and %d book lists in the demo directory (%d items in all): %s' % (len(built['items']), len(d.get('booklists') or []), d['count'], target))


main()
