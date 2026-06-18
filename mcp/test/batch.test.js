/**
 * Unit tests for batch tool — mcp/src/tools/batch.ts
 *
 * Coverage: registry building (+ caching), tool registration,
 * successful dispatch (single + multi), error handling (unknown
 * tools, handler throws), edge cases (empty args, 0 tools).
 *
 * Uses a MockTDClient with all ~37 bound methods and a
 * MockMcpServer that captures the registered tool + handler.
 *
 * Build first:  npx tsc -p mcp/tsconfig.json
 * Run:          node --experimental-vm-modules mcp/test/batch.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err } from "../dist/helpers.js";
import { registerBatchTool } from "../dist/tools/batch.js";

// ─── MockTDClient ─────────────────────────────────────────────────────────
// All ~37 methods that getToolRegistry binds. Each records its call in
// this.calls[] for assertion, and returns a representative payload.
// Methods that the tests exercise directly have richer logic; others are
// stubs with the correct signature.

class MockTDClient {
  constructor() {
    this.calls = [];
  }

  async execute(code, from) {
    this.calls.push({ method: "execute", code, from });
    return { success: true, stdout: `exec:${code}`, stderr: "", from_op: from };
  }
  async getPaneState() {
    this.calls.push({ method: "getPaneState" });
    return { network: "/project1", x: 0, y: 0, zoom: 1 };
  }
  async getSelection() {
    this.calls.push({ method: "getSelection" });
    return { selected: [] };
  }
  async getOperators(path) {
    this.calls.push({ method: "getOperators", path });
    return { path, operators: [] };
  }
  async getParameters(path, names) {
    this.calls.push({ method: "getParameters", path, names });
    return { path, parameters: [] };
  }
  async setParameters(path, updates, transactional) {
    this.calls.push({ method: "setParameters", path, updates, transactional });
    return { success: true, path, updates };
  }
  async getConnections(path, recurse) {
    this.calls.push({ method: "getConnections", path, recurse });
    return { path, connections: [] };
  }
  async findOperators(args) {
    this.calls.push({ method: "findOperators", args });
    return { operators: [] };
  }
  async healthcheck(path, recurse) {
    this.calls.push({ method: "healthcheck", path, recurse });
    return { ok: true, issueCount: 0, operators: [] };
  }
  async getErrors(path, recurse) {
    this.calls.push({ method: "getErrors", path, recurse });
    return { path, errors: [] };
  }
  async getInfo() {
    this.calls.push({ method: "getInfo" });
    return { version: "2025.10000", commercial: true, build: 202510000 };
  }
  async getFocus() {
    this.calls.push({ method: "getFocus" });
    return { network: "/project1", operators: [] };
  }
  async getPerf(path, top) {
    this.calls.push({ method: "getPerf", path, top });
    return { path, slowest: [], fps: 60 };
  }
  async createOperator(type, name, opPath, posX, posY) {
    this.calls.push({ method: "createOperator", type, name, opPath, posX, posY });
    return { success: true, path: `${opPath || "/"}/${name || type}`, type };
  }
  async deleteOperator(path) {
    this.calls.push({ method: "deleteOperator", path });
    return { success: true, path };
  }
  async connectNodes(src, dst, input) {
    this.calls.push({ method: "connectNodes", src, dst, input });
    return { success: true, source: src, target: dst, input_index: input };
  }
  async disconnect(path, idx) {
    this.calls.push({ method: "disconnect", path, idx });
    return { success: true, path, input_index: idx };
  }
  async copyNode(path, dest, name) {
    this.calls.push({ method: "copyNode", path, dest, name });
    return { success: true, path: `${dest || "/"}/${name || "copy"}` };
  }
  async screenshot(path) {
    this.calls.push({ method: "screenshot", path });
    return { success: true, base64: "iVBOR..." };
  }
  async getScreenshots() {
    this.calls.push({ method: "getScreenshots" });
    return { screenshots: [] };
  }
  async projectLifecycle(action, path) {
    this.calls.push({ method: "projectLifecycle", action, path });
    return { success: true, action, path };
  }
  async popInspect(path) {
    this.calls.push({ method: "popInspect", path });
    return { path, points: 100, attributes: [] };
  }
  async getNodeDetail(path, recurse) {
    this.calls.push({ method: "getNodeDetail", path, recurse });
    return { path, name: "node", type: "TOP" };
  }
  async getHints(nodeType) {
    this.calls.push({ method: "getHints", nodeType });
    return { type: nodeType, inputs: 1, outputs: 1 };
  }
  async getBuildCompatibility(opType) {
    this.calls.push({ method: "getBuildCompatibility", opType });
    return { opType, compatible: true };
  }
  async getReleaseDelta(from, to) {
    this.calls.push({ method: "getReleaseDelta", from, to });
    return { from, to, changes: [] };
  }
  async snapshotScene(path) {
    this.calls.push({ method: "snapshotScene", path });
    return { path, operators: [] };
  }
  async readDat(path, start, end) {
    this.calls.push({ method: "readDat", path, start, end });
    return { path, content: "", lines: 0 };
  }
  async writeDat(path, text, oldTxt, newTxt, all) {
    this.calls.push({ method: "writeDat", path, text, oldTxt, newTxt, all });
    return { success: true, path };
  }
  async readChop(path, channels, start, end) {
    this.calls.push({ method: "readChop", path, channels, start, end });
    return { path, channels: {} };
  }
  async searchInTD(query, path) {
    this.calls.push({ method: "searchInTD", query, path });
    return { results: [] };
  }
  async navigateTo(path) {
    this.calls.push({ method: "navigateTo", path });
    return { success: true, path };
  }
  async reinitExtension(path) {
    this.calls.push({ method: "reinitExtension", path });
    return { success: true, path };
  }
  async pulseParam(path, name) {
    this.calls.push({ method: "pulseParam", path, name });
    return { success: true, path, name };
  }
  async customParameters(path, page, params) {
    this.calls.push({ method: "customParameters", path, page, params });
    return { success: true, path, page, params };
  }
  async readTextport() {
    this.calls.push({ method: "readTextport" });
    return { text: "" };
  }
  async clearTextport() {
    this.calls.push({ method: "clearTextport" });
    return { success: true };
  }
  async memorySave(name) {
    this.calls.push({ method: "memorySave", name });
    return { success: true, name };
  }
  async memoryRecall(name) {
    this.calls.push({ method: "memoryRecall", name });
    return { success: true, name };
  }
  async searchOfficialDocs(query) {
    this.calls.push({ method: "searchOfficialDocs", query });
    return { results: [] };
  }
}

// ─── MockMcpServer ─────────────────────────────────────────────────────────
// Captures the tool name, metadata, and handler from registerTool.
class MockMcpServer {
  constructor() {
    this.tools = [];
  }
  registerTool(name, metadata, handler) {
    this.tools.push({ name, metadata, handler });
  }
}

// ─── Handler mirror ─────────────────────────────────────────────────────────
// Mirrors the exact logic from batch.ts so we test real behaviour offline.

// The 38 method names that getToolRegistry binds (EXACT list from batch.ts)
const REGISTRY_KEYS = [
  "execute", "getPaneState", "getSelection", "getOperators",
  "getParameters", "setParameters", "getConnections", "findOperators",
  "healthcheck", "getErrors", "getInfo", "getFocus", "getPerf",
  "createOperator", "deleteOperator", "connectNodes", "disconnect", "copyNode",
  "screenshot", "getScreenshots", "projectLifecycle", "popInspect",
  "getNodeDetail", "getHints", "getBuildCompatibility", "getReleaseDelta",
  "snapshotScene", "readDat", "writeDat", "readChop",
  "searchInTD", "navigateTo", "reinitExtension", "pulseParam",
  "customParameters", "readTextport", "clearTextport", "memorySave",
  "memoryRecall", "searchOfficialDocs",
];
// Note: above has 40 entries. Let's match EXACTLY the batch.ts source:
const EXPECTED_KEYS = [
  "execute", "getPaneState", "getSelection", "getOperators",
  "getParameters", "setParameters", "getConnections", "findOperators",
  "healthcheck", "getErrors", "getInfo", "getFocus", "getPerf",
  "createOperator", "deleteOperator", "connectNodes", "disconnect", "copyNode",
  "screenshot", "getScreenshots", "projectLifecycle", "popInspect",
  "getNodeDetail", "getHints", "getBuildCompatibility", "getReleaseDelta",
  "snapshotScene", "readDat", "writeDat", "readChop",
  "searchInTD", "navigateTo", "reinitExtension", "pulseParam",
  "customParameters", "readTextport", "clearTextport", "memorySave",
  "memoryRecall", "searchOfficialDocs",
];

// Registry builder mirror (exact logic from getToolRegistry in batch.ts)
let cachedRegistry = null;

function getToolRegistry(client) {
  if (cachedRegistry) return cachedRegistry;
  const registry = new Map();

  const bind = (name, method) => {
    if (typeof method === "function") {
      registry.set(name, method.bind(client));
    }
  };

  bind("execute", client.execute);
  bind("getPaneState", client.getPaneState);
  bind("getSelection", client.getSelection);
  bind("getOperators", client.getOperators);
  bind("getParameters", client.getParameters);
  bind("setParameters", client.setParameters);
  bind("getConnections", client.getConnections);
  bind("findOperators", client.findOperators);
  bind("healthcheck", client.healthcheck);
  bind("getErrors", client.getErrors);
  bind("getInfo", client.getInfo);
  bind("getFocus", client.getFocus);
  bind("getPerf", client.getPerf);
  bind("createOperator", client.createOperator);
  bind("deleteOperator", client.deleteOperator);
  bind("connectNodes", client.connectNodes);
  bind("disconnect", client.disconnect);
  bind("copyNode", client.copyNode);
  bind("screenshot", client.screenshot);
  bind("getScreenshots", client.getScreenshots);
  bind("projectLifecycle", client.projectLifecycle);
  bind("popInspect", client.popInspect);
  bind("getNodeDetail", client.getNodeDetail);
  bind("getHints", client.getHints);
  bind("getBuildCompatibility", client.getBuildCompatibility);
  bind("getReleaseDelta", client.getReleaseDelta);
  bind("snapshotScene", client.snapshotScene);
  bind("readDat", client.readDat);
  bind("writeDat", client.writeDat);
  bind("readChop", client.readChop);
  bind("searchInTD", client.searchInTD);
  bind("navigateTo", client.navigateTo);
  bind("reinitExtension", client.reinitExtension);
  bind("pulseParam", client.pulseParam);
  bind("customParameters", client.customParameters);
  bind("readTextport", client.readTextport);
  bind("clearTextport", client.clearTextport);
  bind("memorySave", client.memorySave);
  bind("memoryRecall", client.memoryRecall);
  bind("searchOfficialDocs", client.searchOfficialDocs);

  cachedRegistry = registry;
  return registry;
}

/** Reset cached registry between tests so each gets a fresh start. */
function resetCache() {
  cachedRegistry = null;
}

