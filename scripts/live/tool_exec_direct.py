#!/usr/bin/env python3
"""Run the tool-generated creation code directly and show full result JSON."""
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
const res = await calls.find((c) => c.name === "td_glsl_top_recipe").handler({
  recipe_id: "top-circle-sdf", parent_path: "/project1", name: "tool_circle",
});
const body = JSON.parse(res.content[0].text);
console.log(JSON.stringify({ isError: res.isError ?? false, message: body.message, exec_output: body.exec_output }));
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
    capture_output=True, text=True, encoding="utf-8", timeout=150,
)
if out.returncode != 0:
    print("NODE FAILED:", out.stderr[-400:])
    raise SystemExit(1)

d = json.loads(out.stdout.strip().splitlines()[-1])
print("tool isError:", d["isError"])
print("tool message:", d["message"])
print("--- tool exec_output (parsed) ---")
print(d["exec_output"][:900])
