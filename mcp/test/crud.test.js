/**
 * Unit tests for CRUD tools — the 5 tool handlers in mcp/src/tools/crud.ts:
 *   - td_create_operator  (with GLSL POP auto-config logic)
 *   - td_delete_operator
 *   - td_connect_nodes
 *   - td_disconnect
 *   - td_copy_node
 *
 * These are offline tests: a MockTDClient mirrors the real TDClient method
 * signatures + defaults and returns representative payloads. The handler
 * "mirror" functions below reproduce the EXACT closure logic from crud.ts
 * (argument plumbing, GLSL POP outputattrs/numelems auto-config, the
 * glslConfigWarning catch path, and postModifyValidate integration), so we
 * are testing real behavior without a live TouchDesigner instance.
 *
 * We import the REAL `ok`/`err` (helpers.js) and the REAL `postModifyValidate`
 * (tools/postValidate.js) — postModifyValidate is itself thoroughly covered in
 * postValidate.test.js, so here it runs against a healthy mock healthcheck and
 * we only assert that its result is wired into each handler's response.
 *
 * Build first:  npx tsc -p mcp/tsconfig.json
 * Run:          node --test test/crud.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err } from "../dist/helpers.js";
import { postModifyValidate } from "../dist/tools/postValidate.js";

// ─── GLSL POP types that auto-set outputattrs + numelems ─────────────────────
// Mirrors the constant in crud.ts.
const GLSL_POP_TYPES = new Set([
  "glslPOP",
  "glslCreatePOP",
  "glslAdvancedPOP",
  "glslcopyPOP",
  "glslCopyPOP",
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the parent path of a TD operator path.
 *   "/project1/noise1"      → "/project1"
 *   "/project1/geo1/null1"  → "/project1/geo1"
 *   "/project1"             → "/"
 * Equivalent to getParentPath() in postValidate.ts.
 */
