/**
 * Offline tests for the bridge history MCP tools (mcp/src/tools/bridgeHistory.ts):
 *   - td_undo / td_redo: wrap POST /undo and POST /redo; surface the bridge's
 *     explicit 400 body (success:false + hint) in-band instead of raising;
 *   - td_history: wraps GET /history.
 *
 * The client double mirrors TDClient.undo()/redo()/history() added in
 * api/src/index.ts (they always POST a "{}" body because of the live
 * webserverDAT quirk: bodyless POSTs never deliver their response).
 *
 * Build first: npm run build (workspace root). Run: node --test test/bridgeHistory.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { registerBridgeHistoryTools } from "../dist/tools/bridgeHistory.js";

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

/** TDClient double with configurable undo/redo/history behavior. */
function makeClient({ undoResult, redoResult, historyResult, undoThrow, redoThrow } = {}) {
  const calls = [];
  return {
    calls,
    async undo() {
      calls.push("undo");
      if (undoThrow) throw undoThrow;
      return undoResult;
    },
    async redo() {
      calls.push("redo");
      if (redoThrow) throw redoThrow;
      return redoResult;
    },
    async history() {
      calls.push("history");
      return historyResult;
    },
  };
}

async function callTool(server, name, args = {}) {
  const entry = server.tools.get(name);
  assert.ok(entry, "tool " + name + " must be registered");
  return entry.handler(args);
}

function payload(res) {
  return JSON.parse(res.content[0].text);
}

const HISTORY_BODY = {
  maxDepth: 50,
  canUndo: true,
  canRedo: false,
  undo: [{ id: "374c20ef", description: "parameters.set on /project1/n1 (tx)", kind: "parameters" }],
  redo: [],
};

const UNDO_OK = {
  success: true,
  undone: "parameters.set on /project1/n1 (tx)",
  kind: "parameters",
  applied: 1,
  errors: [],
  depth: 0,
  canUndo: false,
  canRedo: true,
};

const UNDO_EMPTY = {
  success: false,
  error: "Nothing to undo: the history is empty",
  hint: "Only bridge write requests (/parameters/set, /create, /delete, /connect, /disconnect) are recorded; run one first or check GET /history",
};

describe("td_undo", () => {
  it("is registered and returns the bridge undo body", async () => {
    const server = makeServer();
    const client = makeClient({ undoResult: UNDO_OK });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_undo");
    assert.equal(res.isError, undefined);
    assert.deepEqual(payload(res), UNDO_OK);
    assert.deepEqual(client.calls, ["undo"]);
  });

  it("surfaces the explicit 400 empty-history body in-band (not as error)", async () => {
    const server = makeServer();
    const client = makeClient({
      undoThrow: new Error(`HTTP 400 Bad Request: ${JSON.stringify(UNDO_EMPTY)}`),
    });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_undo");
    assert.equal(res.isError, undefined, "explicit bridge 400 must be in-band");
    const body = payload(res);
    assert.equal(body.httpStatus, 400);
    assert.equal(body.success, false);
    assert.ok(body.hint.includes("/history"));
  });

  it("is an error for unexpected failures (no JSON body)", async () => {
    const server = makeServer();
    const client = makeClient({ undoThrow: new Error("Request timed out after 30000ms") });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_undo");
    assert.equal(res.isError, true);
  });
});

describe("td_redo", () => {
  it("is registered and returns the bridge redo body", async () => {
    const server = makeServer();
    const client = makeClient({
      redoResult: { success: true, redone: "create /project1/n2", kind: "ops", applied: 1, errors: [], depth: 1, canUndo: true, canRedo: false },
    });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_redo");
    assert.equal(res.isError, undefined);
    const body = payload(res);
    assert.equal(body.success, true);
    assert.equal(body.kind, "ops");
    assert.deepEqual(client.calls, ["redo"]);
  });

  it("surfaces the explicit 400 nothing-to-redo body in-band", async () => {
    const server = makeServer();
    const client = makeClient({
      redoThrow: new Error(
        `HTTP 400 Bad Request: ${JSON.stringify({
          success: false,
          error: "Nothing to redo: no undone operation pending",
          hint: "Redo is only available right after an /undo; a new write clears it. See GET /history",
        })}`,
      ),
    });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_redo");
    assert.equal(res.isError, undefined);
    const body = payload(res);
    assert.equal(body.success, false);
    assert.match(body.error, /Nothing to redo/);
  });
});

describe("td_history", () => {
  it("is registered and returns the history listing", async () => {
    const server = makeServer();
    const client = makeClient({ historyResult: HISTORY_BODY });
    registerBridgeHistoryTools(server, client);
    const res = await callTool(server, "td_history");
    assert.equal(res.isError, undefined);
    assert.deepEqual(payload(res), HISTORY_BODY);
    assert.deepEqual(client.calls, ["history"]);
  });
});

describe("registration", () => {
  it("registers exactly the three bridge history tools", () => {
    const server = makeServer();
    registerBridgeHistoryTools(server, makeClient());
    assert.deepEqual([...server.tools.keys()].sort(), ["td_history", "td_redo", "td_undo"]);
  });
});
