/**
 * Bridge contract suite (backlog item 11): TS TDClient <-> Python bridge.
 *
 * Detects DRIFT between the bodies the TS client (api/src/index.ts) actually
 * builds and what the bridge handlers expect. The REAL TDClient runs against
 * a loopback HTTP stub; every POST is captured and compared field by field
 * against the SAME declarative contract the Python suite uses:
 * tests/bridge_contract.json.
 *
 * If you change a write endpoint, update that contract in the same commit or
 * these tests fail naming the diverging field and the side that moved.
 *
 * Limitations (honest scope):
 *   - Only POST endpoints are shape-contracted here; GETs are inventoried in
 *     the contract file (no body to drift).
 *   - Endpoints whose TS callers build inline Python (setParameters,
 *     createOperator, ...) travel through /exec; their payload schemas are
 *     verified by decoding the generated code (e.g. base64 updates array).
 *   - The stdio Python client (mcp_server_stdio.py) is covered by
 *     tests/test_client_contract.py — same contract file.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { TDClient } from "../../api/dist/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT = JSON.parse(
  readFileSync(join(REPO, "tests", "bridge_contract.json"), "utf-8"),
);
const POSTS = CONTRACT.post_endpoints;

// ---------------------------------------------------------------------------
// Loopback stub: captures every POST, answers the contract success shape.
// ---------------------------------------------------------------------------
const captured = []; // { uri, body }

function contractResponse(uri) {
  const spec = POSTS[uri];
  const resp = spec.response || {};
  const body = {};
  for (const k of resp.keys || [])
    body[k] = k === "taskId" ? "t-1" : k === "output" ? "(ok)" : [];
  if (uri === "/exec") {
    // Real bridge: output carries whatever the executed code printed. The
    // /exec-based TS callers (setParameters, createOperator, ...) print JSON,
    // so the stub echoes a success JSON for executeJson to parse.
    return { output: JSON.stringify({ success: true }) };
  }
  if (uri === "/execute_async") return { taskId: "t-1", status: "queued" };
  if (uri === "/undo" || uri === "/redo") {
    return {
      success: true,
      [uri === "/undo" ? "undone" : "redone"]: "x",
      kind: "parameters",
      applied: [],
      errors: [],
      depth: 1,
      canUndo: uri === "/undo",
      canRedo: uri === "/redo",
    };
  }
  return body;
}

const server = http.createServer((req, res) => {
  const uri = (req.url || "").split("?")[0];
  if (req.method === "POST") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { __raw__: raw };
      }
      captured.push({ uri, body, method: req.method });
      if (!POSTS[uri]) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `stub has no contract for ${uri}` }));
        return;
      }
      res.writeHead(POSTS[uri].response?.success_status ?? 200, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(contractResponse(uri)));
    });
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({}));
});

let client;
let port;

before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  port = server.address().port;
  client = new TDClient({ host: "127.0.0.1", port, transport: "http" });
});

after(async () => {
  await new Promise((r) => server.close(r));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function postsTo(uri) {
  const hits = captured.filter((c) => c.uri === uri && c.method === "POST");
  assert.ok(hits.length > 0, `no POST to ${uri} was captured`);
  return hits;
}

/** Field-by-field comparison of a captured body against the contract. */
function assertBodyMatchesContract(uri, body) {
  const spec = POSTS[uri].request;
  for (const field of spec.required) {
    assert.ok(
      field in body,
      `CONTRACT DRIFT on ${uri}: TS client omits required field '${field}'`,
    );
  }
  for (const field of Object.keys(body)) {
    assert.ok(
      spec.allowed.includes(field),
      `CONTRACT DRIFT on ${uri}: TS client sends unknown field '${field}' ` +
        `(bridge handler expects only ${JSON.stringify(spec.allowed)})`,
    );
    const decl = spec.fields?.[field];
    if (decl && decl.type) {
      const types = (Array.isArray(decl.type) ? decl.type : [decl.type]).map(
        // JSON "integer" is enforced as JS "number" (no integer typeof).
        (t) => (t === "integer" ? "number" : t),
      );
      const ok = types.some((t) => typeof body[field] === t);
      assert.ok(
        ok,
        `CONTRACT DRIFT on ${uri}: field '${field}' has TS type ` +
          `${typeof body[field]}, contract declares ${JSON.stringify(decl.type)}`,
      );
    }
  }
}

/** Extract the base64 updates payload from setParameters' inline Python. */
function decodeUpdatesFromExecCode(code) {
  const m = code.match(/b64decode\('([^']+)'\)/);
  assert.ok(m, "setParameters /exec code must embed a base64 updates payload");
  return JSON.parse(Buffer.from(m[1], "base64").toString("utf-8"));
}

