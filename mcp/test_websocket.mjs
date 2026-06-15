#!/usr/bin/env node
/**
 * test_websocket.mjs — End-to-end WebSocket transport test
 *
 * Tests the WebSocket transport between the Node.js MCP server and TD.
 * Run this with TouchDesigner open and the MCP extension active.
 *
 * Usage:
 *   TDAPI_HOST=localhost TDAPI_PORT=44444 node test_websocket.mjs
 */

import { TDWebSocketClient } from "../api/dist/tdWebSocket.js";

const HOST = process.env.TDAPI_HOST || "localhost";
const PORT = parseInt(process.env.TDAPI_PORT || "44444", 10);

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label} ${detail}`);
    passed++;
  } else {
    console.log(`  ❌ ${label} ${detail}`);
    failed++;
  }
}

async function run() {
  console.log("\n🔌 WebSocket Transport — End-to-End Test");
  console.log("═".repeat(50));
  console.log(`  Target: ws://${HOST}:${PORT}\n`);

  const ws = new TDWebSocketClient({ host: HOST, port: PORT, requestTimeout: 5000 });

  // ── 1. Connect ──────────────────────────────────────────────
  console.log("─── 1. Connection ───\n");

  try {
    await ws.connect();
    check("WebSocket connect", ws.connected);
  } catch (e) {
    console.log(`  ❌ WebSocket connect failed: ${e.message}`);
    console.log("     Make sure TD is running with the MCP extension.\n");
    process.exit(1);
  }

  // ── 2. Basic request: info ──────────────────────────────────
  console.log("\n─── 2. GET /info ───\n");

  try {
    const info = await ws.request("info", {});
    check("info response", info && (info.build || info.status === "ok"), `(build: ${info?.build || "?"})`);
  } catch (e) {
    check("info request", false, e.message);
  }

  // ── 3. Execute Python via WebSocket ─────────────────────────
  console.log("\n─── 3. exec (Python) ───\n");

  try {
    const result = await ws.request("exec", { code: "print('hello from ws')" });
    const output = result?.output || "";
    check("exec print", output.includes("hello from ws"), `(output: ${output.trim()})`);
  } catch (e) {
    check("exec request", false, e.message);
  }

  try {
    const result = await ws.request("exec", { code: "1 + 2" });
    const output = result?.output || "";
    check("exec eval", output.includes("3"), `(output: ${output.trim()})`);
  } catch (e) {
    check("exec eval", false, e.message);
  }

  // ── 4. Editor pane ──────────────────────────────────────────
  console.log("\n─── 4. editor/pane ───\n");

  try {
    const pane = await ws.request("editor/pane", {});
    check("editor/pane", pane !== null, `(path: ${pane?.networkPath || "none"})`);
  } catch (e) {
    check("editor/pane", false, e.message);
  }

  // ── 5. Operators listing ────────────────────────────────────
  console.log("\n─── 5. operators ───\n");

  try {
    const ops = await ws.request("operators", { path: "/" });
    const count = ops?.operators?.length ?? 0;
    check("operators at /", count > 0, `(${count} ops)`);
  } catch (e) {
    check("operators request", false, e.message);
  }

  // ── 6. Healthcheck ──────────────────────────────────────────
  console.log("\n─── 6. healthcheck ───\n");

  try {
    const hc = await ws.request("healthcheck", { path: "/", recurse: false });
    check("healthcheck", hc !== null, `(ok: ${hc?.ok}, issues: ${hc?.issueCount ?? "?"})`);
  } catch (e) {
    check("healthcheck", false, e.message);
  }

  // ── 7. Connections ──────────────────────────────────────────
  console.log("\n─── 7. connections ───\n");

  try {
    const conn = await ws.request("connections", { path: "/", recurse: false });
    check("connections", conn !== null, `(${conn?.operators?.length ?? 0} operators)`);
  } catch (e) {
    check("connections", false, e.message);
  }

  // ── 8. Parameters (read + write) ───────────────────────────
  console.log("\n─── 8. parameters ───\n");

  try {
    const info = await ws.request("info", {});
    // Read parameters of any operator found
    const ops = await ws.request("operators", { path: "/" });
    const firstOp = ops?.operators?.[0];
    if (firstOp) {
      const pars = await ws.request("parameters", { path: firstOp.path });
      check("parameters read", pars?.parameters?.length > 0, `(${pars?.parameters?.length} params at ${firstOp.path})`);
    } else {
      check("parameters read", true, "(no ops to test — skipped)");
    }
  } catch (e) {
    check("parameters read", false, e.message);
  }

  // ── 9. Find ─────────────────────────────────────────────────
  console.log("\n─── 9. find ───\n");

  try {
    const found = await ws.request("find", { path: "/", query: "null" });
    check("find 'null'", found?.results?.length >= 0, `(${found?.results?.length ?? 0} results)");
  } catch (e) {
    check("find request", false, e.message);
  }

  // ── 10. Invalid method (error handling) ──────────────────────
  console.log("\n─── 10. Error handling ───\n");

  try {
    await ws.request("nonexistent_method", {});
    check("invalid method returns error", false, "(should have thrown)");
  } catch (e) {
    check("invalid method throws", e.message.includes("Unknown method") || e.message.includes("TD Error"));
  }

  // ── 11. Concurrent requests ──────────────────────────────────
  console.log("\n─── 11. Concurrent requests ───\n");

  try {
    const [r1, r2, r3] = await Promise.all([
      ws.request("exec", { code: "10" }),
      ws.request("exec", { code: "20" }),
      ws.request("info", {}),
    ]);
    check("concurrent req 1", r1?.output?.includes("10"));
    check("concurrent req 2", r2?.output?.includes("20"));
    check("concurrent req 3", r3?.build !== undefined);
  } catch (e) {
    check("concurrent requests", false, e.message);
  }

  // ── 12. Disconnect ──────────────────────────────────────────
  console.log("\n─── 12. Disconnect ───\n");

  ws.disconnect();
  check("disconnect", !ws.connected);

  // ── Summary ─────────────────────────────────────────────────
  console.log("\n" + "═".repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("═".repeat(50) + "\n");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`\n💥 Fatal: ${e.message}\n`);
  process.exit(1);
});
