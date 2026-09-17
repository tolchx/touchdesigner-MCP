#!/usr/bin/env python3
"""Live verification for item 32 (optional per scope): create one curriculum
shader in TD and pixel-verify; then run the tool's get/path actions offline.

Run: python scripts/live/curriculum_live.py   (TD on :44444 optional)
"""
import json
import subprocess
import urllib.request

BASE = "http://127.0.0.1:44444"

SHADER = open("glsl_files/recipe_t1_circle_sdf.glsl", encoding="utf-8").read()

CODE = f'''import json
res = {{}}
p1 = op("/project1")
for c in [c for c in p1.children if c.name.startswith("curr_")]:
    c.destroy()
code = p1.create(td.textDAT, "curr_t1_code")
code.text = {json.dumps(SHADER)}
g = p1.create(td.glslTOP, "curr_t1")
g.par.pixeldat = code.name
g.par.outputresolution = "custom"
g.par.resolutionw = 256
g.par.resolutionh = 256
g.par.vec0name = "u_radius"
g.par.vec0valuex = 0.42
g.cook(force=True)
a = g.numpyArray()
row = a[a.shape[0]//2]
res["center"] = round(float(a[128][128][0]), 3)
res["corner"] = round(float(a[4][4][0]), 3)
res["first_white"] = next((i for i in range(256) if row[i][0] > 0.5), -1)
res["err"] = g.errors(recurse=False)
for n in ["curr_t1", "curr_t1_code"]:
    o = op("/project1/" + n)
    if o: o.destroy()
print(json.dumps(res))
'''


def td_live():
    req = urllib.request.Request(
        BASE + "/exec",
        data=json.dumps({"code": CODE}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.loads(r.read().decode())
    print("=== live TD: curriculum top-01 shader ===")
    print(d.get("output", "").strip()[:300])
    print("error:", str(d.get("error"))[:200])


NODE_BRIDGE = r"""
import { registerGlslCurriculumTools } from "./dist/tools/glslCurriculum.js";
const calls = [];
const server = { registerTool: (n, _s, h) => calls.push({ n, h }) };
registerGlslCurriculumTools(server);
const run = async (args) => {
  const res = await calls.find((c) => c.n === "td_glsl_curriculum").h(args);
  return JSON.parse(res.content[0].text);
};
const get = await run({ action: "get", id: "top-07-generative-reaction-diffusion" });
const path = await run({ action: "path", goal: "estelas con feedback" });
console.log(JSON.stringify({
  get_title: get.entry.titulo_es,
  get_shader: get.entry.shader_td,
  path_steps: path.steps.map((s) => s.id),
}));
"""

print("=== offline tool: get + path ===")
out = subprocess.run(
    ["node", "--input-type=module", "-e", NODE_BRIDGE],
    capture_output=True, text=True, encoding="utf-8", timeout=60, cwd="mcp",
)
print(out.stdout.strip()[:600] if out.returncode == 0 else "NODE ERR: " + out.stderr[-300:])

try:
    td_live()
except Exception as e:
    print("TD not available for live check (offline verification stands):", str(e)[:120])