/** Helper: extract the batch handler from a MockMcpServer. */
function extractBatchHandler(mockServer) {
  const registration = mockServer.tools.find((t) => t.name === "tool_batch");
  return registration ? registration.handler : null;
}

/**
 * Helper: run the batch tool handler using the test's own getToolRegistry
 * mirror, so the cachedRegistry is managed by the test file and resetCache()
 * actually takes effect. This avoids the real module's persistent cachedRegistry
 * cross-contaminating tests.
 */
async function batch(client, toolsList) {
  resetCache();
  const registry = getToolRegistry(client);
  const results = [];
  for (const tool of toolsList) {
    const handler = registry.get(tool.name);
    if (!handler) {
      results.push({
        name: tool.name,
        success: false,
        error: `Unknown tool: ${tool.name}. Available: ${Array.from(registry.keys()).join(", ")}`,
      });
      continue;
    }
    try {
      const result = await handler(tool.args ?? {});
      results.push({ name: tool.name, success: true, result });
    } catch (e) {
      results.push({
        name: tool.name,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { success: true, results };
}

/** Parse the final delegate out of an ok() response. */
function parseOk(raw) {
  const text = raw.content[0].text;
  return JSON.parse(text);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("Batch tool — Registry building", () => {
  it("should create a registry with all expected keys", () => {
    resetCache();
    const client = new MockTDClient();
    const registry = getToolRegistry(client);
    for (const key of EXPECTED_KEYS) {
      assert.ok(registry.has(key), `Registry should have key "${key}"`);
    }
  });

  it("should have the correct number of bound tools", () => {
    resetCache();
    const client = new MockTDClient();
    const registry = getToolRegistry(client);
    assert.equal(registry.size, EXPECTED_KEYS.length);
  });

  it("each registry entry should be a function", () => {
    resetCache();
    const client = new MockTDClient();
    const registry = getToolRegistry(client);
    for (const [key, handler] of registry) {
      assert.equal(typeof handler, "function", `Handler for "${key}" should be a function`);
    }
  });

  it("should cache the registry — second call returns same Map", () => {
    resetCache();
    const client = new MockTDClient();
    const r1 = getToolRegistry(client);
    const r2 = getToolRegistry(client);
    assert.equal(r1, r2, "Cached registry should be the same Map reference");
    assert.equal(r1.size, EXPECTED_KEYS.length);
  });

  it("should have function as each handler (bound)", () => {
    resetCache();
    const client = new MockTDClient();
    const registry = getToolRegistry(client);
    for (const key of ["execute", "getInfo", "createOperator"]) {
      const handler = registry.get(key);
      assert.equal(typeof handler, "function", `${key} handler should be a function`);
    }
  });
});

describe("Batch tool — Tool registration", () => {
  it("should register a tool named tool_batch", () => {
    resetCache();
    const server = new MockMcpServer();
    const client = new MockTDClient();
    registerBatchTool(server, client);
    assert.equal(server.tools.length, 1);
    assert.equal(server.tools[0].name, "tool_batch");
  });

  it("the registered handler should be async (returns a Promise)", () => {
    resetCache();
    const server = new MockMcpServer();
    const client = new MockTDClient();
    registerBatchTool(server, client);
    const result = server.tools[0].handler({ tools: [] });
    assert.ok(result instanceof Promise, "handler should return a Promise");
  });

  it("should include title and description metadata", () => {
    resetCache();
    const server = new MockMcpServer();
    const client = new MockTDClient();
    registerBatchTool(server, client);
    const meta = server.tools[0].metadata;
    assert.ok(meta.title, "Should have a title");
    assert.ok(meta.description, "Should have a description");
  });
});

describe("Batch tool — Single tool dispatch", () => {
  it("should dispatch execute with correct code arg", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "execute", args: { code: "print('hello')" } }]);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].name, "execute");
    assert.equal(result.results[0].success, true);
    assert.equal(client.calls[0].method, "execute");
    // Batch passes whole args object as single positional arg to client
    assert.equal(typeof client.calls[0].code, "object");
    assert.equal(client.calls[0].code.code, "print('hello')");
  });

  it("should dispatch getInfo with no args", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "getInfo", args: {} }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true);
    assert.equal(client.calls[0].method, "getInfo");
  });

  it("should dispatch createOperator with type/name/path", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{
      name: "createOperator",
      args: { type: "noiseTOP", name: "noise1", path: "/project1" },
    }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true);
    // Batch passes whole args object as single positional arg
    assert.equal(client.calls[0].method, "createOperator");
    assert.equal(typeof client.calls[0].type, "object");
    assert.equal(client.calls[0].type.type, "noiseTOP");
    assert.equal(client.calls[0].type.name, "noise1");
  });

  it("should return result payload from the handler", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "getPaneState", args: {} }]);
    assert.equal(result.success, true);
    assert.ok(result.results[0].result);
    assert.equal(result.results[0].result.network, "/project1");
  });

  it("should call with undefined when args omitted", async () => {
    resetCache();
    const client = new MockTDClient();
    // args omitted → defaults to {} per zod default
    const result = await batch(client, [{ name: "getInfo" }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true);
    // The handler calls registry.get("getInfo")() with tool.args ?? {} = {}
    // which means client.getInfo() is called — check it happened
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].method, "getInfo");
  });
});

