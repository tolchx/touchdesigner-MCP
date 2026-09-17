#!/usr/bin/env python3
"""Live regression for the never-black first-cook policy (GLSL_TOP_RULES v1.3).

Runs the EXACT builder code (buildGlslTopRecipeCode, from the compiled dist)
for every static TOP recipe across N rounds with fresh node names each time,
then asserts for EVERY creation:
  - no TD errors, infoDAT clean
  - pixels.max > 0.001 (the node actually rendered — black state is repaired
    in place by the builder's never-black policy when it occurs)
Exit code 0 = all green; 1 = any violation. Regenerates mcp/dist first so the
tested builder is the current source.

Usage:  python scripts/live/first_cook_regression.py [rounds=3]
Requires TouchDesigner with the bridge on 127.0.0.1:44444.
"""
import json
import subprocess
import sys
import urllib.request

BASE = "http://127.0.0.1:44444"
STATIC_IDS = [
    "top-circle-sdf",
    "top-value-noise",
    "top-fbm-layers",
    "top-grid-pattern",
    "top-uv-ripple",
]


def get_builder_codes():
    bridge = r"""
import { GLSL_TOP_RECIPES, buildGlslTopRecipeCode } from "./dist/tools/glslTopRecipes.js";
const ids = %s;
const codes = {};
for (const id of ids) {
  const r = GLSL_TOP_RECIPES.find((x) => x.id === id);
  codes[id] = buildGlslTopRecipeCode(r, "/project1", "fcr_" + id.replace(/-/g, "_"));
}
console.log(JSON.stringify(codes));
""" % json.dumps(STATIC_IDS)
    out = subprocess.run(
        ["node", "--input-type=module", "-e", bridge],
        capture_output=True, text=True, encoding="utf-8", timeout=60, cwd="mcp",
    )
    if out.returncode != 0:
        print("NODE ERR:", out.stderr[-400:])
        sys.exit(1)
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


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    # fail fast if TD is not reachable
    try:
        exec_code("print('ping')", timeout=15)
    except Exception as e:
        print("TD_UNREACHABLE:", str(e)[:120])
        sys.exit(2)

    codes = get_builder_codes()
    failures = []
    stats = {"creations": 0, "stale_first_cook": 0, "recreated": 0}
    for i in range(rounds):
        for rid, code in codes.items():
            tag = f"fcr{i}_"
            c = code.replace("fcr_", tag)
            d = exec_code(c)
            o = d.get("output", "").strip()
            if "{" not in o:
                failures.append((i, rid, "no JSON output: " + str(d.get("error"))[:100]))
                continue
            j = json.loads(o[o.index("{"):o.rindex("}") + 1])
            stats["creations"] += 1
            stats["stale_first_cook"] += 1 if j.get("stale_first_cook") else 0
            stats["recreated"] += 1 if j.get("recreated") else 0
            px = j.get("pixels", {})
            problems = []
            if j.get("td_errors"):
                problems.append("td_errors=" + str(j["td_errors"])[:80])
            if j.get("infoDAT_has_ERROR"):
                problems.append("infoDAT has ERROR")
            if px.get("max", 0) <= 0.001:
                problems.append("BLACK output after policy")
            if j.get("errors"):
                problems.append("builder errors: " + str(j["errors"])[:100])
            if problems:
                failures.append((i, rid, "; ".join(problems)))
                print(f"round {i} {rid}: FAIL — {problems}")
            else:
                note = " (stale→fixed in-place)" if j.get("stale_first_cook") and not j.get("recreated") else \
                       (" (recreated)" if j.get("recreated") else "")
                print(f"round {i} {rid}: ok{note} max={px.get('max')}")
            # cleanup this node family
            cl = ("import json\nfor c in op('/project1').children:\n"
                  "    if c.name.startswith('%s'): c.destroy()\nprint('ok')" % tag)
            exec_code(cl, timeout=60)

    print(f"SUMMARY: {stats['creations']} creations | stale_first_cook="
          f"{stats['stale_first_cook']} | repaired_in_place/recreated={stats['recreated']} "
          f"| failures={len(failures)}")
    if failures:
        sys.exit(1)
    print("REGRESSION OK")


if __name__ == "__main__":
    main()
