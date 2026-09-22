/**
 * Tests for applyNetwork.ts:
 *   - detectSlotCollisions — pure pre-build guard for dynamic-input slot
 *     replacement (AGENTS.md rule 12, NEG3 evidence).
 *   - applyNetworkGraph blocked path — collision must refuse to build
 *     (created=0, connected=0) and never touch the client.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  detectSlotCollisions,
  applyNetworkGraph,
} from "../dist/applyNetwork.js";

/** Client double that resolves creates and serves canned /connections edges. */
function makeWiringClient(edges) {
  const calls = [];
  return {
    calls,
    createOperator: async (opType, label, parentPath) => ({
      path: `${parentPath}/${label}`,
    }),
    setParameters: async () => ({}),
    connectNodes: async () => ({ success: true }),
    execute: async () => ({ success: true, stdout: "{}" }),
    getConnections: async (path, recurse) => {
      calls.push({ path, recurse });
      return { connections: edges };
    },
  };
}

function makeGraph(connections, overrides = {}) {
  return {
    description: "test graph",
    nodes: [
      { id: "a", opType: "boxPOP", label: "a", parentPath: "/project1/net" },
      { id: "b", opType: "boxPOP", label: "b", parentPath: "/project1/net" },
      { id: "mg", opType: "mergePOP", label: "mg", parentPath: "/project1/net" },
      { id: "out", opType: "nullPOP", label: "out", parentPath: "/project1/net" },
    ],
    connections,
    targetPath: "/project1/net",
    ...overrides,
  };
}

describe("detectSlotCollisions", () => {
  it("flags two edges targeting the same dynamic-input slot", () => {
    const warnings = detectSlotCollisions(
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 0 },
      ]),
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Slot collision on mg input 0/);
    assert.match(warnings[0], /a→mg\[0\]/);
    assert.match(warnings[0], /b→mg\[0\]/);
    assert.match(warnings[0], /REPLACE/);
  });

  it("does not flag distinct slots on the same destination", () => {
    const warnings = detectSlotCollisions(
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 1 },
      ]),
    );
    assert.equal(warnings.length, 0);
  });

  it("does not flag edges to different destinations", () => {
    const warnings = detectSlotCollisions(
      makeGraph([
        { from: "a", to: "out", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 0 },
      ]),
    );
    assert.equal(warnings.length, 0);
  });

  it("flags three-way collisions with one warning naming all edges", () => {
    const warnings = detectSlotCollisions(
      makeGraph([
        { from: "a", to: "mg", inputIndex: 2 },
        { from: "b", to: "mg", inputIndex: 2 },
        { from: "out", to: "mg", inputIndex: 2 },
      ]),
    );
    assert.equal(warnings.length, 1);
    for (const edge of ["a→mg[2]", "b→mg[2]", "out→mg[2]"]) {
      assert.ok(warnings[0].includes(edge), `warning should name ${edge}`);
    }
  });

  it("defaults missing inputIndex to slot 0", () => {
    const warnings = detectSlotCollisions(
      makeGraph([
        { from: "a", to: "mg", inputIndex: undefined },
        { from: "b", to: "mg", inputIndex: 0 },
      ]),
    );
    assert.equal(warnings.length, 1);
  });

  it("returns no warnings for an empty graph", () => {
    assert.deepEqual(detectSlotCollisions(makeGraph([])), []);
  });
});

describe("applyNetworkGraph slot-collision guard", () => {
  it("blocks the build before creating any node", async () => {
    const clientCalls = [];
    const client = new Proxy({}, {
      get(_t, prop) {
        return (...args) => {
          clientCalls.push([prop, args]);
          return Promise.resolve({ path: "/project1/net/x" });
        };
      },
    });

    const result = await applyNetworkGraph(
      client,
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 0 },
      ]),
    );

    assert.equal(result.success, false);
    assert.equal(result.created, 0, "no nodes may be created");
    assert.equal(result.connected, 0, "no wires may be made");
    assert.equal(clientCalls.length, 0, "client must never be touched");
    assert.match(result.errors[0], /Blocked before build/);
    assert.ok(result.warnings.length >= 1);
    assert.match(result.warnings[0], /Slot collision/);
  });

  it("lets a collision-free graph proceed to the client", async () => {
    const calls = [];
    const client = new Proxy({}, {
      get(_t, prop) {
        return (...args) => {
          calls.push(prop);
          if (prop === "createOperator") {
            return Promise.resolve({ path: "/project1/net/n" });
          }
          if (prop === "execute") {
            return Promise.resolve({ success: true, output: "{}" });
          }
          return Promise.resolve({});
        };
      },
    });

    const result = await applyNetworkGraph(
      client,
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 1 },
      ]),
    );

    assert.ok(calls.includes("createOperator"), "createOperator must be called");
    assert.ok(calls.includes("connectNodes"), "connectNodes must be called");
    assert.equal(result.created, 4);
  });

  it("verifies wiring automatically after building (rule 16, spec embedded)", async () => {
    const client = makeWiringClient([
      { from: "a", to: "mg", input: 0 },
      { from: "b", to: "mg", input: 1 },
    ]);
    const result = await applyNetworkGraph(
      client,
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 1 },
      ]),
    );
    assert.ok(client.calls.some((c) => c.path === "/project1/net" && c.recurse === true),
      "getConnections must be called on the target path");
    assert.ok(result.wiring, "wiring result must be present");
    assert.equal(result.wiring.ok, true);
    assert.equal(result.success, true);
  });

  it("reports a wiring mismatch after building when edges differ", async () => {
    // The b->mg:1 wire silently absent (dynamic-input replacement style).
    const client = makeWiringClient([
      { from: "a", to: "mg", input: 0 },
    ]);
    const result = await applyNetworkGraph(
      client,
      makeGraph([
        { from: "a", to: "mg", inputIndex: 0 },
        { from: "b", to: "mg", inputIndex: 1 },
      ]),
    );
    assert.ok(result.wiring);
    assert.equal(result.wiring.ok, false);
    assert.deepEqual(result.wiring.missing, ["b->mg:1"]);
    assert.ok(result.errors.some((e) => /Wiring mismatch after build/.test(e)),
      "mismatch must surface in errors");
    assert.equal(result.success, false);
  });

  it("skips wiring verification explicitly when the client cannot read connections", async () => {
    const client = {
      createOperator: async (opType, label, parentPath) => ({ path: `${parentPath}/${label}` }),
      setParameters: async () => ({}),
      connectNodes: async () => ({ success: true }),
      execute: async () => ({ success: true, stdout: "{}" }),
      // no getConnections
    };
    const result = await applyNetworkGraph(
      client,
      makeGraph([{ from: "a", to: "mg", inputIndex: 0 }]),
    );
    assert.ok(result.wiring && typeof result.wiring.skipped === "string",
      "wiring must be explicitly skipped, never silently absent");
    assert.match(result.wiring.skipped, /td_verify_wiring/);
    assert.ok(result.warnings.some((w) => /Wiring verification skipped/.test(w)));
  });
});
