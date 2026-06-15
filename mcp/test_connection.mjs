#!/usr/bin/env node
/**
 * test_connection.mjs — MCP Connection Test Suite
 *
 * Comprehensive tests for:
 *   1. Server startup & protocol handshake
 *   2. TD connection (online/offline detection)
 *   3. CRUD operations (create, read, update, delete)
 *   4. Node connections (wire, disconnect)
 *   5. Parameter read/write
 *   6. Python execution
 *   7. Batch operations
 *   8. Healthcheck & error detection
 *   9. Connection resilience & recovery
 */
import { McpClient } from "./test_helpers.mjs";

// ── Main ────────────────────────────────────────────────────────────

async function run() {
  const HOST = process.env.TDAPI_HOST || "localhost";
  const PORT = process.env.TDAPI_PORT || "44444";

  console.log("\n🔌 MCP Connection Test Suite");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Server: dist/index.js`);
  console.log(`  TD Target: ${HOST}:${PORT}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════\n");

  const client = new McpClient();

  // ── 1. Server Startup & Protocol ──────────────────────────────────
  console.log("── 1. Server Startup & Protocol Handshake ──\n");

  try {
    await client.start();
    client.check("Server process started", true);
  } catch (e) {
    client.check("Server process started", false, `(${e.message})`);
    console.log("\n  ❌ Cannot continue without server. Exiting.\n");
    client.stop();
    process.exit(1);
  }

  try {
    const tools = await client.waitForReady();
    client.check("Protocol handshake (tools/list)", true, `(${tools.length} tools)`);

    // Validate JSON-RPC 2.0
    const raw = await client.send("tools/list", {});
    client.check("JSON-RPC 2.0 response", raw.jsonrpc === "2.0");
    client.check("Has numeric id", typeof raw.id === "number");
    client.check("Has result (not error)", "result" in raw && !("error" in raw));
    client.check("Result has tools array", Array.isArray(raw.result?.tools));

    // Tool categories
    const tdTools = tools.filter((t) => t.name.startsWith("td_"));
    const metaTools = tools.filter((t) => t.name.startsWith("tool_"));
    client.check("Has td_ tools", tdTools.length >= 40, `(${tdTools.length})`);
    client.check("Has tool_batch", metaTools.length > 0);
  } catch (e) {
    client.check("Protocol handshake", false, `(${e.message})`);
  }

  // ── 2. TD Connection Detection ────────────────────────────────────
  console.log("\n── 2. TouchDesigner Connection Detection ──\n");

  let tdConnected = false;

  try {
    const info = await client.call("td_get_info", {}, 5000);
    if (info.ok && info.data) {
      tdConnected = true;
      client.check("TD /info endpoint", true, `(${JSON.stringify(info.data).substring(0, 100)})`);
    } else {
      client.check("TD /info endpoint", false, `(not connected)`);
    }
  } catch (e) {
    client.skip("TD /info endpoint", `(TD not running — ${e.message.substring(0, 80)})`);
  }

  try {
    const hc = await client.call("td_healthcheck", { path: "/", recurse: false }, 5000);
    if (hc.ok && !hc.data?.error) {
      tdConnected = true;
      client.check("Healthcheck /", true, `(ok: ${hc.data?.ok}, operators: ${hc.data?.operators?.length || 0})`);
    } else {
      client.check("Healthcheck /", false, `(${hc.data?.error || "connection error"})`);
    }
  } catch (e) {
    client.skip("Healthcheck /", `(TD not running)`);
  }

  if (!tdConnected) {
    console.log("  ℹ️  TouchDesigner is NOT running. Online tests will be skipped.");
    console.log("     To run online tests, start TD with the MCP server extension.\n");
  }

  // ── 3. Knowledge Base (Offline) ───────────────────────────────────
  console.log("── 3. Knowledge Base (Offline — no TD needed) ──\n");

  const knowledgeTools = [
    { name: "td_pops_query", args: { search: "particle", limit: 3 }, check: (d) => (d.results?.length || 0) > 0, label: "POPs query 'particle'" },
    { name: "td_ops_query", args: { search: "noise", family: "TOP", limit: 3 }, check: (d) => (d.results?.length || 0) > 0, label: "OPs query 'noise TOP'" },
    { name: "td_ops_query", args: { search: "blend", family: "TOP", limit: 3 }, check: (d) => (d.results?.length || 0) > 0, label: "OPs query 'blend TOP'" },
    { name: "td_get_param_help", args: { type: "noiseTOP" }, check: (d) => d.found === true, label: "Param help noiseTOP" },
    { name: "td_get_param_help", args: { type: "particlePOP" }, check: (d) => d.found === true, label: "Param help particlePOP" },
    { name: "td_alias_resolve", args: { text: "feedback loop" }, check: (d) => !d.error, label: "Alias 'feedback loop'" },
    { name: "td_alias_resolve", args: { text: "bloom effect" }, check: (d) => !d.error, label: "Alias 'bloom effect'" },
  ];

  for (const t of knowledgeTools) {
    try {
      const result = await client.call(t.name, t.args, 5000);
      client.check(t.label, result.ok && t.check(result.data), `(${JSON.stringify(result.data).substring(0, 80)})`);
    } catch (e) {
      client.check(t.label, false, `(${e.message.substring(0, 80)})`);
    }
  }

  // ── 4. Network Planner (Offline) ──────────────────────────────────
  console.log("\n── 4. Network Planner (Offline) ──\n");

  const plannerTests = [
    { prompt: "create a noise and blur effect system", label: "Plan 'noise blur'", minNodes: 5 },
    { prompt: "particle system with sphere source", label: "Plan 'particle sphere'", minNodes: 3 },
    { prompt: "feedback loop with composite", label: "Plan 'feedback composite'", minNodes: 3 },
  ];

  for (const pt of plannerTests) {
    try {
      const result = await client.call(
        "td_network_plan",
        { prompt: pt.prompt, apply: false },
        8000,
      );
      const nodeCount = result.data?.plan?.nodes?.length || 0;
      client.check(pt.label, result.ok && nodeCount >= pt.minNodes, `(${nodeCount} nodes)`);
    } catch (e) {
      client.check(pt.label, false, `(${e.message.substring(0, 80)})`);
    }
  }

  // ── 5. CRUD Operations (Online only) ──────────────────────────────
  console.log("\n── 5. CRUD Operations ──\n");

  const TEST_BASE = "/project1/mcp_conn_test";
  const CLEANUP = [];

  if (tdConnected) {
    // 5a. Delete previous test base if exists
    try {
      await client.call("td_delete_operator", { path: TEST_BASE }, 5000);
    } catch {}

    // 5b. Create baseCOMP
    try {
      const r = await client.call("td_create_operator", {
        type: "baseCOMP",
        name: "mcp_conn_test",
        path: "/project1",
        position_x: 50,
        position_y: 50,
      }, 10000);
      client.check("Create baseCOMP", r.ok && !r.data?.error, `(${r.data?.path || r.data?.error})`);
      CLEANUP.push(TEST_BASE);
    } catch (e) {
      client.check("Create baseCOMP", false, `(${e.message})`);
    }

    // 5c. Create operators inside base
    const opsToCreate = [
      { type: "constantTOP", name: "test_const", x: 50, y: 50 },
      { type: "nullTOP", name: "test_null", x: 250, y: 50 },
      { type: "noiseCHOP", name: "test_noise", x: 50, y: 200 },
      { type: "nullCHOP", name: "test_chop_null", x: 250, y: 200 },
    ];

    for (const op of opsToCreate) {
      try {
        const r = await client.call("td_create_operator", {
          type: op.type,
          name: op.name,
          path: TEST_BASE,
          position_x: op.x,
          position_y: op.y,
        }, 10000);
        client.check(`Create ${op.name} (${op.type})`, r.ok && !r.data?.error);
      } catch (e) {
        client.check(`Create ${op.name} (${op.type})`, false, `(${e.message})`);
      }
    }

    // 5d. List operators
    try {
      const r = await client.call("td_operators", { path: TEST_BASE }, 5000);
      const count = r.data?.operators?.length || 0;
      client.check("List operators", count >= 4, `(${count} found)`);
    } catch (e) {
      client.check("List operators", false, `(${e.message})`);
    }

    // 5e. Connect nodes
    try {
      const r = await client.call("td_connect_nodes", {
        source_path: `${TEST_BASE}/test_const`,
        target_path: `${TEST_BASE}/test_null`,
      }, 5000);
      client.check("Connect test_const → test_null", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Connect test_const → test_null", false, `(${e.message})`);
    }

    try {
      const r = await client.call("td_connect_nodes", {
        source_path: `${TEST_BASE}/test_noise`,
        target_path: `${TEST_BASE}/test_chop_null`,
      }, 5000);
      client.check("Connect test_noise → test_chop_null", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Connect test_noise → test_chop_null", false, `(${e.message})`);
    }

    // 5f. Verify connections
    try {
      const r = await client.call("td_connections", { path: TEST_BASE, recurse: true }, 5000);
      const ops = r.data?.operators || [];
      const withInputs = ops.filter((o) => o.inputs?.length > 0).length;
      client.check("Verify connections exist", withInputs >= 2, `(${withInputs} ops with inputs)`);
    } catch (e) {
      client.check("Verify connections", false, `(${e.message})`);
    }

    // 5g. Parameters
    console.log("");
    try {
      const r = await client.call("td_pars_set", {
        path: `${TEST_BASE}/test_const`,
        updates: [{ name: "r", value: 0.8 }, { name: "g", value: 0.2 }],
      }, 5000);
      client.check("Set parameters (r=0.8, g=0.2)", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Set parameters", false, `(${e.message})`);
    }

    try {
      const r = await client.call("td_pars_get", {
        path: `${TEST_BASE}/test_const`,
      }, 5000);
      const paramCount = r.data?.parameters?.length || 0;
      client.check("Get parameters", r.ok && paramCount > 0, `(${paramCount} params)`);
    } catch (e) {
      client.check("Get parameters", false, `(${e.message})`);
    }

    // 5h. Python execution
    console.log("");
    try {
      const r = await client.call("td_execute", {
        code: "import json; print(json.dumps({'test': True, 'host': 'mcp'}))",
      }, 5000);
      client.check("Execute Python code", r.ok && r.data?.success !== false);
    } catch (e) {
      client.check("Execute Python code", false, `(${e.message})`);
    }

    try {
      const r = await client.call("td_execute", {
        code: "import json; t = op('/project1'); print(json.dumps({'path': t.path if t else None}))",
      }, 5000);
      client.check("Execute Python (read TD state)", r.ok);
    } catch (e) {
      client.check("Execute Python (read TD state)", false, `(${e.message})`);
    }

    // 5i. Errors check
    console.log("");
    try {
      const r = await client.call("td_get_errors", { path: TEST_BASE, recurse: true }, 5000);
      client.check("Get errors (no critical)", r.ok && (r.data?.issueCount || 0) === 0, `(${r.data?.issueCount || 0} issues)`);
    } catch (e) {
      client.check("Get errors", false, `(${e.message})`);
    }

    // 5j. Healthcheck on created system
    try {
      const r = await client.call("td_healthcheck", { path: TEST_BASE, recurse: true }, 5000);
      client.check("Healthcheck created system", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Healthcheck created system", false, `(${e.message})`);
    }

    // 5k. Copy node
    try {
      const r = await client.call("td_copy_node", {
        path: `${TEST_BASE}/test_null`,
        destination: TEST_BASE,
        name: "test_null_copy",
      }, 5000);
      client.check("Copy node", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Copy node", false, `(${e.message})`);
    }

    // 5l. Disconnect
    try {
      const r = await client.call("td_disconnect", {
        path: `${TEST_BASE}/test_null`,
        input_index: 0,
      }, 5000);
      client.check("Disconnect node", r.ok && !r.data?.error);
    } catch (e) {
      client.check("Disconnect node", false, `(${e.message})`);
    }

    // 5m. Node detail
    try {
      const r = await client.call("td_get_node_detail", { path: `${TEST_BASE}/test_const` }, 5000);
      client.check("Get node detail", r.ok && r.data?.data?.pars?.length > 0);
    } catch (e) {
      client.check("Get node detail", false, `(${e.message})`);
    }

    // 5n. Snapshot scene
    try {
      const r = await client.call("td_snapshot_scene", { path: TEST_BASE }, 5000);
      client.check("Snapshot scene", r.ok && r.data?.snapshot);
    } catch (e) {
      client.check("Snapshot scene", false, `(${e.message})`);
    }

    // 5o. Search in TD
    try {
      const r = await client.call("td_search", {
        query: "test_const",
        root: TEST_BASE,
      }, 5000);
      client.check("Search in TD", r.ok);
    } catch (e) {
      client.check("Search in TD", false, `(${e.message})`);
    }

    // 5p. Batch operations
    console.log("");
    try {
      const r = await client.call("tool_batch", {
        tools: [
          { name: "getOperators", args: { path: TEST_BASE } },
          { name: "getInfo", args: {} },
        ],
      }, 10000);
      client.check("Batch: getOperators + getInfo", r.ok && r.data?.success);
    } catch (e) {
      client.check("Batch operations", false, `(${e.message})`);
    }

    // ── 6. Cleanup ──────────────────────────────────────────────────
    console.log("\n── 6. Cleanup ──\n");
    for (const path of CLEANUP) {
      try {
        await client.call("td_delete_operator", { path }, 5000);
        client.check(`Delete ${path}`, true);
      } catch (e) {
        client.check(`Delete ${path}`, false, `(${e.message})`);
      }
    }
  } else {
    // Skip online tests
    const onlineTests = [
      "Create baseCOMP", "Create operators", "List operators",
      "Connect nodes", "Set parameters", "Get parameters",
      "Execute Python", "Get errors", "Healthcheck",
      "Copy node", "Disconnect", "Node detail",
      "Snapshot scene", "Search in TD", "Batch operations",
    ];
    for (const t of onlineTests) {
      client.skip(t, "(TD not connected)");
    }
  }

  // ── 7. Error Handling & Edge Cases ────────────────────────────────
  console.log("\n── 7. Error Handling & Edge Cases ──\n");

  // Unknown tool
  try {
    const resp = await client.send("tools/call", {
      name: "nonexistent_tool_abc123",
      arguments: {},
    }, 3000);
    client.check("Unknown tool: no crash", resp.jsonrpc === "2.0");
    client.check("Unknown tool: has error/content", "error" in resp || resp.result?.content);
  } catch (e) {
    client.check("Unknown tool: no crash", false, `(${e.message})`);
  }

  // Invalid method
  try {
    const resp = await client.send("invalid_rpc_method", {});
    client.check("Invalid method: no crash", resp.jsonrpc === "2.0");
    client.check("Invalid method: returns error", resp.error !== undefined);
  } catch (e) {
    client.check("Invalid method: no crash", false, `(${e.message})`);
  }

  // Missing args
  try {
    const resp = await client.send("tools/call", {
      name: "td_pops_query",
      arguments: {},
    }, 5000);
    client.check("Missing args: no crash", resp.jsonrpc === "2.0");
  } catch (e) {
    client.check("Missing args: no crash", false, `(${e.message})`);
  }

  // Concurrent requests
  try {
    const p1 = client.send("tools/list", {});
    const p2 = client.send("tools/call", {
      name: "td_pops_query",
      arguments: { search: "noise", limit: 1 },
    }, 5000);
    const [r1, r2] = await Promise.all([p1, p2]);
    client.check("Concurrent requests: tools/list", r1.jsonrpc === "2.0");
    client.check("Concurrent requests: tool call", r2.jsonrpc === "2.0");
  } catch (e) {
    client.check("Concurrent requests", false, `(${e.message})`);
  }

  // Rapid fire
  try {
    const rapid = [];
    for (let i = 0; i < 5; i++) {
      rapid.push(client.send("tools/list", {}));
    }
    const results = await Promise.all(rapid);
    const allOk = results.every((r) => r.jsonrpc === "2.0" && r.result?.tools);
    client.check("Rapid fire (5x tools/list)", allOk);
  } catch (e) {
    client.check("Rapid fire", false, `(${e.message})`);
  }

  // ── Summary ───────────────────────────────────────────────────────
  const total = client.passed + client.failed + client.skipped;
  console.log("\n═══════════════════════════════════════════════════");
  console.log(`  📊 Connection Test Results`);
  console.log(`     ✅ Passed:  ${client.passed}`);
  console.log(`     ❌ Failed:  ${client.failed}`);
  console.log(`     ⏭  Skipped: ${client.skipped}`);
  console.log(`     📋 Total:   ${total}`);
  if (client.errors.length > 0) {
    console.log(`\n  Failed tests:`);
    for (const e of client.errors) {
      console.log(`    • ${e}`);
    }
  }
  console.log("═══════════════════════════════════════════════════\n");

  client.stop();
  process.exit(client.failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(`\n  💥 Test crash: ${e.message}`);
  process.exit(1);
});