// ---------------------------------------------------------------------------
// Tests: each native POST client method vs the contract
// ---------------------------------------------------------------------------
describe("TS client POST bodies match the bridge contract", () => {
  it("execute() posts {code, fromOp} to /exec", async () => {
    captured.length = 0;
    const r = await client.execute("print(1)", "/project1");
    const [{ uri, body }] = postsTo("/exec");
    assert.equal(uri, "/exec");
    assertBodyMatchesContract("/exec", body);
    assert.equal(body.code, "print(1)");
    assert.equal(body.fromOp, "/project1");
    assert.equal(r.success, true);
  });

  it("executeAsync() posts {code, fromOp} to /execute_async (NOT shadowed into /execute)", async () => {
    captured.length = 0;
    const { taskId } = await client.executeAsync("print('x')");
    const hits = postsTo("/execute_async");
    assert.equal(hits[0].body.code, "print('x')");
    assertBodyMatchesContract("/execute_async", hits[0].body);
    assert.equal(taskId, "t-1");
    // The shadow regression: no /execute route may have swallowed the POST.
    assert.ok(
      !captured.some((c) => c.uri === "/execute"),
      "DRIFT: executeAsync was routed to /execute (shadowed by startswith('/execute'))",
    );
  });

  it("autoLayout() posts {path, spacing_x, spacing_y} to /auto_layout", async () => {
    captured.length = 0;
    await client.autoLayout("/project1", 300, 90);
    const [{ body }] = postsTo("/auto_layout");
    assertBodyMatchesContract("/auto_layout", body);
    assert.equal(body.path, "/project1");
    assert.equal(body.spacing_x, 300);
    assert.equal(body.spacing_y, 90);
  });

  it("smartConnect() posts {source, destination, type?, name?} to /smart_connect", async () => {
    captured.length = 0;
    await client.smartConnect("/project1/a", "/project1/b");
    const [{ body }] = postsTo("/smart_connect");
    assertBodyMatchesContract("/smart_connect", body);
    assert.equal(body.source, "/project1/a");
    assert.equal(body.destination, "/project1/b");
  });

  it("undo()/redo() post {} to /undo and /redo", async () => {
    captured.length = 0;
    await client.undo();
    await client.redo();
    assertBodyMatchesContract("/undo", postsTo("/undo")[0].body);
    assertBodyMatchesContract("/redo", postsTo("/redo")[0].body);
  });

  it("setParameters() reaches /parameters/set semantics via /exec with a decodable updates[] payload", async () => {
    captured.length = 0;
    await client.setParameters("/project1/noise1", [
      { name: "amp", value: 0.5 },
    ]);
    const [{ body }] = postsTo("/exec");
    const updates = decodeUpdatesFromExecCode(body.code);
    const itemSpec = POSTS["/parameters/set"].request.fields.updates.items;
    assert.ok(Array.isArray(updates) && updates.length === 1);
    for (const item of updates) {
      assert.ok(
        "name" in item,
        "updates item missing 'name' (the canonical field)",
      );
      for (const k of Object.keys(item)) {
        assert.ok(
          itemSpec.allowed.includes(k),
          `CONTRACT DRIFT in setParameters updates item: unknown field '${k}' ` +
            `(canonical: ${JSON.stringify(itemSpec.allowed)})`,
        );
      }
    }
    assert.equal(updates[0].name, "amp");
    assert.equal(updates[0].value, 0.5);
  });
});

// ---------------------------------------------------------------------------
// Tests: inventory cross-check (both directions)
// ---------------------------------------------------------------------------
describe("client/bridge endpoint inventory matches the contract", () => {
  it("every POST the TS client makes is declared in the contract", async () => {
    // Drive every POST-capable method once.
    captured.length = 0;
    await client.execute("1");
    await client.executeAsync("1");
    await client.autoLayout();
    await client.smartConnect("/a", "/b");
    await client.undo();
    await client.redo();
    await client.setParameters("/p", [{ name: "amp", value: 1 }]);
    for (const c of captured) {
      assert.ok(
        POSTS[c.uri],
        `CONTRACT GAP: TS client posts to '${c.uri}' which is NOT in ` +
          `tests/bridge_contract.json post_endpoints - declare it (new ` +
          `endpoint) or fix the client`,
      );
    }
  });

  it("every endpoint the contract claims the TS client uses is actually exercised", () => {
    // Drive again and check the contract's clients.ts claims are all real.
    const used = new Set(captured.map((c) => c.uri));
    for (const [uri, spec] of Object.entries(POSTS)) {
      if (spec.clients.ts.length === 0) continue;
      assert.ok(
        used.has(uri),
        `CONTRACT STALE: contract says the TS client uses '${uri}' ` +
          `(${spec.clients.ts.join(", ")}) but no POST to it was captured - ` +
          `update tests/bridge_contract.json`,
      );
    }
  });
});
