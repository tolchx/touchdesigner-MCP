#!/usr/bin/env python3
"""Live probe round 2: correct pixel-shader uv variants + uniform mechanism."""
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
    # G: which uv access compiles in the PIXEL shader? try each in isolation.
    variants = {
        "st":       "fragColor = vec4(vUV.st, 0.0, 1.0);",
        "xy":       "fragColor = vec4(vUV.xy, 0.0, 1.0);",
        "texcoord": "fragColor = vec4(vUV.texcoord, 0.0, 1.0);",
        "uv1":      "fragColor = vec4(vUV.uv1, 0.0, 1.0);",
    }
    results = {}
    for label, line in variants.items():
        code = (
            "import json\n"
            "p1 = op('/project1')\n"
            "code_dat = p1.op('probe_top_shader')\n"
            "g = p1.op('probe_top_min')\n"
            "code_dat.text = 'layout(location = 0) out vec4 fragColor;\\nvoid main(){ " +
            line.replace("'", "\\'") +
            " }'\n"
            "g.cook(force=True)\n"
            "info = p1.op('probe_top_min_info')\n"
            "err = ''\n"
            "if info and 'ERROR' in info.text:\n"
            "    err = [l for l in info.text.splitlines() if 'ERROR' in l][0][:120]\n"
            "print(json.dumps({'variant': '" + label + "', 'error': err}))\n"
        )
        run("G_uv_" + label, code)

    # H: uniforms — full par dump before/after loaduniformnames pulse
    run("H_uniforms", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
code = p1.op("probe_top_shader")
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "uniform float u_scale;\n"
    "uniform vec2 u_offset;\n"
    "void main(){ fragColor = vec4(vUV.st * u_scale + u_offset, 0.0, 1.0); }"
)
before = sorted(p.name for p in g.pars())
try:
    g.par.loaduniformnames.pulse()
except Exception as e:
    print(json.dumps({"pulse_error": str(e)[:200]}))
after = sorted(p.name for p in g.pars())
new_pars = [p for p in after if p not in before]
new_vals = {}
for np_ in new_pars:
    try:
        new_vals[np_] = str(g.par, ) if False else str(g.par[np_].eval())
    except Exception:
        new_vals[np_] = "?"
print(json.dumps({
    "uniform_page_pars_before": [p for p in before if "uni" in p],
    "new_pars_after_pulse": new_pars,
    "new_par_values": new_vals,
}))
''')

    # I: set u_scale=0.5 through the discovered mechanism placeholder (test after H reveals names)
    run("I_aspect_res", r'''
import json
p1 = op("/project1")
g = p1.op("probe_top_min")
noise = p1.op("probe_top_noise")
code = p1.op("probe_top_shader")
# aspect-correct: use uTD2DInfos[0].res.zw for input aspect
code.text = (
    "layout(location = 0) out vec4 fragColor;\n"
    "void main(){\n"
    "    vec2 res = uTD2DInfos[0].res.zw;\n"
    "    float aspect = res.x / res.y;\n"
    "    vec2 p = vUV.st - 0.5;\n"
    "    p.x *= aspect;\n"
    "    float d = length(p);\n"
    "    float c = smoothstep(0.45, 0.40, d);\n"
    "    fragColor = vec4(vec3(c), 1.0);\n"
    "}"
)
g.par.outputresolution = "useinput"
noise.par.resolutionw = 320
noise.par.resolutionh = 240
g.cook(force=True); noise.cook(force=True)
res = {"errors": g.errors(), "g_res": [g.width, g.height], "noise_res": [noise.width, noise.height]}
try:
    arr = g.numpyArray()
    h, w = arr.shape[0], arr.shape[1]
    # circle is aspect-correct if white region spans proportionally: sample row center
    row = arr[h//2]
    whites = sum(1 for x in range(w) if row[x][0] > 0.5)
    col = arr[:, w//2]
    whites_v = sum(1 for y in range(h) if col[y][0] > 0.5)
    res["white_span_horiz_px"] = whites
    res["white_span_vert_px"] = int(whites_v)
    res["ratio_h_v"] = round(whites / max(whites_v, 1), 3)  # expect ~ (320/240)=1.333 if aspect-correct
except Exception as e:
    res["numpy_error"] = str(e)[:150]
print(json.dumps(res))
''')


if __name__ == "__main__":
    main()
