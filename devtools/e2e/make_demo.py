"""Build the demo site the browser tests open.

  python -X utf8 devtools/e2e/make_demo.py [--src <the project folder to test>] [--out <where>]

It copies the pages of the project (index.html, sw.js, the build scripts, vendor/ without pdf.js ...) next to a made-up library (fixtures/demo-library, the guide of the project is
added to it), builds it as the site is built for Vercel (build_index.py --seo), puts the made-up directory (fixtures/directory.base.json) in dist/dir/, and gives index.html a way
for the tests to reach its inside: window.__zt (every name of HOOKS that the page has). The result is <out>/dist, which rig.ps1 serves at http://127.0.0.1:8820/.
Run it again after every change of the page.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
ROOT_FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'build_index.py', 'seo.py', 'serve.py', 'convert.py', 'vercel.json', 'privacy.html', 'about.html', 'terms.html', 'robots.txt', 'ads.txt']
ROOT_DIRS = ['icons', 'vendor', 'en']
HOOKS = ('state idb LS bkBuild bkOpen bkPlan bkApply zipOpen zipBuild loadAll addCollection openReader refreshSubs syncRun syncCfg syncSnapshot syncProbe payMaybe merge3 syncNewCode syncKeys syncNorm '
         'syncEnsureKeys syncFetchBody render openDirReader fetchLinkText prefetchTexts introOpen introBoot canReadHere isNoread itemById openLinkReading renderStarter starterShelves statSend statFlush statApi '
         'loadHeat heatAvailable dirList markDirRead subscribeNow dirMeta openNote neSave neClose NE neDeriveTitle neTags syncRecord neDocFit neDomToMd neGet neRaw neParse neFix neNorm renderCheck openSubmit '
         'guideItem dirWhy dirProfile pl plAudio plPlay plEnqueue plToggle plStop plRestore plRender plFold richOpen richFromItem embedOf cardData postData withForm focusOpen readerFocus fcDlg '
         'shLayout shStep shPanels transApi trAvailable TR').split()


def test_ports():
    return {'8820': os.environ.get('E2E_APP_PORT', '8820'), '8840': os.environ.get('E2E_HOT_PORT', '8840'),
            '8841': os.environ.get('E2E_FEED_PORT', '8841'), '8842': os.environ.get('E2E_TEXT_PORT', '8842'),
            '8843': os.environ.get('E2E_POD_PORT', '8843'), '8850': os.environ.get('E2E_READ_PORT', '8850')}


def remap_urls(value, ports):
    if isinstance(value, dict):
        return {k: remap_urls(v, ports) for k, v in value.items()}
    if isinstance(value, list):
        return [remap_urls(v, ports) for v in value]
    if isinstance(value, str):
        for old, new in ports.items():
            value = value.replace('127.0.0.1:' + old, '127.0.0.1:' + new)
        return value
    return value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=ROOT)
    ap.add_argument('--out', default=os.path.join(HERE, '.demo'))
    ap.add_argument('--site-url', default='http://127.0.0.1:8820')
    a = ap.parse_args()
    src, out = os.path.abspath(a.src), os.path.abspath(a.out)
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    for n in ROOT_FILES:
        if os.path.isfile(os.path.join(src, n)):
            shutil.copy2(os.path.join(src, n), os.path.join(out, n))
    for n in ROOT_DIRS:
        if os.path.isdir(os.path.join(src, n)):
            shutil.copytree(os.path.join(src, n), os.path.join(out, n), ignore=shutil.ignore_patterns('pdfjs', '__pycache__'))
    shutil.copytree(os.path.join(HERE, 'fixtures', 'demo-library'), os.path.join(out, 'library'))
    guide = os.path.join(src, 'library', 'notes', 'guide')
    if os.path.isdir(guide):
        shutil.copytree(guide, os.path.join(out, 'library', 'notes', 'guide'))
    site_demo = json.load(open(os.path.join(HERE, 'fixtures', 'site.demo.json'), encoding='utf-8'))
    site_demo = remap_urls(site_demo, test_ports())
    with open(os.path.join(out, 'site.json'), 'w', encoding='utf-8') as f:
        json.dump(site_demo, f, ensure_ascii=False)
    r = subprocess.run([sys.executable, '-X', 'utf8', 'build_index.py', '--keep-dates', '--seo', '--site-url', a.site_url, '--out', 'dist'], cwd=out, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        sys.exit('the build failed:\n' + r.stdout[-1500:] + r.stderr[-1500:])
    dist = os.path.join(out, 'dist')
    os.makedirs(os.path.join(dist, 'dir'), exist_ok=True)
    directory_demo = json.load(open(os.path.join(HERE, 'fixtures', 'directory.base.json'), encoding='utf-8'))
    directory_demo = remap_urls(directory_demo, test_ports())
    with open(os.path.join(dist, 'dir', 'directory.json'), 'w', encoding='utf-8') as f:
        json.dump(directory_demo, f, ensure_ascii=False)
    end = '\n})();\n</script>'
    hook = ("\nwindow.__zt={}; %s.forEach(function(n){ try{ window.__zt[n]=eval(n); }catch(e){} });" % repr(HOOKS))
    n = 0
    for folder, _, names in os.walk(dist):                       # the page itself and every page the build made from it (the pages of the sections of the directory open the same application)
        for name in names:
            if not name.endswith('.html'):
                continue
            page = os.path.join(folder, name)
            text = open(page, encoding='utf-8', newline='').read()
            i = text.rfind(end)
            if i >= 0 and 'const I18N' in text:
                open(page, 'w', encoding='utf-8', newline='').write(text[:i] + hook + text[i:])
                n += 1
    if not os.path.isfile(os.path.join(dist, 'index.html')) or n == 0:
        sys.exit('the end of the script of index.html was not found: the hook for the tests cannot be put in')
    print('demo built from %s -> %s (the hook is in %d pages)' % (src, dist, n))


if __name__ == '__main__':
    main()