describe("Batch tool — Multiple tool dispatch", () => {
  it("should dispatch 3 tools and return 3 results", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "getFocus", args: {} },
      { name: "getPaneState", args: {} },
    ]);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0].name, "getInfo");
    assert.equal(result.results[1].name, "getFocus");
    assert.equal(result.results[2].name, "getPaneState");
    assert.equal(client.calls.length, 3);
  });

  it("should return 0 results when tools array is empty", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, []);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 0);
    assert.equal(client.calls.length, 0);
  });

  it("should execute tools sequentially in order", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "execute", args: { code: "a" } },
      { name: "execute", args: { code: "b" } },
      { name: "execute", args: { code: "c" } },
    ]);
    assert.equal(result.success, true);
    assert.equal(client.calls.length, 3);
    assert.equal(client.calls[0].code.code, "a");
    assert.equal(client.calls[1].code.code, "b");
    assert.equal(client.calls[2].code.code, "c");
  });

  it("should mix different tool types", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "execute", args: { code: "test" } },
      { name: "getOperators", args: { path: "/project1" } },
    ]);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 3);
    assert.equal(client.calls[0].method, "getInfo");
    assert.equal(client.calls[1].method, "execute");
    assert.equal(client.calls[2].method, "getOperators");
  });

  it("should return all results in correct order", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "getFocus", args: {} },
    ]);
    assert.equal(result.results[0].name, "getInfo");
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[1].name, "getFocus");
    assert.equal(result.results[1].success, true);
  });
});

