#!/usr/bin/env python3
"""Recreate the circle recipe from scratch (fresh ops, fresh uniforms)."""
import json
import urllib.request

BASE = "http://127.0.0.1:44444"

CODE = r'''
import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("vis_circle")]:
    c.destroy()
code = p1.create(td.textDAT, "vis_circle_sdf_code")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "void main() {\n"
    "    vec2 p = vUV.st - 0.5;\n"
    "    float d = length(p);\n"
    "    float c = smoothstep(0.42, 0.40, d);\n"
    "    fragColor = vec4(vec3(c), 1.0);\n"
    "}"
)
g = p1.create(td.glslTOP, "vis_circle_sdf")
g.par.pixeldat = code.name
g.cook(force=True)
a = g.numpyArray()
h, w = a.shape[0], a.shape[1]
row = a[h // 2]
whites_h = sum(1 for x in range(w) if row[x][0] > 0.5)
col = a[:, w // 2]
whites_v = sum(1 for y in range(h) if col[y][0] > 0.5)
print(json.dumps({
    "fresh_center": round(float(a[h // 2][w // 2][0]), 3),
    "fresh_min": round(float(a.min()), 3), "fresh_max": round(float(a.max()), 3),
    "white_span_h": whites_h, "white_span_v": whites_v,
    "err": g.errors(),
}))
'''

req = urllib.request.Request(
    BASE + "/exec",
    data=json.dumps({"code": CODE}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as r:
    d = json.loads(r.read().decode())
print(d.get("output", "").strip()[:500])
print("status:", d.get("status"), "| error:", str(d.get("error"))[:200])