function getParent(path) {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

/** Parse the MCP text payload out of an ok()/err() response. */
function payload(result) {
  return JSON.parse(result.content[0].text);
}

// ─── Mock TDClient ───────────────────────────────────────────────────────────
// Mirrors the real TDClient method signatures + defaults and returns
// representative payloads. Every call is recorded in `this.calls` so tests can
// assert on argument plumbing. Inputs are echoed back in the payloads so the
// "uses the given name/path/input" assertions are meaningful.

class MockTDClient {
  constructor() {
    this.calls = [];
  }

  // createOperator(type, name?, path="/", positionX?, positionY?)
  async createOperator(type, name, opPath, positionX, positionY) {
    opPath = opPath === undefined ? "/" : opPath;
    this.calls.push({
      method: "createOperator",
      type,
      name,
      opPath,
      positionX,
      positionY,
    });
    const parent = opPath === "/" ? "" : opPath;
    const finalName = name || this._defaultName(type);
    return {
      success: true,
      path: `${parent}/${finalName}`,
      name: finalName,
      type,
      opType: type,
      family: "",
      existing: false,
    };
  }

  // TD auto-numbers new ops: noiseTOP → "noise1"
  _defaultName(type) {
    const base = String(type).replace(/(TOP|CHOP|SOP|POP|DAT|MAT|COMP)$/i, "");
    return `${base}1`;
  }

  // deleteOperator(path)
  async deleteOperator(path) {
    this.calls.push({ method: "deleteOperator", path });
    return { success: true, path };
  }

  // connectNodes(sourcePath, targetPath, targetInput=0)
  async connectNodes(sourcePath, targetPath, targetInput) {
    targetInput = targetInput === undefined ? 0 : targetInput;
    this.calls.push({
      method: "connectNodes",
      sourcePath,
      targetPath,
      targetInput,
    });
    return {
      success: true,
      source: sourcePath,
      target: targetPath,
      input_index: targetInput,
    };
  }

  // disconnect(path, inputIndex?)  — real method does `inputIndex ?? 0`
  async disconnect(path, inputIndex) {
    const idx = inputIndex ?? 0;
    this.calls.push({ method: "disconnect", path, inputIndex: idx });
    return { success: true, path, input_index: idx };
  }

  // copyNode(path, destination?, name?)
  async copyNode(path, destination, name) {
    this.calls.push({ method: "copyNode", path, destination, name });
    const parent = destination || getParent(path);
    const copyName = name || "copy";
    return {
      success: true,
      path: `${parent}/${copyName}`,
      name: copyName,
      source: path,
    };
  }

  // setParameters(path, updates, transactional=true)
  // Throws when the target path contains "fail" — used to exercise the GLSL
  // auto-config catch path (glslConfigWarning).
  async setParameters(path, updates, transactional) {
    transactional = transactional === undefined ? true : transactional;
    if (typeof path === "string" && path.includes("fail")) {
      throw new Error("setParameters failed");
    }
    this.calls.push({ method: "setParameters", path, updates, transactional });
    return { success: true, path, updates, transactional };
  }

  // ── Methods used by postModifyValidate ─────────────────────────────────────
  // healthcheck(path, recurse) → always healthy by default.
  async healthcheck(path, recurse) {
    this.calls.push({
      method: "healthcheck",
      path,
      recurse: recurse === undefined ? false : recurse,
    });
    return { ok: true, issueCount: 0, operators: [], issues: [], path, recurse };
  }

  // execute(code, from) → used by autoFixExpressions; not reached when healthy.
  async execute(code, from) {
    this.calls.push({ method: "execute", code, from });
    return { success: true, stdout: '{"fixed": 0}', stderr: "", from_op: from };
  }
}

/**
 * Build a client whose `methodName` throws `message`. Other methods are
 * unreachable for the error-path tests (the handler catches before calling
 * them), so we only stub the throwing method.
 */
function throwingClient(methodName, message) {
  const client = new MockTDClient();
  client[methodName] = async () => {
    throw new Error(message);
  };
  return client;
}

// ─── Handler mirrors (exact logic from crud.ts) ──────────────────────────────

// td_create_operator
async function createOperatorHandler(client, {
  type,
  name,
  path: opPath,
  position_x,
  position_y,
  outputattrs,
  numelems,
}) {
  try {
    const result = await client.createOperator(
      type,
      name,
      opPath ?? "/",
      position_x,
      position_y
    );

    // Auto-set outputattrs + numelems for GLSL POPs
    const isGlslPop = GLSL_POP_TYPES.has(type);
    if (isGlslPop) {
      const createdPath = result.path;
      if (createdPath) {
        const updates = [];
        if (outputattrs !== "") {
          updates.push({ name: "outputattrs", value: outputattrs ?? "P" });
        }
        if (numelems !== 0) {
          updates.push({ name: "numelems", value: numelems ?? 100 });
        }
        if (updates.length > 0) {
          try {
            await client.setParameters(createdPath, updates, false);
            if (outputattrs !== "") result.outputattrs = outputattrs ?? "P";
            if (numelems !== 0) result.numelems = numelems ?? 100;
          } catch {
            result.glslConfigWarning =
              "Operator created but failed to set GLSL params";
          }
        }
      }
    }

    // Post-modification validation
    const parentPath = opPath || "/";
    const createdPath = result.path || `${parentPath}/${name || type}`;
    const validation = await postModifyValidate(client, createdPath, parentPath);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// td_delete_operator
async function deleteOperatorHandler(client, { path }) {
  try {
    const result = await client.deleteOperator(path);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_connect_nodes
async function connectNodesHandler(client, { source_path, target_path, target_input }) {
  try {
    const result = await client.connectNodes(
      source_path,
      target_path,
      target_input ?? 0
    );
    const validation = await postModifyValidate(client, target_path);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// td_disconnect
async function disconnectHandler(client, { path, input_index }) {
  try {
    const result = await client.disconnect(path, input_index ?? 0);
    return ok(result);
  } catch (e) {
    return err(e);
  }
}

// td_copy_node
async function copyNodeHandler(client, { path, destination, name }) {
  try {
    const result = await client.copyNode(path, destination, name);
    const parentPath = destination || getParent(path);
    const validation = await postModifyValidate(client, path, parentPath);
    return ok({ ...result, validation });
  } catch (e) {
    return err(e);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CRUD Tools", () => {
  // ===========================================================================
  // td_create_operator
  // ===========================================================================
  describe("td_create_operator", () => {
    it("basic creation with type → result contains path/name/type", async () => {
      const client = new MockTDClient();
      const res = createOperatorHandler(client, { type: "noiseTOP" });
      const r = await res;
      const data = payload(r);

      assert.equal(r.isError, undefined, "should not be an error response");
      assert.equal(data.success, true);
      assert.ok(data.path, "path should be present");
      assert.equal(data.name, "noise1");
      assert.equal(data.type, "noiseTOP");
    });

    it("creates at '/' parent when no path is given", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, { type: "noiseTOP" })
      );
      const call = client.calls.find((c) => c.method === "createOperator");

      assert.equal(call.opPath, "/");
      // Resulting path is "/noise1" (no double slash from joining "" + "/name")
      assert.equal(data.path, "/noise1");
      assert.ok(!data.path.startsWith("//"), "path must not have a double slash");
    });

    it("with explicit name → name matches in result", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, { type: "noiseTOP", name: "myNoise" })
      );

      assert.equal(data.name, "myNoise");
      assert.ok(data.path.endsWith("/myNoise"));
    });

    it("with position → position_x/position_y forwarded to client", async () => {
      const client = new MockTDClient();
      await createOperatorHandler(client, {
        type: "noiseTOP",
        position_x: 200,
        position_y: -150,
      });
      const call = client.calls.find((c) => c.method === "createOperator");

      assert.equal(call.positionX, 200);
      assert.equal(call.positionY, -150);
    });

    it("with custom path → uses the given parent path", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, {
          type: "noiseTOP",
          path: "/project1/geo1",
        })
      );
      const call = client.calls.find((c) => c.method === "createOperator");

      assert.equal(call.opPath, "/project1/geo1");
      assert.equal(data.path, "/project1/geo1/noise1");
    });

    it("GLSL POP (glslPOP) → auto-sets outputattrs='P' and numelems=100", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, { type: "glslPOP", name: "g1" })
      );
      const setCall = client.calls.find((c) => c.method === "setParameters");

      assert.ok(setCall, "setParameters should be called for GLSL POP");
      assert.equal(setCall.transactional, false);
      const names = setCall.updates.map((u) => u.name).sort();
      assert.deepEqual(names, ["numelems", "outputattrs"]);
      const oa = setCall.updates.find((u) => u.name === "outputattrs");
      const ne = setCall.updates.find((u) => u.name === "numelems");
      assert.equal(oa.value, "P");
      assert.equal(ne.value, 100);
      // Echoed onto the result
      assert.equal(data.outputattrs, "P");
      assert.equal(data.numelems, 100);
    });

    it("GLSL POP with custom outputattrs → uses the custom value", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, {
          type: "glslPOP",
          name: "g2",
          outputattrs: "P Cd N",
        })
      );
      const setCall = client.calls.find((c) => c.method === "setParameters");
      const oa = setCall.updates.find((u) => u.name === "outputattrs");

      assert.equal(oa.value, "P Cd N");
      assert.equal(data.outputattrs, "P Cd N");
      // numelems still defaults to 100
      assert.equal(data.numelems, 100);
    });

    it("GLSL POP with outputattrs='' → skips outputattrs but keeps numelems=100", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, {
          type: "glslPOP",
          name: "g3",
          outputattrs: "",
        })
      );
      const setCall = client.calls.find((c) => c.method === "setParameters");

      assert.ok(setCall, "setParameters still called for numelems");
      assert.equal(
        setCall.updates.find((u) => u.name === "outputattrs"),
        undefined,
        "outputattrs should be skipped"
      );
      assert.equal(
        setCall.updates.find((u) => u.name === "numelems").value,
        100
      );
      assert.equal(data.outputattrs, undefined);
      assert.equal(data.numelems, 100);
    });

    it("GLSL POP with numelems=0 → skips numelems but keeps outputattrs='P'", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, {
          type: "glslPOP",
          name: "g4",
          numelems: 0,
        })
      );
      const setCall = client.calls.find((c) => c.method === "setParameters");

      assert.ok(setCall);
      assert.equal(
        setCall.updates.find((u) => u.name === "numelems"),
        undefined,
        "numelems should be skipped"
      );
      assert.equal(
        setCall.updates.find((u) => u.name === "outputattrs").value,
        "P"
      );
      assert.equal(data.numelems, undefined);
      assert.equal(data.outputattrs, "P");
    });

    it("GLSL POP with outputattrs='' AND numelems=0 → setParameters NOT called", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, {
          type: "glslPOP",
          name: "g5",
          outputattrs: "",
          numelems: 0,
        })
      );

      assert.equal(
        client.calls.some((c) => c.method === "setParameters"),
        false,
        "setParameters should not be called when both are skipped"
      );
      assert.equal(data.outputattrs, undefined);
      assert.equal(data.numelems, undefined);
      assert.equal(data.glslConfigWarning, undefined);
    });

    it("GLSL POP variant glslCreatePOP also triggers auto-config", async () => {
      const client = new MockTDClient();
      await createOperatorHandler(client, { type: "glslCreatePOP", name: "gc" });
      const setCall = client.calls.find((c) => c.method === "setParameters");

      assert.ok(setCall, "glslCreatePOP should auto-configure");
    });

    it("GLSL POP variant glslCopyPOP (capital C) also triggers auto-config", async () => {
      const client = new MockTDClient();
      await createOperatorHandler(client, { type: "glslCopyPOP", name: "gcp" });
      const setCall = client.calls.find((c) => c.method === "setParameters");

      assert.ok(setCall, "glslCopyPOP should auto-configure");
    });

    it("GLSL POP where setParameters fails → sets glslConfigWarning, still ok", async () => {
      const client = new MockTDClient();
      // name "failx" → mock createOperator builds path ".../failx" → setParameters throws
      const data = payload(
        await createOperatorHandler(client, { type: "glslPOP", name: "failx" })
      );

      assert.equal(data.success, true, "operator creation still succeeds");
      assert.equal(
        data.glslConfigWarning,
        "Operator created but failed to set GLSL params"
      );
      assert.equal(data.outputattrs, undefined);
      assert.equal(data.numelems, undefined);
    });

    it("non-GLSL operator → setParameters is NOT called", async () => {
      const client = new MockTDClient();
      await createOperatorHandler(client, { type: "noiseTOP", name: "n1" });

      assert.equal(
        client.calls.some((c) => c.method === "setParameters"),
        false,
        "setParameters must not be called for non-GLSL ops"
      );
    });

    it("client throws → returns err() with the error message", async () => {
      const client = throwingClient("createOperator", "Parent not found");
      const r = await createOperatorHandler(client, { type: "noiseTOP" });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Parent not found");
    });

    it("validation result is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await createOperatorHandler(client, { type: "noiseTOP", name: "v1" })
      );

      assert.ok(data.validation, "validation should be present");
      assert.equal(data.validation.ok, true);
      assert.equal(data.validation.issueCount, 0);
      assert.equal(typeof data.validation.summary, "string");
    });
  });

  // ===========================================================================
  // td_delete_operator
  // ===========================================================================
  describe("td_delete_operator", () => {
    it("basic delete → returns success", async () => {
      const client = new MockTDClient();
      const r = await deleteOperatorHandler(client, { path: "/project1/noise1" });
      const data = payload(r);

      assert.equal(r.isError, undefined);
      assert.equal(data.success, true);
      assert.equal(data.path, "/project1/noise1");
      const call = client.calls.find((c) => c.method === "deleteOperator");
      assert.equal(call.path, "/project1/noise1");
    });

    it("delete does not run postModifyValidate (no healthcheck call)", async () => {
      const client = new MockTDClient();
      await deleteOperatorHandler(client, { path: "/project1/noise1" });

      assert.equal(
        client.calls.some((c) => c.method === "healthcheck"),
        false
      );
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("deleteOperator", "Operator not found");
      const r = await deleteOperatorHandler(client, { path: "/project1/missing" });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Operator not found");
    });
  });

  // ===========================================================================
  // td_connect_nodes
  // ===========================================================================
  describe("td_connect_nodes", () => {
    it("basic connection → result has source/target", async () => {
      const client = new MockTDClient();
      const data = payload(
        await connectNodesHandler(client, {
          source_path: "/project1/noise1",
          target_path: "/project1/blur1",
        })
      );

      assert.equal(data.success, true);
      assert.equal(data.source, "/project1/noise1");
      assert.equal(data.target, "/project1/blur1");
      assert.equal(data.input_index, 0);
    });

    it("default target_input is 0 when omitted", async () => {
      const client = new MockTDClient();
      await connectNodesHandler(client, {
        source_path: "/a",
        target_path: "/b",
      });
      const call = client.calls.find((c) => c.method === "connectNodes");

      assert.equal(call.targetInput, 0);
    });

    it("with custom target_input → input_index matches", async () => {
      const client = new MockTDClient();
      const data = payload(
        await connectNodesHandler(client, {
          source_path: "/a",
          target_path: "/b",
          target_input: 2,
        })
      );
      const call = client.calls.find((c) => c.method === "connectNodes");

      assert.equal(call.targetInput, 2);
      assert.equal(data.input_index, 2);
    });

    it("validation is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await connectNodesHandler(client, {
          source_path: "/a",
          target_path: "/b",
        })
      );

      assert.ok(data.validation);
      assert.equal(data.validation.ok, true);
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("connectNodes", "Invalid connection");
      const r = await connectNodesHandler(client, {
        source_path: "/a",
        target_path: "/b",
      });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Invalid connection");
    });
  });

  // ===========================================================================
  // td_disconnect
  // ===========================================================================
  describe("td_disconnect", () => {
    it("basic disconnect → returns success", async () => {
      const client = new MockTDClient();
      const data = payload(
        await disconnectHandler(client, { path: "/project1/blur1" })
      );

      assert.equal(data.success, true);
      assert.equal(data.path, "/project1/blur1");
      assert.equal(data.input_index, 0);
    });

    it("default input_index is 0 when omitted", async () => {
      const client = new MockTDClient();
      await disconnectHandler(client, { path: "/project1/blur1" });
      const call = client.calls.find((c) => c.method === "disconnect");

      assert.equal(call.inputIndex, 0);
    });

    it("with custom input_index → input_index matches", async () => {
      const client = new MockTDClient();
      const data = payload(
        await disconnectHandler(client, { path: "/project1/blur1", input_index: 1 })
      );
      const call = client.calls.find((c) => c.method === "disconnect");

      assert.equal(call.inputIndex, 1);
      assert.equal(data.input_index, 1);
    });

    it("disconnect does not run postModifyValidate", async () => {
      const client = new MockTDClient();
      await disconnectHandler(client, { path: "/project1/blur1" });

      assert.equal(
        client.calls.some((c) => c.method === "healthcheck"),
        false
      );
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("disconnect", "No such input");
      const r = await disconnectHandler(client, { path: "/project1/blur1" });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "No such input");
    });
  });

  // ===========================================================================
  // td_copy_node
  // ===========================================================================
  describe("td_copy_node", () => {
    it("basic copy (no dest, no name) → success, path present", async () => {
      const client = new MockTDClient();
      const data = payload(
        await copyNodeHandler(client, { path: "/project1/noise1" })
      );

      assert.equal(data.success, true);
      assert.ok(data.path, "copy path should be present");
      // Copies to same parent with default name "copy"
      assert.equal(data.path, "/project1/copy");
      assert.equal(data.name, "copy");
      assert.equal(data.source, "/project1/noise1");
    });

    it("with destination → uses the given destination parent", async () => {
      const client = new MockTDClient();
      const data = payload(
        await copyNodeHandler(client, {
          path: "/project1/noise1",
          destination: "/project1/geo1",
        })
      );
      const call = client.calls.find((c) => c.method === "copyNode");

      assert.equal(call.destination, "/project1/geo1");
      assert.equal(data.path, "/project1/geo1/copy");
    });

    it("with name → name matches in result", async () => {
      const client = new MockTDClient();
      const data = payload(
        await copyNodeHandler(client, {
          path: "/project1/noise1",
          name: "noise1_copy",
        })
      );
      const call = client.calls.find((c) => c.method === "copyNode");

      assert.equal(call.name, "noise1_copy");
      assert.equal(data.name, "noise1_copy");
      assert.ok(data.path.endsWith("/noise1_copy"));
    });

    it("validation is included in the response", async () => {
      const client = new MockTDClient();
      const data = payload(
        await copyNodeHandler(client, { path: "/project1/noise1" })
      );

      assert.ok(data.validation);
      assert.equal(data.validation.ok, true);
    });

    it("client throws → returns err()", async () => {
      const client = throwingClient("copyNode", "Source not found");
      const r = await copyNodeHandler(client, { path: "/project1/missing" });

      assert.equal(r.isError, true);
      assert.equal(payload(r).error, "Source not found");
    });
  });

  // ===========================================================================
  // Error / edge cases (pass-through behavior)
  // ===========================================================================
  describe("edge cases — pass-through to client", () => {
    it("createOperator with empty type → passes through to client", async () => {
      const client = new MockTDClient();
      const r = await createOperatorHandler(client, { type: "" });

      // Empty type is not a GLSL POP, so handler delegates to client as-is.
      assert.equal(r.isError, undefined);
      const call = client.calls.find((c) => c.method === "createOperator");
      assert.equal(call.type, "");
    });

    it("createOperator with very long name → passes through verbatim", async () => {
      const client = new MockTDClient();
      const longName = "a".repeat(500);
      const data = payload(
        await createOperatorHandler(client, { type: "noiseTOP", name: longName })
      );
      const call = client.calls.find((c) => c.method === "createOperator");

      assert.equal(call.name, longName);
      assert.equal(data.name, longName);
    });

    it("createOperator with negative position → passes through", async () => {
      const client = new MockTDClient();
      await createOperatorHandler(client, {
        type: "noiseTOP",
        position_x: -9999,
        position_y: -1,
      });
      const call = client.calls.find((c) => c.method === "createOperator");

      assert.equal(call.positionX, -9999);
      assert.equal(call.positionY, -1);
    });

    it("deleteOperator with deep nested path → passes through", async () => {
      const client = new MockTDClient();
      const deep = "/project1/geo1/base1/null1/select1";
      const data = payload(await deleteOperatorHandler(client, { path: deep }));

      assert.equal(data.success, true);
      assert.equal(data.path, deep);
    });

    it("copyNode with both destination and name → both honored", async () => {
      const client = new MockTDClient();
      const data = payload(
        await copyNodeHandler(client, {
          path: "/project1/noise1",
          destination: "/proj2",
          name: "dup",
        })
      );

      assert.equal(data.path, "/proj2/dup");
      assert.equal(data.name, "dup");
    });
  });

  // ===========================================================================
  // Response-shape contract (ok()/err() integration)
  // ===========================================================================
  describe("response shape contract", () => {
    it("all success responses are ok() shape: { content: [{type:'text', text}] }", async () => {
      const client = new MockTDClient();
      const responses = [
        createOperatorHandler(client, { type: "noiseTOP" }),
        deleteOperatorHandler(client, { path: "/p/x" }),
        connectNodesHandler(client, { source_path: "/a", target_path: "/b" }),
        disconnectHandler(client, { path: "/p/x" }),
        copyNodeHandler(client, { path: "/p/x" }),
      ];

      for (const p of responses) {
        const r = await p;
        assert.ok(Array.isArray(r.content), "content must be an array");
        assert.equal(r.content.length, 1);
        assert.equal(r.content[0].type, "text");
        assert.equal(typeof r.content[0].text, "string");
        assert.equal("isError" in r, false, "success must not set isError");
      }
    });

    it("all error responses are err() shape: content + isError:true", async () => {
      const cases = [
        ["createOperator", () => createOperatorHandler(throwingClient("createOperator", "x"), { type: "t" })],
        ["deleteOperator", () => deleteOperatorHandler(throwingClient("deleteOperator", "x"), { path: "/p" })],
        ["connectNodes", () => connectNodesHandler(throwingClient("connectNodes", "x"), { source_path: "/a", target_path: "/b" })],
        ["disconnect", () => disconnectHandler(throwingClient("disconnect", "x"), { path: "/p" })],
        ["copyNode", () => copyNodeHandler(throwingClient("copyNode", "x"), { path: "/p" })],
      ];

      for (const [, run] of cases) {
        const r = await run();
        assert.ok(Array.isArray(r.content));
        assert.equal(r.content.length, 1);
        assert.equal(r.content[0].type, "text");
        assert.equal(r.isError, true, "error responses must set isError:true");
      }
    });

    it("getParent helper extracts parent path correctly", () => {
      assert.equal(getParent("/project1/noise1"), "/project1");
      assert.equal(getParent("/project1/geo1/null1"), "/project1/geo1");
      assert.equal(getParent("/project1"), "/");
      assert.equal(getParent("/"), "/");
    });
  });
});
