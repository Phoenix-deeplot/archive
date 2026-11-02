"""Render slides.html into xhs-01-cover.png ... xhs-07-home-screen.png (1080 x 1440, 3:4, the size of a Xiaohongshu picture).

   python -X utf8 docs/promo/2026-10-new-features/render.py          # all seven
   python -X utf8 docs/promo/2026-10-new-features/render.py 1 3      # only these

Uses the Edge that is on this computer, headless, with a profile in a temporary folder (nothing is left in the project)."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
NAMES = {1: 'cover', 2: 'listen', 3: 'podcast', 4: 'hot', 5: 'discover', 6: 'focus', 7: 'home-screen'}
EDGES = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe']


def main():
    edge = next((p for p in EDGES if os.path.exists(p)), None)
    if not edge:
        sys.exit('no Edge found')
    which = [int(a) for a in sys.argv[1:]] or sorted(NAMES)
    src = 'file:///' + os.path.join(HERE, 'slides.html').replace('\\', '/')
    tmp = tempfile.mkdtemp(prefix='xhs-render-')
    try:
        for n in which:
            out = os.path.join(HERE, 'xhs-%02d-%s.png' % (n, NAMES[n]))
            subprocess.run([edge, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1080,1440',
                            '--user-data-dir=' + os.path.join(tmp, 'p%d' % n), '--virtual-time-budget=4000', '--screenshot=' + out, src + '#' + str(n)],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=90)
            print('wrote', os.path.relpath(out))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
