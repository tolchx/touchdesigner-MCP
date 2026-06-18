/**
 * Unit tests for Inspection tools — all 18 tool handlers in mcp/src/tools/inspection.ts:
 *   - td_pane, td_selection, td_operators, td_find
 *   - td_connections, td_get_errors, td_healthcheck
 *   - td_get_node_detail, td_get_hints, td_get_info
 *   - td_get_focus, td_get_perf, td_pop_inspect
 *   - td_get_build_compatibility, td_get_release_delta
 *   - td_spatial_context, td_explore_project, td_compare_networks
 *
 * These are offline tests: a MockTDClient mirrors the real TDClient method
 * signatures and returns representative payloads. Handler mirror functions
 * reproduce the EXACT closure logic from inspection.ts (argument plumbing,
 * default values, error handling, and execute-based parsing for
 * td_compare_networks).
 *
 * Build first:  npx tsc -p mcp/tsconfig.json
 * Run:          node --test mcp/test/inspection.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err } from "../dist/helpers.js";

/** Parse the MCP text payload out of an ok()/err() response. */
function payload(result) {
  return JSON.parse(result.content[0].text);
}

// ─── Mock TDClient ───────────────────────────────────────────────────────────
// Mirrors ALL the real TDClient method signatures used by inspection.ts and
// returns representative payloads. Every call is recorded in `this.calls`.

class MockTDClient {
  constructor() {
    this.calls = [];
  }

  async getPaneState() {
    this.calls.push({ method: "getPaneState" });
    return {
      networkPath: "/project1",
      x: 0,
      y: 0,
      zoom: 1.0,
    };
  }

  async getSelection() {
    this.calls.push({ method: "getSelection" });
    return {
      selected: [
        { path: "/project1/op1", name: "op1", type: "blurTOP", family: "TOP" },
      ],
    };
  }

  async getOperators(path) {
    this.calls.push({ method: "getOperators", path });
    return {
      path,
      operators: [
        { path: `${path === "/" ? "" : path}/noise1`, name: "noise1", type: "noiseTOP", opType: "noiseTOP", family: "TOP" },
        { path: `${path === "/" ? "" : path}/blur1`, name: "blur1", type: "blurTOP", opType: "blurTOP", family: "TOP" },
      ],
    };
  }

  async findOperators(args) {
    this.calls.push({ method: "findOperators", args });
    return {
      results: [
        { path: "/project1/op1", name: "op1", type: "blurTOP" },
      ],
      count: 1,
    };
  }

  async getConnections(path, recurse) {
    this.calls.push({ method: "getConnections", path, recurse });
    return {
      path,
      recurse,
      connections: [
        { from: "/project1/noise1", to: "/project1/blur1", inputIndex: 0 },
      ],
    };
  }

  async getErrors(path, recurse) {
    this.calls.push({ method: "getErrors", path, recurse });
    return {
      path,
      recurse,
      errors: [],
      healthy: true,
    };
  }

  async healthcheck(path, recurse) {
    this.calls.push({ method: "healthcheck", path, recurse });
    return {
      path,
      recurse,
      ok: true,
      issueCount: 0,
      operators: [],
    };
  }

  async getNodeDetail(path, recurse) {
    this.calls.push({ method: "getNodeDetail", path, recurse });
    return {
      path,
      recurse,
      name: "op1",
      type: "blurTOP",
      opType: "blurTOP",
      family: "TOP",
      parameters: [],
      inputs: [],
    };
  }

  async getHints(nodeType) {
    this.calls.push({ method: "getHints", nodeType });
    return {
      nodeType,
      hints: `${nodeType} accepts inputs from noiseTOP and outputs to compositeTOP`,
    };
  }

  async getInfo() {
    this.calls.push({ method: "getInfo" });
    return {
      build: "2025.10000",
      buildDate: "2025-01-15",
      commercial: true,
      platform: "win64",
      fps: 60.0,
    };
  }

