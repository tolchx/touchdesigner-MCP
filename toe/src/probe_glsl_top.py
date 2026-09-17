#!/usr/bin/env python3
"""Live probe: GLSL TOP idioms on TD 2025.31760 (evidence for docs/GLSL_TOP_RULES.md).

Run:  python toe/src/probe_glsl_top.py
Requires TD with the API bridge on 127.0.0.1:44444.
"""
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
    with urllib.request.urlopen(req, timeout=60) as r:
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
    run("A_min_vUV", r'''
import json
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("probe_top")]:
    c.destroy()
code = p1.create(td.textDAT, "probe_top_shader")
code.text = "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(vUV.uv, 0.0, 1.0); }"
g = p1.create(td.glslTOP, "probe_top_min")
g.par.pixeldat = code.path
g.nodeX = -500; g.nodeY = 900
try:
    g.cook(force=True)
except Exception:
    pass
info = p1.op("probe_top_min_info")
print(json.dumps({
    "errors": g.errors(),
    "warnings": g.warnings(),
    "info_dats": [c.name for c in p1.children if "probe_top_min" in c.name],
    "res": [g.width, g.height],
    "infoDAT_head": (info.text[:400] if info else None),
}))
''')

    run("B_pixel_readback", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
info = p1.op("probe_top_min_info")
res = {"exists": g is not None, "res": None, "numpy_ok": False,
       "pixel_samples": None, "infoDAT_head": (info.text[:300] if info else None)}
if g is not None:
    res["res"] = [g.width, g.height]
    try:
        arr = g.numpyArray()
        h, w = arr.shape[0], arr.shape[1]
        res["numpy_ok"] = True
        res["shape"] = [int(h), int(w), int(arr.shape[2])]
        # corners + center (row 0 = TOP of image? check both)
        res["pixel_samples"] = {
            "first_row_left": [float(v) for v in arr[0][0][:3]],
            "first_row_right": [float(v) for v in arr[0][w-1][:3]],
            "last_row_left": [float(v) for v in arr[h-1][0][:3]],
            "last_row_right": [float(v) for v in arr[h-1][w-1][:3]],
        }
    except Exception as e:
        res["numpy_error"] = str(e)[:200]
print(json.dumps(res))
''')

    run("C_inputs_and_res_uniform", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
noise = p1.op("probe_top_noise") or p1.create(td.noiseTOP, "probe_top_noise")
noise.nodeX = -700; noise.nodeY = 900
try:
    noise.outputConnectors[0].connect(g)
except Exception as e:
    print(json.dumps({"connect_error": str(e)[:150]}))
    raise SystemExit
code = p1.op("probe_top_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "void main(){\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    vec4 c = texture(sTD2DInputs[0], vUV.uv);\n"
    "    fragColor = vec4(c.rgb * (res.x / 256.0), 1.0);\n"
    "}"
)
g.cook(force=True); noise.cook(force=True)
info = p1.op("probe_top_min_info")
res = {"errors": g.errors(), "g_res": [g.width, g.height],
       "noise_res": [noise.width, noise.height],
       "infoDAT_head": (info.text[:400] if info else None)}
try:
    arr = g.numpyArray()
    res["center_pixel"] = [float(v) for v in arr[arr.shape[0]//2][arr.shape[1]//2][:3]]
except Exception as e:
    res["numpy_error"] = str(e)[:150]
print(json.dumps(res))
''')

    run("D_uniforms", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
code = p1.op("probe_top_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "uniform float u_scale;\n"
    "void main(){ fragColor = vec4(vUV.uv * u_scale, 0.0, 1.0); }"
)
g.par.uniform0name = "u_scale"
g.par.uniform0value1 = "1.5"
try:
    g.par.loaduniformnames.pulse()
except Exception:
    pass
g.cook(force=True)
info = p1.op("probe_top_min_info")
res = {"errors": g.errors(),
       "uniform_names_loaded": (g.par.loaduniformnames.eval() if hasattr(g.par, "loaduniformnames") else None),
       "infoDAT_head": (info.text[:300] if info else None)}
try:
    arr = g.numpyArray()
    h, w = arr.shape[0], arr.shape[1]
    res["sample_right_edge_R"] = float(arr[h//2][w-1][0])  # expect ~1.5 clamped to 1.0 if uv*1.5 > 1
except Exception as e:
    res["numpy_error"] = str(e)[:150]
print(json.dumps(res))
''')

    run("E_output_resolution", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
menu = g.par.outputresolution.menuNames if hasattr(g.par.outputresolution, "menuNames") else None
g.par.outputresolution = "custom"
g.par.resolutionw = 256
g.par.resolutionh = 192
g.cook(force=True)
print(json.dumps({
    "outputresolution_menuNames": menu,
    "set_to": [g.par.resolutionw.eval(), g.par.resolutionh.eval()],
    "errors": g.errors(),
    "g_res": [g.width, g.height],
}))
''')

    run("F_feedback", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
fb = p1.op("probe_top_fb") or p1.create(td.feedbackTOP, "probe_top_fb")
fb_pars = sorted(p.name for p in fb.pars())[:12]
fb.nodeX = -500; fb.nodeY = 700
code = p1.op("probe_top_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "void main(){\n"
    "    vec4 prev = texture(sTD2DInputs[0], vUV.uv);\n"
    "    vec4 base = vec4(vUV.uv, 0.0, 1.0);\n"
    "    fragColor = mix(base, prev, 0.9);\n"
    "}"
)
try:
    g.outputConnectors[0].connect(fb)
except Exception as e:
    print(json.dumps({"wire_g_fb_error": str(e)[:150]}))
try:
    fb.outputConnectors[0].connect(g)
except Exception as e:
    print(json.dumps({"wire_fb_g_error": str(e)[:150]}))
cooks = []
for i in range(6):
    try:
        g.cook(force=True, recurse=True)
    except TypeError:
        g.cook(force=True)
    except Exception:
        pass
    try:
        arr = g.numpyArray()
        cooks.append(round(float(arr[arr.shape[0]//2][arr.shape[1]-1][0]), 4))
    except Exception:
        cooks.append(None)
print(json.dumps({
    "fb_pars_sample": fb_pars,
    "errors": g.errors(),
    "right_edge_R_over_6_cooks": cooks,
    "note": "increasing R at right edge => feedback accumulates (prev mixed at 0.9)",
}))
''')


if __name__ == "__main__":
    main()
