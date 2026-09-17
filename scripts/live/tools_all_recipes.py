#!/usr/bin/env python3
"""Live acceptance: all 5 static recipes through the td_glsl_top_recipe tool."""
import json
import subprocess
import urllib.request

NODE_BRIDGE = r"""
import { registerGlslTopTools } from "./mcp/dist/tools/glslTopApply.js";
const calls = [];
const server = { registerTool: (name, _s, handler) => calls.push({ name, handler }) };
const { TDClient } = await import("file:///C:/Users/Tolch/Documents/AI_Code/Touchdesigner_MCP/Main/api/dist/index.js");
const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http" });
registerGlslTopTools(server, client);
const ids = ["top-circle-sdf", "top-value-noise", "top-fbm-layers", "top-grid-pattern", "top-uv-ripple"];
const out = [];
for (const id of ids) {
  const res = await calls.find((c) => c.name === "td_glsl_top_recipe").handler({
    recipe_id: id, parent_path: "/project1", name: "acc_" + id.replace(/-/g, "_"),
  });
  const body = JSON.parse(res.content[0].text);
  let pixels = null;
  if (body.exec_output) {
    try {
      const m = body.exec_output.match(/\{.*\}/);
      pixels = m ? JSON.parse(m[0]).pixels : null;
    } catch {}
  }
  out.push({ id, isError: res.isError ?? false, message: body.message ?? body.error, pixels });
}
console.log(JSON.stringify(out));
"""

req = urllib.request.Request(
    "http://127.0.0.1:44444/exec",
    data=json.dumps({"code": "print('ping')"}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=30) as r:
    r.read()

out = subprocess.run(
    ["node", "--input-type=module", "-e", NODE_BRIDGE],
    capture_output=True, text=True, encoding="utf-8", timeout=300,
)
if out.returncode != 0:
    print("NODE FAILED:", out.stderr[-500:])
    raise SystemExit(1)

results = json.loads(out.stdout.strip().splitlines()[-1])
ok = True
for r in results:
    px = r["pixels"] or {}
    content_ok = px.get("max", 0) > 0.05
    status = "OK " if (not r["isError"] and content_ok) else "FAIL"
    if status == "FAIL":
        ok = False
    print(f"[{status}] {r['id']}: err={r['isError']} pixels.max={px.get('max')} center={px.get('center')}")
    if not r["isError"] and not content_ok:
        print("   message:", str(r["message"])[:160])

print("ALL OK" if ok else "SOME FAILED")
