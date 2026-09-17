#!/usr/bin/env python3
"""par.top wiring probe: feedbackTOP.par.top = <downstream capture node>.

The verified ping-pong suite wires feedback via the `top` OP-reference par
(facebook captures from the node that CONSUMES the loop), not via connectors.
Test whether that makes the buffer latch + advance across real frames.
"""
import json
import time
import urllib.request

ACC = """layout(location = 0) out vec4 fragColor;
void main() {
    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;
    float dot_ = smoothstep(0.06, 0.02, length(vUV.st - 0.5));
    fragColor = vec4(max(vec3(dot_), prev * 0.9), 1.0);
}
"""

BUILD = f'''import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fw_")]:
    c.destroy()
code = p1.create(td.textDAT, "fw_code")
code.text = {json.dumps(ACC)}
g = p1.create(td.glslTOP, "fw_g")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 128
g.par.resolutionh = 128
fb = p1.create(td.feedbackTOP, "fw_fb")
out = p1.create(td.nullTOP, "fw_out")
# canonical wiring: fb feeds g input 0; g feeds out; fb.par.top = out (capture)
fb.outputConnectors[0].connect(g)
g.outputConnectors[0].connect(out)
try:
    fb.par.top = out
    top_set = "ok"
except Exception as e:
    top_set = str(e)[:80]
g.cook(force=True)
out.cook(force=True)
print(json.dumps({{"top_set": top_set}}))
'''

READ = '''import json
g = op('/project1/fw_g'); fb = op('/project1/fw_fb'); out = op('/project1/fw_out')
ga = g.numpyArray(); fa = fb.numpyArray()
import numpy
print(json.dumps({'frame': int(absTime.frame),
                  'g_shape': list(ga.shape), 'fb_shape': list(fa.shape),
                  'g_active': int((ga.reshape(ga.shape[0], ga.shape[1], -1)[:, :, :3].mean(axis=2) > 0.05).sum()) if ga.ndim == 3 else -1,
                  'fb_mean': round(float(fa.mean()), 5) if fa.ndim == 3 else -1}))
'''


def ex(code, timeout=180):
    req = urllib.request.Request(
        "http://127.0.0.1:44444/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.loads(r.read().decode())
    o = d.get("output", "").strip()
    return json.loads(o[o.index("{"):o.rindex("}") + 1]) if "{" in o else {"err": str(d.get("error"))[-150:]}


print("build:", json.dumps(ex(BUILD)))
for i, wait in enumerate([0, 1.0, 2.0]):
    if i:
        time.sleep(wait)
    print(f"t{i}:", json.dumps(ex(READ)))
ex("import json\nfor c in op('/project1').children:\n"
   "    if c.name.startswith('fw_'): c.destroy()\nprint('ok')", timeout=60)
print("cleaned")
