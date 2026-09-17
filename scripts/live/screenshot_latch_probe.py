#!/usr/bin/env python3
"""Screenshot-latch test: the /screenshot endpoint renders a node's viewer to
PNG. If a viewer PAINT is what commits the feedback latch, then screenshotting
the fb node (or the network) between cooks should make fb advance. Try:
  A) screenshot(path=fz_fb) x3 between cooks -> read fb
  B) screenshot(path=fz_g)  x3 between cooks -> read fb
"""
import json
import time
import urllib.request

BASE = "http://127.0.0.1:44444"

BUILD = '''import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fz_")]:
    c.destroy()
SH = "layout(location = 0) out vec4 fragColor;" + chr(10) + "void main() {" + chr(10) + "    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;" + chr(10) + "    float dot_ = smoothstep(0.06, 0.02, length(vUV.st - 0.5));" + chr(10) + "    fragColor = vec4(max(vec3(dot_), prev * 0.9), 1.0);" + chr(10) + "}" + chr(10)
code = p1.create(td.textDAT, "fz_code")
code.text = SH
g = p1.create(td.glslTOP, "fz_g")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 128
g.par.resolutionh = 128
fb = p1.create(td.feedbackTOP, "fz_fb")
fb.outputConnectors[0].connect(g)
g.cook(force=True)
print(json.dumps({"built": True}))
'''

READ = '''import json
g = op('/project1/fz_g'); fb = op('/project1/fz_fb')
ga = g.numpyArray(); fa = fb.numpyArray()
print(json.dumps({'g_active': int((ga[:, :, :3].mean(axis=2) > 0.05).sum()),
                  'fb_max': round(float(fa.max()), 4),
                  'fb_mean': round(float(fa[:, :, :3].mean()), 5)}))
'''


def ex(code, timeout=180):
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode())
    o = d.get("output", "").strip()
    return json.loads(o[o.index("{"):o.rindex("}") + 1]) if "{" in o else {"err": str(d.get("error"))[-120:]}


def shot(op_path):
    req = urllib.request.Request(
        BASE + "/screenshot",
        data=json.dumps({"path": op_path}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.loads(r.read().decode())
    return d.get("success"), len(str(d.get("image") or ""))


print("build:", ex(BUILD))
for i in range(4):
    s_ok, s_len = shot("/project1/fz_fb")
    r = ex("import json\ng = op('/project1/fz_g')\ng.cook(force=True)\nprint(json.dumps({'cooked': 1}))")
    fb_read = ex(READ)
    print(f"iter {i}: shot(fb)={s_ok}/{s_len}B -> {json.dumps(fb_read)}")
# also screenshot g itself
s_ok, s_len = shot("/project1/fz_g")
time.sleep(0.5)
r2 = ex("import json\ng = op('/project1/fz_g'); fb = op('/project1/fz_fb')\nfb.cook(force=True)\nfa = fb.numpyArray()\nga = g.numpyArray()\nprint(json.dumps({'g_active': int((ga[:,:,:3].mean(axis=2) > 0.05).sum()), 'fb_max': round(float(fa.max()),4)}))")
print("after shot(g)+fb cook:", json.dumps(r2))
ex("import json\nfor c in op('/project1').children:\n    if c.name.startswith('fz_'): c.destroy()\nprint('ok')", timeout=60)
print("cleaned")