  async getFocus() {
    this.calls.push({ method: "getFocus" });
    return {
      activeNetwork: "/project1",
      selected: [],
      currentOperator: null,
    };
  }

  async getPerf(path, top) {
    this.calls.push({ method: "getPerf", path, top });
    return {
      path,
      top,
      slowest: [],
      fps: 60.0,
      totalOps: 10,
    };
  }

  async popInspect(path) {
    this.calls.push({ method: "popInspect", path });
    return {
      path,
      pointCount: 100,
      attributes: [
        { name: "P", type: "float", components: 3 },
      ],
    };
  }

  async getBuildCompatibility(opType) {
    this.calls.push({ method: "getBuildCompatibility", opType });
    return {
      opType,
      exists: true,
    };
  }

  async getReleaseDelta(buildFrom, buildTo) {
    this.calls.push({ method: "getReleaseDelta", buildFrom, buildTo });
    return {
      buildFrom,
      buildTo,
      changes: [],
      summary: "No changes between builds",
    };
  }

  async getSpatialContext() {
    this.calls.push({ method: "getSpatialContext" });
    return {
      here: "/project1",
      this_: null,
      parent: "/",
      selected: [],
    };
  }

  async exploreProject(path) {
    this.calls.push({ method: "exploreProject", path });
    return {
      path,
      operatorCount: 5,
      familyBreakdown: { TOP: 3, CHOP: 1, COMP: 1 },
      errorCount: 0,
    };
  }

  async execute(code, from) {
    this.calls.push({ method: "execute", codeLength: code.length, from });
    return {
      success: true,
      stdout: JSON.stringify({
        success: true,
        path_a: "/compA",
        path_b: "/compB",
        operators_a: 2,
        operators_b: 2,
        only_in_a: [],
        only_in_b: [],
        param_diffs: [],
        connection_diffs: [],
        total_differences: 0,
        summary: "Networks are identical",
      }),
      stderr: "",
      from_op: from,
    };
  }
}

/**
 * Build a client whose `methodName` throws `message`. Other methods are
 * unreachable for the error-path tests (the handler catches before calling
 * them), so we only stub the throwing method.
 */
function throwingClient(methodName, message) {
  const client = new MockTDClient();
  client[methodName] = async (...args) => {
    client.calls.push({ method: methodName, args });
    throw new Error(message);
  };
  return client;
}

// ─── Handler mirrors (exact logic from inspection.ts) ────────────────────────

