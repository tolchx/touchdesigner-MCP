#!/usr/bin/env python3
"""Live visual verification of the 7 GLSL TOP recipes (pixel-level asserts).

Run after scripts/live/run_all.py has created the networks in /project1.
"""
import json
import urllib.request

BASE = "http://127.0.0.1:44444"

VERIFY = r'''
import json
out = {}

def arr_of(name):
    t = op("/project1/" + name)
    return t.numpyArray()

# 1. circle: aspect-correct spans + center/corner contrast
a = arr_of("vis_circle_sdf")
h, w = a.shape[0], a.shape[1]
row = a[h // 2]
whites_h = sum(1 for x in range(w) if row[x][0] > 0.5)
col = a[:, w // 2]
whites_v = sum(1 for y in range(h) if col[y][0] > 0.5)
out["circle"] = {
    "white_span_h": whites_h, "white_span_v": int(whites_v),
    "aspect_ratio": round(whites_h / max(whites_v, 1), 3),
    "center_white": bool(a[h // 2][w // 2][0] > 0.9),
    "corner_black": bool(a[4][4][0] < 0.1),
    "ok": abs(whites_h / max(whites_v, 1) - 1.0) < 0.1
          and a[h // 2][w // 2][0] > 0.9 and a[4][4][0] < 0.1,
}

# 2. value noise: grayscale variance (structured, not flat)
a = arr_of("vis_value_noise")
out["value_noise"] = {
    "min": round(float(a.min()), 3), "max": round(float(a.max()), 3),
    "std": round(float(a[:, :, 0].std()), 3),
    "ok": float(a[:, :, 0].std()) > 0.05 and float(a.max()) > 0.7 and float(a.min()) < 0.4,
}

# 3. fbm: soft fractal cloud (variance moderate, no hard bands)
a = arr_of("vis_fbm_layers")
out["fbm"] = {
    "min": round(float(a.min()), 3), "max": round(float(a.max()), 3),
    "std": round(float(a[:, :, 0].std()), 3),
    "ok": 0.03 < float(a[:, :, 0].std()) < 0.45,
}

# 4. grid: count brightness transitions along the central row (2*u_scale crossings)
a = arr_of("vis_grid_pattern")
h, w = a.shape[0], a.shape[1]
row = [1 if a[h // 2][x][0] > 0.5 else 0 for x in range(w)]
transitions = sum(1 for x in range(1, w) if row[x] != row[x - 1])
out["grid"] = {
    "transitions": transitions,
    "ok": 14 <= transitions <= 18,  # 8 cells -> 16 edge crossings
}

# 5. ripple: oscillating radial profile -> count bright rings along the radius
a = arr_of("vis_uv_ripple")
h, w = a.shape[0], a.shape[1]
rad = [a[h // 2][x][0] for x in range(w // 2 + 1, w)]
peaks = sum(1 for i in range(2, len(rad) - 2)
            if rad[i] > rad[i - 1] and rad[i] >= rad[i + 1] and rad[i] > 0.5)
out["ripple"] = {
    "bright_rings_on_radius": peaks,
    "max": round(float(a.max()), 3),
    "ok": peaks >= 2 and float(a.max()) > 0.9,
}

# 6/7. feedback recipes: wiring + compile only (Regla TOP 10)
for name in ("vis_feedback_trails", "vis_reaction_diffusion"):
    g = op("/project1/" + name)
    fb = op("/project1/" + name + "_fb")
    wired = fb is not None and [i.name for i in g.inputs] == [fb.name] \
        and [i.name for i in fb.inputs] == [g.name]
    out[name] = {"wired": bool(wired), "errors": g.errors(),
                 "ok": bool(wired) and g.errors() == ""}

print(json.dumps(out))
'''


def post_exec(code: str) -> dict:
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def main() -> int:
    res = post_exec(VERIFY)
    out = json.loads(res.get("output", "{}"))
    all_ok = True
    for k, v in out.items():
        all_ok &= bool(v.get("ok"))
        print("%-24s %s  %s" % (k, "PASS" if v.get("ok") else "FAIL",
                                json.dumps({kk: vv for kk, vv in v.items() if kk != "ok"})))
    print("VISUAL VERIFICATION: %s" % ("ALL OK" if all_ok else "FAILURES"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
