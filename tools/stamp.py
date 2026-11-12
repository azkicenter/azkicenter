#!/usr/bin/env python3
"""Appends ?v=<content-hash> to local assets referenced in index.html (css/js), so a deploy
never serves a new index.html with an old cached asset. Run after editing any assets/*.css|js:
    python3 tools/stamp.py
"""
import hashlib, re, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
p = os.path.join(root, 'index.html')
s = open(p, encoding='utf-8').read()
def h(path):
    return hashlib.sha1(open(os.path.join(root, path), 'rb').read()).hexdigest()[:8]
def fix(m):
    path = m.group(2)
    return f'{m.group(1)}{path}?v={h(path)}"'
s2 = re.sub(r'((?:src|href)=")(assets/[\w./-]+\.(?:css|js))(?:\?v=\w+)?"', fix, s)
if s2 != s:
    open(p, 'w', encoding='utf-8').write(s2); print('stamped')
else:
    print('unchanged')
