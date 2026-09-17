#!/usr/bin/env python3
"""Cross-test: which uniform family binds under scripted creation?"""
import json
import urllib.request

CODE = r'''
import json
res = {}
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("ue_")]:
    c.destroy()
# float shader bound via vec0name (declared type float wins?)
SH1 = "layout(location = 0) out vec4 fragColor;" + chr(10) + "uniform float u_radius;" + chr(10) + "void main(){ vec2 p = vUV.st - 0.0.5;" .replace("- 0.0.5", "- 0.5;") + " float d = length(p); float c = smoothstep(u_radius, u_radius - 0.02, d); fragColor = vec4(vec3(c), 1.0); }" + chr(10)
code = p1.create(td.textDAT, "ue_code")
code.text = SH1
def check(g):
    a = g.numpyArray()
    row = a[a.shape[0]//2]
    return {"center": round(float(a[a.shape[0]//2][a.shape[1]//2][0]),3), "first_white": next((i for i in range(a.shape[1]) if row[i][0] > 0.5), -1), "err": g.errors(recurse=False)[:60]}
g1 = p1.create(td.glslTOP, "ue_vec0")
g1.par.pixeldat = code.name
g1.par.outputresolution = "custom"
g1.par.resolutionw = 256
g1.par.resolutionh = 256
g1.par.vec0name = "u_radius"
g1.par.vec0valuex = 0.42
g1.cook(force=True)
res["float_via_vec0"] = check(g1)
g2 = p1.create(td.glslTOP, "ue_const0")
g2.par.pixeldat = code.name
g2.par.outputresolution = "custom"
g2.par.resolutionw = 256
g2.par.resolutionh = vec0probe
'''.replace("vec0probe", "256")

CODE += r'''
g2.par.const0name = "u_radius"
g2.par.const0value = 0.42
g2.cook(force=True)
res["float_via_const0"] = check(g2)
for n in ["ue_vec0","ue_const0","ue_code"]:
    o = op("/project1/"+n)
    if o: o.destroy()
print(json.dumps(res))
'''

req = urllib.request.Request(
    "http://127.0.0.1:44444/exec",
    data=json.dumps({"code": CODE}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=120) as r:
    d = json.loads(r.read().decode())
print("OUT:", d.get("output", "").strip()[:400])
print("ERR:", str(d.get("error"))[:250])
