#!/usr/bin/env python3
"""Probe matrix: isolate the exact condition of the black-first-cook state.

Each variant changes ONE variable around the v1.1 symptom (glslTOP created by
script stays black although the same shader renders when the node is recreated
with the DAT already populated). All on a clean namespace, all pixel-checked.
"""
import json
import urllib.request

SHADER = open("glsl_files/recipe_t1_circle_sdf.glsl", encoding="utf-8").read()

CODE = f'''import json
res = {{}}
SH = {json.dumps(SHADER)}
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fc_")]:
    c.destroy()

def check(g, tag):
    a = g.numpyArray()
    row = a[a.shape[0]//2]
    res[tag] = {{
        "center": round(float(a[128][128][0]), 3),
        "first_white": next((i for i in range(a.shape[1]) if row[i][0] > 0.5), -1),
        "max": round(float(a.max()), 3),
        "err": g.errors(recurse=False)[:60],
    }}

# V1: create node -> set pixeldat -> set uniforms -> set resolution -> cook
#     (the current builder order, with the v1.1 recreate fallback)
code1 = p1.create(td.textDAT, "fc_code1")
code1.text = SH
g1 = p1.create(td.glslTOP, "fc_v1")
g1.par.pixeldat = code1.name
g1.par.outputresolution = "custom"
g1.par.resolutionw = 256
g1.par.resolutionh = 256
g1.par.vec0name = "u_radius"
g1.par.vec0valuex = 0.42
g1.cook(force=True)
check(g1, "V1_dat_first_then_uniforms")

# V2: uniforms set BEFORE pixeldat (bind first, then shader)
code2 = p1.create(td.textDAT, "fc_code2")
code2.text = SH
g2 = p1.create(td.glslTOP, "fc_v2")
g2.par.vec0name = "u_radius"
g2.par.vec0valuex = 0.42
g2.par.outputresolution = "custom"
g2.par.resolutionw = 256
g2.par.resolutionh = 256
g2.par.pixeldat = code2.name
g2.cook(force=True)
check(g2, "V2_uniforms_before_dat")

# V3: DAT written AFTER node creation but uniform set after DAT
code3 = p1.create(td.textDAT, "fc_code3")
g3 = p1.create(td.glslTOP, "fc_v3")
code3.text = SH
g3.par.pixeldat = code3.name
g3.par.vec0name = "u_radius"
g3.par.vec0valuex = 0.42
g3.cook(force=True)
check(g3, "V3_node_then_dat_write")

# V4: recreate after V1 (known workaround), same DAT
g1b = p1.create(td.glslTOP, "fc_v1b")
g1b.par.pixeldat = code1.name
g1b.par.outputresolution = "custom"
g1b.par.resolutionw = 256
g1b.par.resolutionh = 256
g1b.par.vec0name = "u_radius"
g1b.par.vec0valuex = 0.42
g1b.cook(force=True)
check(g1b, "V4_recreate_same_dat")

# V5: V1 but with a second cook(force=True) right after
g1.cook(force=True)
check(g1, "V5_second_cook")

# V6: V1 but pixeldat assignment REPEATED after uniforms
g6 = p1.create(td.glslTOP, "fc_v6")
g6.par.pixeldat = code1.name
g6.par.vec0name = "u_radius"
g6.par.vec0valuex = 0.42
g6.par.outputresolution = "custom"
g6.par.resolutionw = 256
g6.par.resolutionh = 256
g6.par.pixeldat = code1.name
g6.cook(force=True)
check(g6, "V6_repixeldat_after_uniforms")

for n in ["fc_v1","fc_v1b","fc_v2","fc_v3","fc_v6","fc_code1","fc_code2","fc_code3"]:
    o = op("/project1/" + n)
    if o: o.destroy()
print(json.dumps(res))
'''

req = urllib.request.Request(
    "http://127.0.0.1:44444/exec",
    data=json.dumps({"code": CODE}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=180) as r:
    d = json.loads(r.read().decode())
print(d.get("output", "").strip()[:1200])
print("ERR:", str(d.get("error"))[:300])