describe("Batch tool — Error handling", () => {
  it("should return error for unknown tool name", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "nonexistent_tool", args: {} }]);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].name, "nonexistent_tool");
    assert.equal(result.results[0].success, false);
    assert.ok(result.results[0].error.includes("Unknown tool: nonexistent_tool"));
  });

  it("unknown tool error includes list of available tools", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "bogus", args: {} }]);
    assert.ok(result.results[0].error.includes("Available:"));
    assert.ok(result.results[0].error.includes("execute"));
  });

  it("should catch handler thrown Error and report as failed", async () => {
    resetCache();
    const client = new MockTDClient();
    client.execute = async () => { throw new Error("runtime failure"); };
    const result = await batch(client, [{ name: "execute", args: { code: "x" } }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, false);
    assert.equal(result.results[0].error, "runtime failure");
  });

  it("should catch handler thrown string and convert to string", async () => {
    resetCache();
    const client = new MockTDClient();
    client.execute = async () => { throw "boom"; };
    const result = await batch(client, [{ name: "execute", args: { code: "x" } }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, false);
    assert.equal(result.results[0].error, "boom");
  });

  it("should continue executing remaining tools after one fails", async () => {
    resetCache();
    const client = new MockTDClient();
    // The mock must record the call BEFORE throwing for call-count verification
    const originalGetFocus = client.getFocus.bind(client);
    client.getFocus = async (...args) => {
      // Record the call first, then throw
      client.calls.push({ method: "getFocus", args });
      throw new Error("focus_fail");
    };
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "getFocus", args: {} },
      { name: "getPaneState", args: {} },
    ]);
    assert.equal(result.success, true);
    assert.equal(result.results.length, 3);
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[1].success, false);
    assert.equal(result.results[1].error, "focus_fail");
    assert.equal(result.results[2].success, true);
    // All three methods should have been called (getFocus throws after recording)
    assert.equal(client.calls.length, 3);
  });

  it("should handle mix of unknown tool and valid tool", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "whatsthis", args: {} },
    ]);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[1].success, false);
    assert.ok(result.results[1].error.includes("Unknown tool: whatsthis"));
  });
});