// td_pane
async function paneHandler(client) {
  try {
    const result = await client.getPaneState();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_selection
async function selectionHandler(client) {
  try {
    const result = await client.getSelection();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_operators
async function operatorsHandler(client, { path: opPath }) {
  try {
    const result = await client.getOperators(opPath ?? "/");
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_find
async function findHandler(client, args) {
  try {
    const result = await client.findOperators(args);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_connections
async function connectionsHandler(client, { path: opPath, recurse }) {
  try {
    const result = await client.getConnections(opPath, recurse ?? false);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_errors
async function getErrorsHandler(client, { path: opPath, recurse }) {
  try {
    const result = await client.getErrors(opPath, recurse ?? true);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_healthcheck
async function healthcheckHandler(client, { path: opPath, recurse }) {
  try {
    const result = await client.healthcheck(opPath, recurse ?? false);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_node_detail
async function nodeDetailHandler(client, { path: opPath, recurse }) {
  try {
    const result = await client.getNodeDetail(opPath, recurse ?? false);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_hints
async function hintsHandler(client, { node_type }) {
  try {
    const result = await client.getHints(node_type);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_info
async function infoHandler(client) {
  try {
    const result = await client.getInfo();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_focus
async function focusHandler(client) {
  try {
    const result = await client.getFocus();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_perf
async function perfHandler(client, { path: opPath, top }) {
  try {
    const result = await client.getPerf(opPath ?? "/", top ?? 20);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_pop_inspect
async function popInspectHandler(client, { path: opPath }) {
  try {
    const result = await client.popInspect(opPath);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_build_compatibility
async function buildCompatHandler(client, { op_type }) {
  try {
    const result = await client.getBuildCompatibility(op_type);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_get_release_delta
async function releaseDeltaHandler(client, { build_from, build_to }) {
  try {
    const result = await client.getReleaseDelta(build_from, build_to);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_spatial_context
async function spatialContextHandler(client) {
  try {
    const result = await client.getSpatialContext();
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_explore_project
async function exploreProjectHandler(client, { path: opPath }) {
  try {
    const result = await client.exploreProject(opPath ?? "/");
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_compare_networks — builds inline Python code and executes it
async function compareNetworksHandler(client, { path_a, path_b }) {
  try {
    const safeA = path_a.replace(/'/g, "\\'");
    const safeB = path_b.replace(/'/g, "\\'");
    const code = `import json
try:
    def introspect(container):
        if container is None:
            return None
        ops = {}
        for child in container.children:
            if child is None:
                continue
            ops[child.name] = {'name': child.name, 'type': child.OPType, 'path': child.path}
        return ops
    comp_a = op('${safeA}')
    comp_b = op('${safeB}')
    if comp_a is None:
        print(json.dumps({'success': False, 'error': 'Container A not found'}))
    elif comp_b is None:
        print(json.dumps({'success': False, 'error': 'Container B not found'}))
    else:
        ops_a = introspect(comp_a) or {}
        ops_b = introspect(comp_b) or {}
        print(json.dumps({'success': True, 'path_a': comp_a.path, 'path_b': comp_b.path, 'operators_a': len(ops_a), 'operators_b': len(ops_b)}))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))`;
    const result = await client.execute(code, "/");
    if (!result.success) {
      const msg = result.error?.message ?? result.stderr ?? "Unknown error";
      return err(msg);
    }
    const parsed = JSON.parse(result.stdout.trim());
    return ok(parsed);
  } catch (e) {
    return err(e);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Inspection Tools", () => {
  // ===========================================================================
  // td_pane
  // ===========================================================================
  describe("td_pane", () => {
    it("returns pane state", async () => {
      const client = new MockTDClient();
      const res = await paneHandler(client);
      const data = payload(res);

      assert.equal(res.isError, undefined, "should not be an error response");
      assert.equal(data.networkPath, "/project1");
      assert.equal(data.x, 0);
      assert.equal(data.y, 0);
      assert.equal(data.zoom, 1.0);
    });

    it("calls getPaneState on the client", async () => {
      const client = new MockTDClient();
      await paneHandler(client);

      assert.equal(client.calls.length, 1);
      assert.equal(client.calls[0].method, "getPaneState");
    });

    it("handles client error", async () => {
      const client = throwingClient("getPaneState", "TD not connected");
      const res = await paneHandler(client);

      assert.equal(res.isError, true);
      const data = payload(res);
      assert.ok(data.error.includes("TD not connected"));
    });
  });

  // ===========================================================================
  // td_selection
  // ===========================================================================
  describe("td_selection", () => {
    it("returns selection", async () => {
      const client = new MockTDClient();
      const res = await selectionHandler(client);
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.ok(Array.isArray(data.selected));
      assert.equal(data.selected.length, 1);
      assert.equal(data.selected[0].name, "op1");
    });

    it("calls getSelection", async () => {
      const client = new MockTDClient();
      await selectionHandler(client);
      assert.equal(client.calls[0].method, "getSelection");
    });

    it("handles client error", async () => {
      const client = throwingClient("getSelection", "no pane open");
      const res = await selectionHandler(client);
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_operators
  // ===========================================================================
  describe("td_operators", () => {
    it("returns operators with given path", async () => {
      const client = new MockTDClient();
      const res = await operatorsHandler(client, { path: "/project1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.path, "/project1");
      assert.equal(data.operators.length, 2);
    });

    it("defaults path to '/' when not provided", async () => {
      const client = new MockTDClient();
      await operatorsHandler(client, {});

      const call = client.calls.find((c) => c.method === "getOperators");
      assert.equal(call.path, "/");
    });

    it("calls getOperators with the path", async () => {
      const client = new MockTDClient();
      await operatorsHandler(client, { path: "/myComp" });

      const call = client.calls.find((c) => c.method === "getOperators");
      assert.equal(call.path, "/myComp");
    });

    it("handles client error", async () => {
      const client = throwingClient("getOperators", "path not found");
      const res = await operatorsHandler(client, { path: "/gone" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_find
  // ===========================================================================
  describe("td_find", () => {
    it("returns find results", async () => {
      const client = new MockTDClient();
      const res = await findHandler(client, { path: "/project1", query: "blur" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.count, 1);
      assert.equal(data.results[0].name, "op1");
    });

    it("passes the full args object to findOperators", async () => {
      const client = new MockTDClient();
      const args = { path: "/project1", query: "blur", family: "TOP", recursive: true, limit: 10 };
      await findHandler(client, args);

      const call = client.calls.find((c) => c.method === "findOperators");
      assert.equal(call.args.path, "/project1");
      assert.equal(call.args.query, "blur");
      assert.equal(call.args.family, "TOP");
      assert.equal(call.args.recursive, true);
      assert.equal(call.args.limit, 10);
    });

    it("handles empty args", async () => {
      const client = new MockTDClient();
      const res = await findHandler(client, {});

      assert.equal(res.isError, undefined);
      const call = client.calls.find((c) => c.method === "findOperators");
      assert.deepEqual(call.args, {});
    });

    it("handles client error", async () => {
      const client = throwingClient("findOperators", "search failed");
      const res = await findHandler(client, { query: "bad" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_connections
  // ===========================================================================
  describe("td_connections", () => {
    it("returns connections for a path", async () => {
      const client = new MockTDClient();
      const res = await connectionsHandler(client, { path: "/project1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.path, "/project1");
    });

    it("defaults recurse to false", async () => {
      const client = new MockTDClient();
      await connectionsHandler(client, { path: "/project1" });

      const call = client.calls.find((c) => c.method === "getConnections");
      assert.equal(call.recurse, false);
    });

    it("forwards recurse=true when provided", async () => {
      const client = new MockTDClient();
      await connectionsHandler(client, { path: "/project1", recurse: true });

      const call = client.calls.find((c) => c.method === "getConnections");
      assert.equal(call.recurse, true);
    });

    it("handles client error", async () => {
      const client = throwingClient("getConnections", "no network");
      const res = await connectionsHandler(client, { path: "/missing" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_errors
  // ===========================================================================
  describe("td_get_errors", () => {
    it("returns errors (empty)", async () => {
      const client = new MockTDClient();
      const res = await getErrorsHandler(client, { path: "/project1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.healthy, true);
    });

    it("defaults recurse to true", async () => {
      const client = new MockTDClient();
      await getErrorsHandler(client, { path: "/project1" });

      const call = client.calls.find((c) => c.method === "getErrors");
      assert.equal(call.recurse, true);
    });

    it("forwards recurse false", async () => {
      const client = new MockTDClient();
      await getErrorsHandler(client, { path: "/project1", recurse: false });

      const call = client.calls.find((c) => c.method === "getErrors");
      assert.equal(call.recurse, false);
    });

    it("handles client error", async () => {
      const client = throwingClient("getErrors", "path error");
      const res = await getErrorsHandler(client, { path: "/x" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_healthcheck
  // ===========================================================================
  describe("td_healthcheck", () => {
    it("returns healthy result", async () => {
      const client = new MockTDClient();
      const res = await healthcheckHandler(client, { path: "/project1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.ok, true);
    });

    it("defaults recurse to false", async () => {
      const client = new MockTDClient();
      await healthcheckHandler(client, { path: "/project1" });

      const call = client.calls.find((c) => c.method === "healthcheck");
      assert.equal(call.recurse, false);
    });

    it("handles client error", async () => {
      const client = throwingClient("healthcheck", "TD error");
      const res = await healthcheckHandler(client, { path: "/x" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_node_detail
  // ===========================================================================
  describe("td_get_node_detail", () => {
    it("returns node detail", async () => {
      const client = new MockTDClient();
      const res = await nodeDetailHandler(client, { path: "/project1/op1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.name, "op1");
      assert.equal(data.type, "blurTOP");
    });

    it("defaults recurse to false", async () => {
      const client = new MockTDClient();
      await nodeDetailHandler(client, { path: "/x" });

      const call = client.calls.find((c) => c.method === "getNodeDetail");
      assert.equal(call.recurse, false);
    });

    it("handles client error", async () => {
      const client = throwingClient("getNodeDetail", "op not found");
      const res = await nodeDetailHandler(client, { path: "/gone" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_hints
  // ===========================================================================
  describe("td_get_hints", () => {
    it("returns hints for a node type", async () => {
      const client = new MockTDClient();
      const res = await hintsHandler(client, { node_type: "noiseTOP" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.nodeType, "noiseTOP");
      assert.ok(data.hints.includes("noiseTOP"));
    });

    it("forwards node_type to the client", async () => {
      const client = new MockTDClient();
      await hintsHandler(client, { node_type: "blurTOP" });

      const call = client.calls.find((c) => c.method === "getHints");
      assert.equal(call.nodeType, "blurTOP");
    });

    it("handles client error", async () => {
      const client = throwingClient("getHints", "unknown type");
      const res = await hintsHandler(client, { node_type: "nonexistent" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_info
  // ===========================================================================
  describe("td_get_info", () => {
    it("returns TD build info", async () => {
      const client = new MockTDClient();
      const res = await infoHandler(client);
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.build, "2025.10000");
      assert.equal(data.fps, 60.0);
    });

    it("calls getInfo", async () => {
      const client = new MockTDClient();
      await infoHandler(client);
      assert.equal(client.calls[0].method, "getInfo");
    });

    it("handles client error", async () => {
      const client = throwingClient("getInfo", "TD disconnected");
      const res = await infoHandler(client);
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_focus
  // ===========================================================================
  describe("td_get_focus", () => {
    it("returns focus state", async () => {
      const client = new MockTDClient();
      const res = await focusHandler(client);
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.activeNetwork, "/project1");
    });

    it("calls getFocus", async () => {
      const client = new MockTDClient();
      await focusHandler(client);
      assert.equal(client.calls[0].method, "getFocus");
    });

    it("handles client error", async () => {
      const client = throwingClient("getFocus", "no focus");
      const res = await focusHandler(client);
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_perf
  // ===========================================================================
  describe("td_get_perf", () => {
    it("returns performance data", async () => {
      const client = new MockTDClient();
      const res = await perfHandler(client, { path: "/project1", top: 10 });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.path, "/project1");
      assert.equal(data.top, 10);
    });

    it("defaults path to '/' and top to 20", async () => {
      const client = new MockTDClient();
      await perfHandler(client, {});

      const call = client.calls.find((c) => c.method === "getPerf");
      assert.equal(call.path, "/");
      assert.equal(call.top, 20);
    });

    it("handles client error", async () => {
      const client = throwingClient("getPerf", "perf error");
      const res = await perfHandler(client, {});
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_pop_inspect
  // ===========================================================================
  describe("td_pop_inspect", () => {
    it("returns POP inspection data", async () => {
      const client = new MockTDClient();
      const res = await popInspectHandler(client, { path: "/project1/pop1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.pointCount, 100);
      assert.equal(data.attributes.length, 1);
    });

    it("calls popInspect with the given path", async () => {
      const client = new MockTDClient();
      await popInspectHandler(client, { path: "/project1/particle1" });

      const call = client.calls.find((c) => c.method === "popInspect");
      assert.equal(call.path, "/project1/particle1");
    });

    it("handles client error", async () => {
      const client = throwingClient("popInspect", "not a POP");
      const res = await popInspectHandler(client, { path: "/project1/top1" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_build_compatibility
  // ===========================================================================
  describe("td_get_build_compatibility", () => {
    it("returns compatibility check", async () => {
      const client = new MockTDClient();
      const res = await buildCompatHandler(client, { op_type: "noiseTOP" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.opType, "noiseTOP");
      assert.equal(data.exists, true);
    });

    it("forwards op_type to the client", async () => {
      const client = new MockTDClient();
      await buildCompatHandler(client, { op_type: "glslPOP" });

      const call = client.calls.find((c) => c.method === "getBuildCompatibility");
      assert.equal(call.opType, "glslPOP");
    });

    it("handles client error", async () => {
      const client = throwingClient("getBuildCompatibility", "bad type");
      const res = await buildCompatHandler(client, { op_type: "x" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_get_release_delta
  // ===========================================================================
  describe("td_get_release_delta", () => {
    it("returns release delta", async () => {
      const client = new MockTDClient();
      const res = await releaseDeltaHandler(client, { build_from: "2025.10000", build_to: "2025.11000" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.buildFrom, "2025.10000");
      assert.equal(data.buildTo, "2025.11000");
    });

    it("handles missing build_to", async () => {
      const client = new MockTDClient();
      await releaseDeltaHandler(client, { build_from: "2025.10000" });

      const call = client.calls.find((c) => c.method === "getReleaseDelta");
      assert.equal(call.buildFrom, "2025.10000");
      assert.equal(call.buildTo, undefined);
    });

    it("handles client error", async () => {
      const client = throwingClient("getReleaseDelta", "version not found");
      const res = await releaseDeltaHandler(client, { build_from: "old" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_spatial_context
  // ===========================================================================
  describe("td_spatial_context", () => {
    it("returns spatial context", async () => {
      const client = new MockTDClient();
      const res = await spatialContextHandler(client);
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.here, "/project1");
    });

    it("calls getSpatialContext", async () => {
      const client = new MockTDClient();
      await spatialContextHandler(client);
      assert.equal(client.calls[0].method, "getSpatialContext");
    });

    it("handles client error", async () => {
      const client = throwingClient("getSpatialContext", "no context");
      const res = await spatialContextHandler(client);
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_explore_project
  // ===========================================================================
  describe("td_explore_project", () => {
    it("returns project exploration data", async () => {
      const client = new MockTDClient();
      const res = await exploreProjectHandler(client, { path: "/project1" });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.operatorCount, 5);
      assert.equal(data.familyBreakdown.TOP, 3);
    });

    it("defaults path to '/' when not provided", async () => {
      const client = new MockTDClient();
      await exploreProjectHandler(client, {});

      const call = client.calls.find((c) => c.method === "exploreProject");
      assert.equal(call.path, "/");
    });

    it("handles client error", async () => {
      const client = throwingClient("exploreProject", "explore failed");
      const res = await exploreProjectHandler(client, { path: "/x" });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // td_compare_networks
  // ===========================================================================
  describe("td_compare_networks", () => {
    it("returns comparison result", async () => {
      const client = new MockTDClient();
      const res = await compareNetworksHandler(client, {
        path_a: "/compA",
        path_b: "/compB",
      });
      const data = payload(res);

      assert.equal(res.isError, undefined);
      assert.equal(data.success, true);
      assert.equal(data.path_a, "/compA");
      assert.equal(data.path_b, "/compB");
      assert.equal(data.summary, "Networks are identical");
    });

    it("calls execute with the inline Python code", async () => {
      const client = new MockTDClient();
      await compareNetworksHandler(client, {
        path_a: "/compA",
        path_b: "/compB",
      });

      const call = client.calls.find((c) => c.method === "execute");
      assert.ok(call, "execute should be called");
      assert.ok(call.codeLength > 10, "code should have content");
      assert.equal(call.from, "/");
    });

    it("handles execute failure (success: false)", async () => {
      const client = new MockTDClient();
      // Override execute to return failure
      client.execute = async (code, from) => {
        client.calls.push({ method: "execute", codeLength: code.length, from });
        return {
          success: false,
          error: { message: "Compilation error" },
          stderr: "",
          from_op: from,
        };
      };
      const res = await compareNetworksHandler(client, {
        path_a: "/compA",
        path_b: "/compB",
      });

      assert.equal(res.isError, true);
      const data = payload(res);
      assert.ok(data.error.includes("Compilation error"));
    });

    it("handles JSON parse failure", async () => {
      const client = new MockTDClient();
      client.execute = async (code, from) => {
        client.calls.push({ method: "execute", codeLength: code.length, from });
        return {
          success: true,
          stdout: "not valid json!!!",
          stderr: "",
          from_op: from,
        };
      };
      const res = await compareNetworksHandler(client, {
        path_a: "/compA",
        path_b: "/compB",
      });

      assert.equal(res.isError, true);
    });

    it("handles client error", async () => {
      const client = throwingClient("execute", "TD execution error");
      const res = await compareNetworksHandler(client, {
        path_a: "/compA",
        path_b: "/compB",
      });
      assert.equal(res.isError, true);
    });
  });

  // ===========================================================================
  // Response shape contract — ok()/err() shape for all 18 handlers
  // ===========================================================================
  describe("response shape contract", () => {
    const allHandlers = [
      ["td_pane", paneHandler, {}, "getPaneState"],
      ["td_selection", selectionHandler, {}, "getSelection"],
      ["td_operators", operatorsHandler, { path: "/x" }, "getOperators"],
      ["td_find", findHandler, { path: "/x", query: "blur" }, "findOperators"],
      ["td_connections", connectionsHandler, { path: "/x" }, "getConnections"],
      ["td_get_errors", getErrorsHandler, { path: "/x" }, "getErrors"],
      ["td_healthcheck", healthcheckHandler, { path: "/x" }, "healthcheck"],
      ["td_get_node_detail", nodeDetailHandler, { path: "/x" }, "getNodeDetail"],
      ["td_get_hints", hintsHandler, { node_type: "noiseTOP" }, "getHints"],
      ["td_get_info", infoHandler, {}, "getInfo"],
      ["td_get_focus", focusHandler, {}, "getFocus"],
      ["td_get_perf", perfHandler, {}, "getPerf"],
      ["td_pop_inspect", popInspectHandler, { path: "/x" }, "popInspect"],
      ["td_get_build_compatibility", buildCompatHandler, { op_type: "noiseTOP" }, "getBuildCompatibility"],
      ["td_get_release_delta", releaseDeltaHandler, { build_from: "v1" }, "getReleaseDelta"],
      ["td_spatial_context", spatialContextHandler, {}, "getSpatialContext"],
      ["td_explore_project", exploreProjectHandler, {}, "exploreProject"],
      ["td_compare_networks", compareNetworksHandler, { path_a: "/a", path_b: "/b" }, "execute"],
    ];

    for (const [name, handler, args, methodName] of allHandlers) {
      it(`${name} returns ok() shape on success`, async () => {
        const client = new MockTDClient();
        const res = await handler(client, args);

        assert.equal(res.isError, undefined);
        assert.ok(Array.isArray(res.content));
        assert.ok(res.content[0].text);
      });

      it(`${name} returns err() shape on failure`, async () => {
        const client = throwingClient(methodName, `${name} error`);
        const res = await handler(client, args);

        assert.equal(res.isError, true);
        assert.ok(res.content[0].text);
      });
    }
  });
});
