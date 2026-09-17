#!/usr/bin/env python3
"""Reproduce the EXACT builder output (the code produced by
buildGlslTopRecipeCode, verbatim) across iterations with fresh names to
characterize the black-first-cook failure rate."""
import json
import subprocess
import sys
import urllib.request

NODE_BRIDGE = r"""
import { GLSL_TOP_RECIPES, buildGlslTopRecipeCode } from "./dist/tools/glslTopRecipes.js";
const ids = ["top-circle-sdf", "top-value-noise", "top-fbm-layers", "top-grid-pattern", "top-uv-ripple"];
const codes = {};
for (const id of ids) {
  const r = GLSL_TOP_RECIPES.find((x) => x.id === id);
  codes[id] = buildGlslTopRecipeCode(r, "/project1", "acc_" + id.replace(/-/g, "_"));
}
console.log(JSON.stringify(codes));
"""

out = subprocess.run(
    ["node", "--input-type=module", "-e", NODE_BRIDGE],
    capture_output=True, text=True, encoding="utf-8", timeout=60, cwd="mcp",
)
if out.returncode != 0:
    print("NODE ERR:", out.stderr[-300:]); sys.exit(1)
codes = json.loads(out.stdout.strip().splitlines()[-1])

N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
summary = {}
for i in range(N):
    round_res = {}
    for rid, code in codes.items():
        tag = f"r{i}"
        c = code.replace("acc_", f"acc{tag}_")
        req = urllib.request.Request(
            "http://127.0.0.1:44444/exec",
            data=json.dumps({"code": c}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.loads(r.read().decode())
            o = d.get("output", "").strip()
            j = json.loads(o[o.index("{"):o.rindex("}") + 1]) if "{" in o else {}
            px = j.get("pixels", {})
            black = px.get("max", 0) <= 0.001 and not j.get("recreated")
            fixed = bool(j.get("recreated"))
            round_res[rid] = "BLACK" if black else ("FIXED" if fixed else "ok")
        except Exception as e:
            round_res[rid] = "EXC:" + str(e)[:60]
        # cleanup this iteration's nodes
        cl = ("import json\nfor c in op('/project1').children:\n"
              "    if c.name.startswith('acc%s_'): c.destroy()\nprint('ok')" % tag)
        req = urllib.request.Request(
            "http://127.0.0.1:44444/exec",
            data=json.dumps({"code": cl}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            r.read()
    summary[f"round{i}"] = round_res
    print(f"round {i}:", json.dumps(round_res))

blacks = [1 for rd in summary.values() for v in rd.values() if v == "BLACK"]
fixed = [1 for rd in summary.values() for v in rd.values() if v == "FIXED"]
print(f"TOTAL: {N*5} creations | black={len(blacks)} | fixed_by_recreate={len(fixed)}")