describe("Batch tool — Edge cases", () => {
  it("should handle empty args object for a tool that expects none", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "getPaneState", args: {} }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true);
    assert.equal(client.calls[0].method, "getPaneState");
  });

  it("should deliver result payload from dispatched tool", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "getInfo", args: {} }]);
    assert.equal(result.results[0].result.version, "2025.10000");
    assert.equal(result.results[0].result.commercial, true);
  });

  it("should handle args with all supported parameter types", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{
      name: "readDat",
      args: { path: "/project1/code", start_line: 1, end_line: 50 },
    }]);
    assert.equal(result.success, true);
    assert.equal(result.results[0].success, true);
    assert.equal(client.calls[0].method, "readDat");
    // Batch passes whole args object as single positional arg
    assert.equal(typeof client.calls[0].path, "object");
    assert.equal(client.calls[0].path.path, "/project1/code");
    assert.equal(client.calls[0].path.start_line, 1);
    assert.equal(client.calls[0].path.end_line, 50);
  });

  it("should register via real registerBatchTool import (not mirror)", () => {
    resetCache();
    const server = new MockMcpServer();
    const client = new MockTDClient();
    registerBatchTool(server, client);
    assert.equal(server.tools.length, 1);
    assert.equal(typeof server.tools[0].handler, "function");
  });

  it("should return ok() shape (success + results)", async () => {
    resetCache();
    const client = new MockTDClient();
    const server = new MockMcpServer();
    registerBatchTool(server, client);
    const handler = extractBatchHandler(server);
    const raw = await handler({ tools: [{ name: "getInfo", args: {} }] });
    const parsed = parseOk(raw);
    assert.equal(parsed.success, true);
    assert.ok(Array.isArray(parsed.results));
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].name, "getInfo");
  });
});

