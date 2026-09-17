#!/usr/bin/env python3
"""FB dims probe: compare fb.numpyArray() shape vs g.numpyArray() shape and
verify whether fb actually captures g's output after a forced cook."""
import json
import urllib.request

CODE = '''import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("fi_")]:
    c.destroy()
SH = "layout(location = 0) out vec4 fragColor;" + chr(10) + "void main() {" + chr(10) + "    vec3 prev = texture(sTD2DInputs[0], vUV.st).rgb;" + chr(10) + "    float dot_ = smoothstep(0.06, 0.02, length(vUV.st - 0.5));" + chr(10) + "    fragColor = vec4(max(vec3(dot_), prev * 0.95), 1.0);" + chr(10) + "}" + chr(10)
code = p1.create(td.textDAT, "fi_code")
code.text = SH
g = p1.create(td.glslTOP, "fi_g")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 128
g.par.resolutionh = 128
fb = p1.create(td.feedbackTOP, "fi_fb")
g.outputConnectors[0].connect(fb)
fb.outputConnectors[0].connect(g)
g.cook(force=True)
fb.cook(force=True)
ga = g.numpyArray()
fa = fb.numpyArray()
res = {
    "g_shape": list(ga.shape), "fb_shape": list(fa.shape),
    "g_max": round(float(ga.max()), 4), "fb_max": round(float(fa.max()), 4),
    "g_mean": round(float(ga[:, :, :3].mean()), 5), "fb_mean": round(float(fa[:, :, :3].mean()), 5),
}
# now g reads from fb (input 0) — cook g again: does prev see the dot?
fb.cook(force=True)
g.cook(force=True)
ga2 = g.numpyArray()
res["g2_active"] = int((ga2[:, :, :3].mean(axis=2) > 0.05).sum())
res["g2_max"] = round(float(ga2.max()), 4)
fb2 = op('/project1/fi_fb')
res["fb_after2_max"] = round(float(fb2.numpyArray().max()), 4) if fb2 else None
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
print(d.get("output", "").strip()[:400])
print("ERR:", str(d.get("error"))[-200:])
