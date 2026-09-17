/**
 * Live acceptance test for the two new MCP tools (item 31 closure evidence).
 * Calls the REAL registered tool handlers (real McpServer registration shape)
 * with a REAL TDClient against the live TD bridge on :44444.
 *
 * Run: node scripts/live/test_top_tools_live.mjs
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TDClient } from "../../api/dist/index.js";

const mcpRoot = new URL("../../mcp/dist/", import.meta.url);

// Import the compiled tool module directly (same file the server registers).
const { registerGlslTopTools } = await import(
  new URL("./tools/glslTopApply.js", mcpRoot)
);

// Capture the registerTool calls instead of wiring a full transport: the
// handlers are the same functions the real server exposes.
const tools = new Map();
const server = {
  registerTool(name, spec, handler) {
    tools.set(name, { spec, handler });
  },
};
registerGlslTopTools(
  server,
  new TDClient({ host: "127.0.0.1", port: 44444, transport: "http" })
);

async function call(name, args) {
  const res = await tools.get(name).handler(args);
  return {
    isError: res.isError ?? false,
    payload: JSON.parse(res.content[0].text),
  };
}

console.log("=== 1) td_glsl_top_analyze — shader that reads output-style vUV.uv ===");
const bad = await call("td_glsl_top_analyze", {
  shader:
    "layout(location = 0) out vec4 fragColor;\nvoid main(){ fragColor = vec4(vUV.uv, 0.0, 1.0); }",
});
console.log("isError:", bad.isError);
console.log("problems:", JSON.stringify(bad.payload.problems, null, 2));

console.log("\n=== 2) td_glsl_top_analyze — clean circle shader ===");
const good = await call("td_glsl_top_analyze", {
  shader: `layout(location = 0) out vec4 fragColor;
void main(){ vec2 p = vUV.st - 0.5; p.x *= 1.7777; fragColor = vec4(vec3(smoothstep(0.3, 0.25, length(p))), 1.0); }`,
});
console.log("isError:", good.isError);
console.log("problems:", good.payload.problems);
console.log("analysis:", JSON.stringify(good.payload.analysis));

console.log("\n=== 3) td_glsl_top_recipe — create top-circle-sdf live ===");
const rec = await call("td_glsl_top_recipe", {
  recipe_id: "top-circle-sdf",
  parent_path: "/project1",
  name: "tool_circle",
});
console.log("isError:", rec.isError);
console.log("message:", rec.payload.message ?? rec.payload.error);
if (rec.payload.exec_output) {
  console.log("exec_output:", String(rec.payload.exec_output).slice(0, 200));
}

console.log("\n=== 4) pixel check on the live node ===");
const client = new TDClient({
  host: "127.0.0.1",
  port: 44444,
  transport: "http",
});
const px = await client.execute(
  `import json
n = op('/project1/tool_circle')
assert n is not None, 'node missing'
n.cook(force=True)
arr = n.numpyArray()
h, w = arr.shape[0], arr.shape[1]
center = arr[h//2, w//2][:3].mean()
corner = arr[2, 2][:3].mean()
print(json.dumps({'res': [w, h], 'center_mean': round(float(center), 3), 'corner_mean': round(float(corner), 3)}))`
);
console.log(px.stdout);

console.log("\n=== 5) cleanup probe node ===");
await client.execute(`op('/project1/tool_circle').destroy()`);
console.log("cleaned");
