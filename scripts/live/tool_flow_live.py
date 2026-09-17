#!/usr/bin/env python3
"""Live acceptance for the two new tools (item 31 closure evidence).

1) td_glsl_top_analyze handler: vUV.uv shader -> flags Regla TOP 2.
2) td_glsl_top_analyze handler: clean shader   -> problems: null.
3) td_glsl_top_recipe handler (top-circle-sdf) -> single /exec creation.
4) v1.1 recreate workaround + pixel check      -> white circle spans.
5) cleanup.

Run: python scripts/live/tool_flow_live.py   (mcp/dist must be built)
"""
import json
import subprocess
import sys
import urllib.request

BASE = "http://127.0.0.1:44444"

NODE_BRIDGE = r"""
import { registerGlslTopTools } from "./mcp/dist/tools/glslTopApply.js";

const calls = [];
const server = {
  registerTool: (name, _spec, handler) => calls.push({ name, handler }),
};
const { TDClient } = await import(
  "file:///C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/api/dist/index.js"
);
const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http" });
registerGlslTopTools(server, client);

async function run(name, args) {
  const res = await calls.find((c) => c.name === name).handler(args);
  return { isError: res.isError ?? false, body: res.content[0].text };
}

// 1) bad shader
const bad = await run("td_glsl_top_analyze", {
  shader: "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(vUV.uv, 0.0, 1.0); }",
});
// 2) clean shader
const good = await run("td_glsl_top_analyze", {
  shader: `layout(location = 0) out vec4 fragColor;
void main(){ vec2 p = vUV.st - 0.5; p.x *= 1.7777; fragColor = vec4(vec3(smoothstep(0.3, 0.25, length(p))), 1.0); }`,
});
// 3) recipe creation (the tool's /exec round-trip)
const rec = await run("td_glsl_top_recipe", {
  recipe_id: "top-circle-sdf",
  parent_path: "/project1",
  name: "tool_circle",
});
console.log(JSON.stringify({ bad: JSON.parse(bad.body), good: JSON.parse(good.body), rec: JSON.parse(rec.body) }));
"""

BAD = {"shader": "vUV.uv probe"}
GOOD = {"analysis": "clean probe"}


def post_exec(code):
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": code}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode())
    return d


# ─── Steps 1-3 via the real compiled handlers ────────────────────────────────
out = subprocess.run(
    ["node", "--input-type=module", "-e", NODE_BRIDGE],
    capture_output=True,
    text=True,
    encoding="utf-8",
    timeout=120,
)
if out.returncode != 0:
    print("NODE BRIDGE FAILED:", out.stderr[-500:])
    sys.exit(1)
data = json.loads(out.stdout.strip().splitlines()[-1])

print("=== 1) analyze vUV.uv ===")
bad = data["bad"]
print("keys:", sorted(bad.keys()))
print(json.dumps(bad, indent=1)[:400])

print("=== 2) analyze clean ===")
print(json.dumps(data["good"], indent=1)[:400])

print("=== 3) recipe top-circle-sdf ===")
rec = data["rec"]
print(json.dumps(rec, indent=1)[:600])

# ─── Step 4: v1.1 recreate workaround + pixel check ─────────────────────────
recreate = r'''
import json
res = {}
old = op('/project1/tool_circle')
if old: old.destroy()
code = op('/project1/tool_circle_code')
if code is None:
    code = op('/project1/tool_circle_code2')
assert code is not None and code.text.strip(), 'shader DAT missing'
g = op('/project1').create(td.glslTOP, 'tool_circle2')
g.par.pixeldat = code.name
g.par.outputresolution = 'custom'
g.par.resolutionw = 256
g.par.resolutionh = 256
g.cook(force=True)
a = g.numpyArray()
h, w = a.shape[0], a.shape[1]
row = a[h // 2]
col = a[:, w // 2]
whites_h = sum(1 for x in range(w) if row[x][0] > 0.5)
whites_v = sum(1 for y in range(h) if col[y][0] > 0.5)
res['center'] = round(float(a[h//2][w//2][0]), 3)
res['span_h'] = whites_h
res['span_v'] = whites_v
res['min'] = round(float(a.min()), 3)
res['max'] = round(float(a.max()), 3)
res['err'] = g.errors(recurse=False)
print(json.dumps(res))
'''
d = post_exec(recreate)
print("=== 4) recreate + pixel check ===")
print(d.get("output", "").strip()[:300])

# ─── Step 5: cleanup ─────────────────────────────────────────────────────────
post_exec(
    "import json\nfor n in ['tool_circle_code','tool_circle_code2','tool_circle2']:\n"
    "    o = op('/project1/'+n)\n    if o: o.destroy()\nprint('cleaned')"
)
print("=== 5) cleanup done ===")
