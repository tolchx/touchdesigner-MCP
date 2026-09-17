#!/usr/bin/env python3
"""Diagnose the pixel distribution of the tool-created node."""
import json
import urllib.request

CODE = r'''
import json
g = op('/project1/tool_circle')
assert g is not None, 'node missing'
g.cook(force=True)
a = g.numpyArray()
h, w = a.shape[0], a.shape[1]
row = a[h//2]
res = {
    'shape': [w, h],
    'min': round(float(a.min()), 4),
    'max': round(float(a.max()), 4),
    'row_mid_profile': [round(float(row[x][0]), 2) for x in range(0, w, 32)],
    'first_white_idx': next((i for i in range(w) if row[i][0] > 0.5), -1),
    'last_white_idx': next((i for i in range(w-1, -1, -1) if row[i][0] > 0.5), -1),
}
print(json.dumps(res))
'''

req = urllib.request.Request(
    "http://127.0.0.1:44 Workaround".replace("44 Workaround", "44444") + "/exec",
    data=json.dumps({"code": CODE}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as r:
    d = json.loads(r.read().decode())
print(d.get("output", "").strip()[:600])
