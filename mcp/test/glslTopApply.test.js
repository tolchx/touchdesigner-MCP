/**
 * Offline tests for the GLSL TOP MCP tools (mcp/src/tools/glslTopApply.ts):
 *   - td_glsl_top_analyze: static analysis + pre-validation of TOP shaders
 *     (T1 fragColor, T2 vUV.uv, T4 uniform0name, T9 infoDAT pointer)
 *   - td_glsl_top_recipe: unknown-id error without TD, safety-net self-check,
 *     creation via a single client.execute, feedback caveat in the message
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/glslTopApply.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { registerGlslTopTools } from "../dist/tools/glslTopApply.js";
import { GLSL_TOP_RECIPES } from "../dist/tools/glslTopRecipes.js";

/** Minimal McpServer double capturing registerTool calls. */
function makeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, spec, handler) {
      tools.set(name, { spec, handler });
    },
  };
}

/** TDClient double whose execute() returns the given result and counts calls. */
function makeClient(result = { success: true, output: "res = {...}" }) {
  let calls = 0;
  const client = {
    calls: () => calls,
    execute: async (_code) => {
      calls++;
      return result;
    },
  };
  return client;
}

/** Invoke a registered tool handler through the SDK result shape. */
async function callTool(server, name, args) {
  const entry = server.tools.get(name);
  assert.ok(entry, "tool " + name + " must be registered");
  return entry.handler(args);
}

/** Extract the structured payload from a CallToolResult. */
function payload(res) {
  return JSON.parse(res.content[0].text);
}

const GOOD_TOP = `layout(location = 0) out vec4 fragColor;
uniform float u_scale;
void main() {
  vec2 uv = vUV.st;
  fragColor = vec4(vec3(uv.x * u_scale), 1.0);
}`;

const BAD_TOP = `layout(location = 0) out vec4 fragColor;
void main() {
  fragColor = vec4(vUV.uv, 0.0, 1.0);
}`;

describe("td_glsl_top_analyze", () => {
  it("is registered with a schema and analyzes a clean shader", async () => {
    const server = makeServer();
    registerGlslTopTools(server, makeClient());
    const res = await callTool(server, "td_glsl_top_analyze", {
      shader: GOOD_TOP,
    });
    assert.equal(res.isError, undefined);
    const data = payload(res);
    assert.deepEqual(data.problems, null);
    assert.equal(data.analysis.has_main, true);
    assert.equal(data.analysis.has_fragcolor_out, true);
    assert.deepEqual(data.analysis.bad_uv_swizzles, []);
  });

  it("flags vUV.uv with the .st/.xy fix (T2) via problems", async () => {
    const server = makeServer();
    registerGlslTopTools(server, makeClient());
    const res = await callTool(server, "td_glsl_top_analyze", {
      shader: BAD_TOP,
    });
    const data = payload(res);
    assert.equal(res.isError, undefined);
    assert.ok(data.problems.length >= 1);
    assert.match(data.problems[0], /Regla TOP 2/);
    assert.match(data.problems[0], /vUV\.uv/);
    assert.match(data.analysis.bad_uv_swizzles[0], /\.uv/);
  });

  it("flags missing fragColor output (T1) and missing main", async () => {
    const server = makeServer();
    registerGlslTopTools(server, makeClient());
    const res = await callTool(server, "td_glsl_top_analyze", {
      shader: "vec2 helper(vec2 p) { return p * 2.0; }",
    });
    const data = payload(res);
    assert.equal(data.analysis.has_fragcolor_out, false);
    assert.equal(data.analysis.has_main, false);
    assert.ok(data.problems.length >= 2);
    assert.match(data.problems.join(" "), /Regla TOP 1/);
    assert.match(data.problems.join(" "), /void main/);
  });

  it("T4: uniform0name in creation code is flagged with the vec0* recipe", async () => {
    const server = makeServer();
    registerGlslTopTools(server, makeClient());
    const res = await callTool(server, "td_glsl_top_analyze", {
      shader: GOOD_TOP,
      creation_code: "g.par.uniform0name = 'u_scale'",
    });
    const data = payload(res);
    assert.equal(data.analysis.uses_uniform0name_risk, true);
    assert.match(data.problems.join(" "), /Regla TOP 4/);
    assert.match(data.problems.join(" "), /vec0/);
  });

  it("malformed input returns isError, never throws", async () => {
    const server = makeServer();
    registerGlslTopTools(server, makeClient());
    const res = await callTool(server, "td_glsl_top_analyze", {});
    assert.equal(res.isError, true);
  });
});

describe("td_glsl_top_recipe", () => {
  it("unknown recipe_id errors WITHOUT calling TD, listing available ids", async () => {
    const client = makeClient();
    const server = makeServer();
    registerGlslTopTools(server, client);
    const res = await callTool(server, "td_glsl_top_recipe", {
      recipe_id: "nope",
    });
    assert.equal(res.isError, true);
    assert.equal(client.calls(), 0);
    assert.match(payload(res).error, /Available: top-/);
  });

  it("creates a static recipe via a single client.execute and reports the path", async () => {
    const client = makeClient({ success: true, output: "res = {...}" });
    const server = makeServer();
    registerGlslTopTools(server, client);
    const res = await callTool(server, "td_glsl_top_recipe", {
      recipe_id: "top-circle-sdf",
      parent_path: "/project1",
      name: "vis_circle",
    });
    assert.equal(res.isError, undefined);
    assert.equal(client.calls(), 1);
    const data = payload(res);
    assert.match(data.message, /vis_circle/);
    assert.match(data.creation_code, /create\(td\.glslTOP/);
    assert.match(data.creation_code, /pixeldat/);
    assert.equal(data.recipe_id, "top-circle-sdf");
  });

  it("feedback recipe message mentions the T10 scripted-cook caveat", async () => {
    const client = makeClient();
    const server = makeServer();
    registerGlslTopTools(server, client);
    const fb = GLSL_TOP_RECIPES.find((r) => r.realtimeOnly);
    assert.ok(fb, "at least one realtimeOnly recipe expected");
    const res = await callTool(server, "td_glsl_top_recipe", {
      recipe_id: fb.id,
      parent_path: "/project1",
    });
    assert.equal(res.isError, undefined);
    assert.match(payload(res).message, /T10/);
  });

  it("client.execute failure surfaces as an explicit tool error", async () => {
    const client = makeClient({ success: false, error: { message: "boom" } });
    const server = makeServer();
    registerGlslTopTools(server, client);
    const res = await callTool(server, "td_glsl_top_recipe", {
      recipe_id: "top-circle-sdf",
    });
    assert.equal(res.isError, true);
    assert.match(payload(res).error, /boom/);
  });
});
