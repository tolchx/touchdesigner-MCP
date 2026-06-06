#!/usr/bin/env node
/**
 * Smoke test: lanza el MCP server y prueba todas las funcionalidades.
 * Cada llamada tiene timeout individual para detectar cuelgues.
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Test lives in mcp/test_smoke.mjs, server is mcp/dist/index.js
const serverPath = resolve(__dirname, "dist/index.js");

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
let pending = new Map();
let msgId = 1;
let passed = 0;
let failed = 0;

function send(method, params = {}, timeoutMs = 10000) {
  const id = msgId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
  console.log(`  >> ${method} (id=${id}, timeout=${timeoutMs}ms)`);
  server.stdin.write(msg);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout (${timeoutMs}ms)`));
    }, timeoutMs);
    pending.set(id, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label} ${detail}`);
    passed++;
  } else {
    console.log(`  ❌ ${label} ${detail}`);
    failed++;
  }
}

server.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {}
  }
});

server.stderr.on("data", (chunk) => {
  const text = chunk.toString().trim();
  if (text && !text.includes("Registered tool")) {
    process.stderr.write(`  [stderr] ${text}\n`);
  }
});

async function run() {
  console.log("\n🧪 MCP TD v3 - Smoke Test Completo");
  console.log("════════════════════════════════════\n");

  // ── 1. Tools List ──
  const toolsResp = await send("tools/list");
  const tools = toolsResp.result?.tools || [];
  check("tools/list", tools.length > 0, `(${tools.length} tools)`);
  
  const tdTools = tools.filter(t => t.name.startsWith("td_"));
  check("td_ tools count", tdTools.length >= 40, `(${tdTools.length} td_ tools)`);

  // ── 2. Conexión TD ──
  try {
    const hc = await send("tools/call", { name: "td_healthcheck", arguments: { path: "/", recurse: false } }, 5000);
    const hcText = hc.result?.content?.[0]?.text || "{}";
    const hcData = JSON.parse(hcText);
    if (hc.error || hcData.error) {
      check("TD connection", false, `(${hcData.error || "no connection"})`);
    } else {
      check("TD connection", true, `(connected: ${JSON.stringify(hcData).substring(0, 80)})`);
    }
  } catch (e) {
    check("TD connection", false, `(timeout/error — server not running? ${e.message})`);
  }

  // ── 3. Knowledge Base (local, sin TD) ──
  try {
    const pops = await send("tools/call", { name: "td_pops_query", arguments: { search: "particle", limit: 3 } }, 5000);
    const popsText = JSON.parse(pops.result?.content?.[0]?.text || "{}");
    const popsCount = popsText.results?.length || 0;
    check("POPs query 'particle'", popsCount > 0, `(${popsCount} results)`);
  } catch (e) {
    check("POPs query 'particle'", false, `(${e.message})`);
  }

  try {
    const ops = await send("tools/call", { name: "td_ops_query", arguments: { search: "noise", family: "TOP", limit: 3 } }, 5000);
    const opsText = JSON.parse(ops.result?.content?.[0]?.text || "{}");
    const opsCount = opsText.results?.length || 0;
    check("OPs query 'noise TOP'", opsCount > 0, `(${opsCount} results)`);
  } catch (e) {
    check("OPs query 'noise TOP'", false, `(${e.message})`);
  }

  // ── 4. Parameter Help ──
  try {
    const help = await send("tools/call", { name: "td_get_param_help", arguments: { type: "noiseTOP" } }, 5000);
    const helpText = JSON.parse(help.result?.content?.[0]?.text || "{}");
    check("td_get_param_help noiseTOP", helpText.found === true, `(family: ${helpText.family})`);
  } catch (e) {
    check("td_get_param_help noiseTOP", false, `(${e.message})`);
  }

  // ── 5. Semantic Aliases ──
  try {
    const sem = await send("tools/call", { name: "td_alias_resolve", arguments: { text: "feedback loop" } }, 5000);
    check("td_alias_resolve", !sem.error, "(OK)");
  } catch (e) {
    check("td_alias_resolve", false, `(${e.message})`);
  }

  // ── 6. Network Planner ──
  try {
    const plan = await send("tools/call", { name: "td_network_plan", arguments: { prompt: "create a noise and blur effect system", apply: false } }, 8000);
    const planText = JSON.parse(plan.result?.content?.[0]?.text || "{}");
    const nodeCount = planText.plan?.nodes?.length || 0;
    check("network planner 'noise blur'", nodeCount > 5, `(${nodeCount} nodes found)`);
  } catch (e) {
    check("network planner", false, `(${e.message})`);
  }

  // ── 7. Templates ──
  try {
    const tmpl = await send("tools/call", { name: "td_templates_query", arguments: { search: "particle", limit: 2 } }, 5000);
    check("td_templates_query", !tmpl.error, "(OK)");
  } catch (e) {
    check("td_templates_query", false, `(${e.message})`);
  }

  // ── 8. Batch tool ──
  try {
    const batch = await send("tools/call", { name: "tool_batch", arguments: { tools: [{ name: "getPaneState", args: {} }] } }, 5000);
    check("tool_batch", !batch.error, "(OK)");
  } catch (e) {
    check("tool_batch", false, `(${e.message} — requires TD connection)`);
  }

  // ── Resultados ──
  const total = passed + failed;
  console.log(`\n📊 Resultados: ${passed}/${total} pasaron`);
  if (failed > 0) {
    console.log(`   ${failed} fallaron (mayoría por falta de conexión TD)`);
  }

  server.stdin.end();
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
}

run().catch((e) => {
  console.error(`\n  ❌ Test crash: ${e.message}`);
  process.exit(1);
});
