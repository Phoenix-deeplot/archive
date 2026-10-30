import re, subprocess, sys, io, os
t = io.open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'index.html'), encoding='utf-8').read()
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', t, re.S)
big = max(scripts, key=len)
p = os.path.join(os.environ['TEMP'], 'page_check.js')
io.open(p, 'w', encoding='utf-8').write(big)
r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
print('syntax:', 'OK' if r.returncode == 0 else r.stderr[:1500])
