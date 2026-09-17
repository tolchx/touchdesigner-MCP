#!/usr/bin/env python3
"""Live probe round 3: numeric uniform verification (vec0name/vec0valuex),
clean feedback accumulation loop, infoDAT family roles."""
import json
import urllib.request

BASE = "http://127.0.0.1:44444"


def post_exec(code: str) -> dict:
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def run(name: str, code: str):
    print("=== %s ===" % name)
    try:
        res = post_exec(code)
        out = res.get("output", "")
        print(out.strip() if out.strip() else json.dumps(res)[:400])
    except Exception as e:
        print("PROBE ERROR:", str(e)[:300])


def main():
    # J: numeric uniform check — u_scale=0.5, right edge R should be ~0.5 (uv=1 * 0.5)
    run("J_uniform_numeric", r'''
import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("probe_u")]:
    c.destroy()
code = p1.create(td.textDAT, "probe_u_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "uniform float u_scale;\n"
    "void main(){ fragColor = vec4(vUV.st * u_scale, 0.0, 1.0); }"
)
g = p1.create(td.glslTOP, "probe_u_glsl")
g.par.pixeldat = code.path
has_vec_name = hasattr(g.par, "vec0name")
if has_vec_name:
    g.par.vec0name = "u_scale"
    g.par.vec0valuex = 0.5
g.cook(force=True)
res = {"vec0name_exists": has_vec_name, "errors": g.errors()}
try:
    arr = g.numpyArray()
    h, w = arr.shape[0], arr.shape[1]
    res["right_edge_R"] = round(float(arr[h//2][w-1][0]), 4)   # expect ~0.5
    res["left_edge_R"]  = round(float(arr[h//2][0][0]), 4)     # expect ~0.0
    res["top_G_midX"]   = round(float(arr[0][w//2][1]), 4)     # expect ~0.5 (uv.y=1 at TOP row?)
    res["bottom_G_midX"]= round(float(arr[h-1][w//2][1]), 4)   # expect ~0.0
except Exception as e:
    res["numpy_error"] = str(e)[:200]
print(json.dumps(res))
''')

    # K: clean feedback loop — fresh glslTOP, no other inputs
    run("K_feedback_clean", r'''
import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("probe_fb")]:
    c.destroy()
code = p1.create(td.textDAT, "probe_fb_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "void main(){\n"
    "    vec4 base = vec4(0.0);\n"
    "    if (vUV.st.x > 0.9) base.r = 1.0;\n"
    "    vec4 prev = texture(sTD2DInputs[0], vUV.st);\n"
    "    fragColor = max(base, prev * 0.95);\n"
    "}"
)
g = p1.create(td.glslTOP, "probe_fb_glsl")
g.par.pixeldat = code.path
fb = p1.create(td.feedbackTOP, "probe_fb_fb")
g.outputConnectors[0].connect(fb)
fb.outputConnectors[0].connect(g)
seq = []
for i in range(10):
    g.cook(force=True)
    try:
        arr = g.numpyArray()
        seq.append(round(float(arr[arr.shape[0]//2][arr.shape[1]-1][0]), 4))
    except Exception:
        seq.append(None)
print(json.dumps({
    "errors": g.errors(),
    "right_edge_R_10_cooks": seq,
    "note": "should rise toward ~1.0 (0.9 injected, decay 0.95) => feedback verified",
}))
''')

    # L: infoDAT family roles
    run("L_infodat_family", r'''
import json
p1 = op("/project1")
g = p1.op("probe_fb_glsl")
dats = {}
for suffix in ("info", "pixel", "compute"):
    d = p1.op("probe_fb_glsl_" + suffix)
    if d is not None:
        dats[suffix] = d.text[:180].replace("\n", " | ")
print(json.dumps(dats, indent=0))
''')


if __name__ == "__main__":
    main()
