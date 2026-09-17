#!/usr/bin/env python3
"""RD evolution probe (Regla TOP 10 verification with real frames).

1. Build the reaction-diffusion network via the REAL builder code.
2. Snapshot pixels at t0 / t+1.0s / t+2.5s (real frames between snapshots).
3. Metrics: mean diff, active-pixel count, max — evolution = values change.
4. Contrast: two cook(force=True) INSIDE one exec must NOT change pixels.
"""
import json
import subprocess
import sys
import time
import urllib.request

BASE = "http://127.0.0.1:44444"


def get_builder_code():
    bridge = r"""
import { GLSL_TOP_RECIPES, buildGlslTopRecipeCode } from "./dist/tools/glslTopRecipes.js";
const r = GLSL_TOP_RECIPES.find((x) => x.id === "top-reaction-diffusion");
console.log(JSON.stringify(buildGlslTopRecipeCode(r, "/project1", "rd_probe")));
"""
    out = subprocess.run(
        ["node", "--input-type=module", "-e", bridge],
        capture_output=True, text=True, encoding="utf-8", timeout=60, cwd="mcp",
    )
    if out.returncode != 0:
        print("NODE ERR:", out.stderr[-300:]); sys.exit(1)
    return json.loads(out.stdout.strip().splitlines()[-1])


def exec_code(code, timeout=180):
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


SNAP = '''import json
n = op('/project1/rd_probe')
assert n is not None, 'rd node missing'
n.cook(force=True)
a = n.numpyArray()
g = a[:, :, :3].mean(axis=2)
print(json.dumps({
    'frame': int(absTime.frame),
    'mean': round(float(g.mean()), 5),
    'max': round(float(g.max()), 5),
    'active': int((g > 0.05).sum()),
    'p90': round(float(__import__('numpy').percentile(g, 90)), 5),
}))
'''

# build
code = get_builder_code().replace("rd_probe_", "rdp_")
d = exec_code(code)
o = d.get("output", "").strip()
j = json.loads(o[o.index("{"):o.rindex("}") + 1])
print("build:", {"created": j.get("created"), "errors": j.get("errors"),
                 "td_errors": j.get("td_errors"), "feedback": j.get("feedback")})
if j.get("errors"):
    sys.exit(1)

# evolution snapshots separated by REAL time
snaps = []
for i, wait in enumerate([0, 1.0, 2.5]):
    if i:
        time.sleep(wait)
    s = exec_code(SNAP)
    snaps.append(json.loads(s.get("output", "").strip()))

# contrast: intra-exec double forced cook (no real frames between reads)
CONTRAST = '''import json
n = op('/project1/rd_probe')
n.cook(force=True)
a1 = n.numpyArray()[:, :, :3].mean()
n.cook(force=True)
a2 = n.numpyArray()[:, :, :3].mean()
print(json.dumps({'read1': round(float(a1), 5), 'read2': round(float(a2), 5),
                  'identical': bool(abs(float(a1) - float(a2)) < 1e-6)}))
'''
c = exec_code(CONTRAST)
contrast = json.loads(c.get("output", "").strip())

print("snapshots:", json.dumps(snaps))
d1 = abs(snaps[1]["mean"] - snaps[0]["mean"])
d2 = abs(snaps[2]["mean"] - snaps[1]["mean"])
print(f"evolution t0->t1: mean diff {d1:.5f} | t1->t2: {d2:.5f}")
print(f"active px: {snaps[0]['active']} -> {snaps[1]['active']} -> {snaps[2]['active']}")
print("intra-exec forced double cook identical:", contrast["identical"],
      f"(reads {contrast['read1']} vs {contrast['read2']})")

verdict = {
    "evolves_with_real_frames": d1 > 1e-4 or d2 > 1e-4,
    "forced_cook_static": contrast["identical"],
}
print("VERDICT:", json.dumps(verdict))

# cleanup
exec_code("import json\nfor c in op('/project1').children:\n"
          "    if c.name.startswith('rdp_'): c.destroy()\nprint('ok')", timeout=60)
print("cleaned")
