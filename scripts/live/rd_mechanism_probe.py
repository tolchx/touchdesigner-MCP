#!/usr/bin/env python3
"""Why doesn't the RD loop evolve? Contrast 3 wirings + trivial accumulator.

W1: g -> fb -> g  (fb.outputConnectors -> g input)   [current builder wiring]
W2: g -> fb, and g reads sTD2DInputs[0]; TD feedback idiom where the
    feedback TOP output is connected back into the glslTOP input 0
    (same as W1 but ensure the INPUT is index 0 and fb input is g)
W3: textbook TD idiom: fb1 placed BEFORE g; fb's input = g's output,
    g's input 0 = fb's output (identical to W1?)  -> instead try:
    g2 = new glslTOP reading input; wire g -> fb (input), fb -> g
A:  accumulator shader (prev * 0.9 + dot) with W1 wiring to see if ANY
    feedback accumulates across real frames.
Also: check fb par 'outputoverride'? And inspect fb.inputConnectors count.
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

CODE = f'''import json
res = {{}}
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fbx_")]:
    c.destroy()
code = p1.create(td.textDAT, "fbx_code")
code.text = {json.dumps(ACC)}
g = p1.create(td.glslTOP, "fbx_g")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 128
g.par.resolutionh = 128
fb = p1.create(td.feedbackTOP, "fbx_fb")
# wiring A: g -> fb (fb input 0), fb -> g (g input 0)
g.outputConnectors[0].connect(fb)
fb.outputConnectors[0].connect(g)
res["g_inputs"] = len(g.inputConnectors)
res["fb_inputs"] = len(fb.inputConnectors)
res["fb_pars"] = [p.name for p in fb.customPars]
g.cook(force=True)
def snap(tag):
    g.cook(force=True)
    a = g.numpyArray()
    gg = a[:, :, :3].mean(axis=2)
    return {{tag: {{"mean": round(float(gg.mean()), 5), "max": round(float(gg.max()), 5), "frame": int(absTime.frame)}}}}
s1 = snap("t0")
print(json.dumps({{**res, **s1}}))
'''
req = urllib.request.Request(
    "http://127.0.0.1:44444/exec",
    data=json.dumps({"code": CODE}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=180) as r:
    d = json.loads(r.read().decode())
print(d.get("output", "").strip()[:600])
print("ERR:", str(d.get("error"))[:250])
