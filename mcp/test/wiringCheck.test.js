/**
 * Offline tests: td_verify_wiring MCP tool (mcp/src/tools/wiringCheck.ts).
 *
 *   - registration + schema
 *   - happy path: wiring matches expectation exactly
 *   - missing wire, missing output, WRONG INPUT INDEX reported by name
 *   - both input formats accepted: expect spec string and edges array
 *   - bad spec / no expectation -> explicit error, never a silent pass
 *   - recurse flag forwarded to client.getConnections
 *
 * No TouchDesigner required. Build first: cd mcp && npm run build
 * Run: node --test test/wiringCheck.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  registerWiringCheckTools,
  parseEdgeSpec,
  verifyWiring,
} from "../dist/tools/wiringCheck.js";

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

/** TDClient double serving a canned getConnections result. */
function makeClient(connections, meta = {}) {
  const calls = [];
  return {
    calls,
    getConnections: async (path, recurse) => {
      calls.push({ path, recurse });
      return {
        path,
        recurse,
        total: connections.length,
        returned: connections.length,
        limit: 500,
        offset: 0,
        truncated: false,
        connections,
        ...meta,
      };
    },
  };
}

/** Invoke a registered tool handler through the SDK result shape. */
async function callTool(server, name, args) {
  const entry = server.tools.get(name);
  assert.ok(entry, "tool " + name + " must be registered");
  return entry.handler(args);
}

function payload(res) {
  return JSON.parse(res.content[0].text);
}

const REAL_EDGES = [
  { from: "srcA", fromPath: "/p/srcA", to: "nz", toPath: "/p/nz", input: 0 },
  { from: "nz", fromPath: "/p/nz", to: "mg", toPath: "/p/mg", input: 0 },
  { from: "srcB", fromPath: "/p/srcB", to: "mg", toPath: "/p/mg", input: 1 },
  { from: "mg", fromPath: "/p/mg", to: "out", toPath: "/p/out", input: 0 },
];
const SPEC = "srcA->nz:0,nz->mg:0,srcB->mg:1,mg->out:0";

describe("parseEdgeSpec", () => {
  it("parses from->to:input pairs", () => {
    assert.deepEqual(parseEdgeSpec(SPEC), [
      { from: "srcA", to: "nz", input: 0 },
      { from: "nz", to: "mg", input: 0 },
      { from: "srcB", to: "mg", input: 1 },
      { from: "mg", to: "out", input: 0 },
    ]);
  });

  it("rejects malformed parts with an actionable message", () => {
    assert.throws(() => parseEdgeSpec("srcA->nz"), /from->to:input/);
    assert.throws(() => parseEdgeSpec(""), /no edges/i);
  });
});

describe("verifyWiring (pure)", () => {
  it("exact match -> ok with empty diffs", () => {
    const r = verifyWiring("/p", parseEdgeSpec(SPEC), REAL_EDGES);
    assert.equal(r.ok, true);
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.unexpected, []);
    assert.equal(r.totalEdges, 4);
  });

  it("wrong input index is reported as missing + unexpected", () => {
    const rewired = REAL_EDGES.map((e) =>
      e.from === "srcB" ? { ...e, input: 0 } : e,
    );
    const r = verifyWiring("/p", parseEdgeSpec(SPEC), rewired);
    assert.equal(r.ok, false);
    assert.deepEqual(r.missing, ["srcB->mg:1"]);
    assert.deepEqual(r.unexpected, ["srcB->mg:0"]);
  });
});

describe("td_verify_wiring tool", () => {
  it("is registered", () => {
    const server = makeServer();
    registerWiringCheckTools(server, makeClient(REAL_EDGES));
    assert.ok(server.tools.get("td_verify_wiring"));
  });

  it("passes when the wiring matches (expect string)", async () => {
    const client = makeClient(REAL_EDGES);
    const server = makeServer();
    registerWiringCheckTools(server, client);
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: SPEC,
    });
    assert.equal(res.isError, undefined);
    const data = payload(res);
    assert.equal(data.ok, true);
    assert.equal(data.missingCount, 0);
    assert.equal(data.totalEdges, 4);
    assert.match(data.hint, /matches/);
    // recurse defaults to true and reaches the real client method
    assert.deepEqual(client.calls, [{ path: "/project1/net", recurse: true }]);
  });

  it("fails with the exact missing edge when a wire is absent", async () => {
    const server = makeServer();
    registerWiringCheckTools(
      server,
      makeClient(REAL_EDGES.filter((e) => !(e.from === "srcB" && e.input === 1))),
    );
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: SPEC,
    });
    const data = payload(res);
    assert.equal(data.ok, false);
    assert.deepEqual(data.missing, ["srcB->mg:1"]);
    assert.match(data.hint, /rule 12/i);
  });

  it("detects a wrong input index on a multi-input op", async () => {
    const server = makeServer();
    registerWiringCheckTools(
      server,
      makeClient(
        REAL_EDGES.map((e) => (e.from === "srcB" ? { ...e, input: 0 } : e)),
      ),
    );
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: SPEC,
    });
    const data = payload(res);
    assert.equal(data.ok, false);
    assert.deepEqual(data.missing, ["srcB->mg:1"]);
    assert.deepEqual(data.unexpected, ["srcB->mg:0"]);
  });

  it("flags unexpected extra wiring", async () => {
    const server = makeServer();
    registerWiringCheckTools(
      server,
      makeClient([...REAL_EDGES, { from: "x", fromPath: "/p/x", to: "mg", toPath: "/p/mg", input: 2 }]),
    );
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: SPEC,
    });
    const data = payload(res);
    assert.equal(data.ok, false);
    assert.deepEqual(data.unexpected, ["x->mg:2"]);
  });

  it("accepts the structured edges array form", async () => {
    const server = makeServer();
    registerWiringCheckTools(server, makeClient(REAL_EDGES));
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      edges: [
        { from: "srcA", to: "nz", input: 0 },
        { from: "nz", to: "mg", input: 0 },
        { from: "srcB", to: "mg", input: 1 },
        { from: "mg", to: "out", input: 0 },
      ],
    });
    const data = payload(res);
    assert.equal(data.ok, true);
  });

  it("errors explicitly without expectations instead of passing silently", async () => {
    const server = makeServer();
    registerWiringCheckTools(server, makeClient(REAL_EDGES));
    const res = await callTool(server, "td_verify_wiring", { path: "/project1/net" });
    assert.equal(res.isError, true);
    assert.match(payload(res).error, /No expected edges/i);
  });

  it("propagates a bad expect spec as an error", async () => {
    const server = makeServer();
    registerWiringCheckTools(server, makeClient(REAL_EDGES));
    const res = await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: "srcA->nz",
    });
    assert.equal(res.isError, true);
    assert.match(payload(res).error, /Bad expected-edges input/);
  });

  it("forwards recurse=false to the client", async () => {
    const client = makeClient(REAL_EDGES);
    const server = makeServer();
    registerWiringCheckTools(server, client);
    await callTool(server, "td_verify_wiring", {
      path: "/project1/net",
      expect: SPEC,
      recurse: false,
    });
    assert.deepEqual(client.calls, [{ path: "/project1/net", recurse: false }]);
  });
});