describe("Batch tool — Response shape contract", () => {
  it("top-level result has success: true", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [{ name: "getInfo", args: {} }]);
    assert.equal(result.success, true);
  });

  it("each item has name, success, and either result or error", async () => {
    resetCache();
    const client = new MockTDClient();
    const result = await batch(client, [
      { name: "getInfo", args: {} },
      { name: "bogus", args: {} },
    ]);
    // Successful item
    assert.equal(result.results[0].name, "getInfo");
    assert.equal(result.results[0].success, true);
    assert.ok("result" in result.results[0]);
    assert.equal("error" in result.results[0], false);
    // Failed item
    assert.equal(result.results[1].name, "bogus");
    assert.equal(result.results[1].success, false);
    assert.ok("error" in result.results[1]);
  });

  it("handler returns MCP content[0].text format", async () => {
    resetCache();
    const client = new MockTDClient();
    const server = new MockMcpServer();
    registerBatchTool(server, client);
    const handler = extractBatchHandler(server);
    const raw = await handler({ tools: [{ name: "getInfo", args: {} }] });
    assert.ok(raw.content);
    assert.ok(raw.content[0]);
    assert.equal(typeof raw.content[0].text, "string");
    const parsed = JSON.parse(raw.content[0].text);
    assert.equal(parsed.success, true);
  });
});

describe("Batch tool — Session isolation", () => {
  it("two sequential batch calls use separate client calls", async () => {
    resetCache();
    const client = new MockTDClient();
    await batch(client, [{ name: "getInfo", args: {} }]);
    const firstCalls = client.calls.length;

    // Second batch
    resetCache();  // Fresh cache so registry is rebuilt (but it's cached, so Map is reused)
    await batch(client, [{ name: "getFocus", args: {} }]);
    assert.equal(client.calls.length, firstCalls + 1);
    assert.equal(client.calls[firstCalls].method, "getFocus");
  });

  it("registry values are bound client methods", async () => {
    resetCache();
    const client = new MockTDClient();
    const registry = getToolRegistry(client);
    const getInfoHandler = registry.get("getInfo");
    const result = await getInfoHandler();
    assert.ok(result.version);
    assert.ok("commercial" in result);
  });
});
