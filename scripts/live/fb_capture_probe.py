#!/usr/bin/env python3
"""Capture-semantics probe: does feedbackTOP capture its CONNECTOR input?"""
import json
import urllib.request

CODE = r'''import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fx_")]:
    c.destroy()
SH = "layout(location = 0) out vec4 fragColor;" + chr(10) + "void main() {" + chr(10) + "    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;" + chr(10) + "    float dot_ = smoothstep(0.06, 0.02, length(vUV.st - 0.5));" + chr(10) + "    fragColor = vec4(max(vec3(dot_), prev * 0.9), 1.0);" + chr(10) + "}" + chr(10)
code = p1.create(td.textDAT, "fx_code")
code.text = SH
g = p1.create(td.glslTOP, "fx_g")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 128
g.par.resolutionh = 128
fb = p1.create(td.feedbackTOP, "fx_fb")
out = p1.create(td.nullTOP, "fx_out")
# connector chain: g -> out -> fb, fb -> g (input 0)
g.outputConnectors[0].connect(out)
out.outputConnectors[0].connect(fb)
fb.outputConnectors[0].connect(g)
res = {"fb_input_src": None}
try:
    res["fb_input_src"] = fb.inputConnectors[0].outputConnectors[0].owner.name
except Exception as e:
    res["fb_input_src"] = str(e)[:60]
g.cook(force=True)
out.cook(force=True)
fb.cook(force=True)
res["fb_max"] = round(float(fb.numpyArray().max()), 4)
fb.cook(force=True)
g.cook(force=True)
ga = g.numpyArray()
res["g2_active"] = int((ga[:, :, :3].mean(axis=2) > 0.05).sum())
res["g2_max"] = round(float(ga.max()), 4)
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
o = d.get("output", "").strip()
print(json.dumps(json.loads(o[o.index("{"):o.rindex("}") + 1])) if "{" in o else str(d.get("error"))[-200:])

# cleanup
req = urllib.request.Request(
    "http://127.0.0.1:44444/exec",
    data=json.dumps({"code": "import json\nfor c in op('/project1').children:\n    if c.name.startswith('fx_'): c.destroy()\nprint('ok')"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
urllib.request.urlopen(req, timeout=60).read()
print("cleaned")
