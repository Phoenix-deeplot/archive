"""Read-only: function declarations that exist twice in the page script (the later one silently wins)."""
import io, os, sys, re, collections
t = io.open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'index.html'), encoding='utf-8').read()
scripts = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', t, re.S)
big = max(scripts, key=len)
names = collections.Counter(re.findall(r'(?m)^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(', big))
d = {k: v for k, v in names.items() if v > 1}
print('functions:', len(names), 'duplicated:', d)
consts = collections.Counter(re.findall(r'(?m)^(?:const|let)\s+([A-Za-z_$][\w$]*)\b', big))
print('top-level const/let twice:', {k: v for k, v in consts.items() if v > 1})
