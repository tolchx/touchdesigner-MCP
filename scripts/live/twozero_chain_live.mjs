/**
 * Aceptación EN VIVO (item 50, bloques a/c + evidencia del item 43) del TD-MCP.
 *
 * Corre contra el bridge REAL en 127.0.0.1:44444 usando el cliente real
 * (api/dist) y la MISMA lógica que ejecutan las tools (runHealthChain de
 * mcp/dist/tools/health.js y runBounded de mcp/dist/exploreGuard.js).
 *
 * Uso:  node scripts/live/twozero_chain_live.mjs [--scope /]
 * Salida: JSON por stdout + .freebuff_tasks/evidence/twozero_chain_live.json
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TDClient, clientLogPath, getRecentCalls, getCallStats, getLastOkAt } from "../../api/dist/index.js";
import { runHealthChain } from "../../mcp/dist/tools/health.js";
import { runBounded, ExploreTimeoutError, normalizeScope } from "../../mcp/dist/exploreGuard.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const EVID = join(REPO, ".freebuff_tasks", "evidence");
const SCOPE = (process.argv.includes("--scope") ? process.argv[process.argv.indexOf("--scope") + 1] : "/") || "/";

const out = { started_at: new Date().toISOString(), scope: SCOPE, checks: [] };
function rec(name, ok, detail, ms) {
  out.checks.push({ name, ok, detail, ms: Math.round(ms) });
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${ms != null ? ` (${Math.round(ms)}ms)` : ""}  ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}`);
}

// ─── (a1) cadena contra el bridge real ───────────────────────────────────────
{
  const t0 = Date.now();
  const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http", retryAttempts: 3, retryBaseDelayMs: 150 });
  const h = await runHealthChain(client, { path: SCOPE, recurse: true });
  const ms = Date.now() - t0;
  out.healthchain_ok_case = h;
  const expectedOk = h.verdict === "OK";
  rec("healthchain contra TD real (veredicto != DOWN)", expectedOk, { verdict: h.verdict, hint: h.hint, warnings: h.warnings, runtime: h.runtime, checks: h.checks.map(c => ({ n: c.name, ok: c.ok, ms: c.ms })) }, ms);
}

// ─── (a2) veredicto DOWN con un puerto muerto ────────────────────────────────
{
  const t0 = Date.now();
  const dead = new TDClient({ host: "127.0.0.1", port: 44999, transport: "http", retryAttempts: 3, retryBaseDelayMs: 20, connectionTimeout: 1500 });
  const h = await runHealthChain(dead, {});
  const ms = Date.now() - t0;
  out.healthchain_down_case = h;
  const t = h.transport;
  rec("healthchain con bridge muerto -> DOWN + clasificación de transporte", h.verdict === "DOWN" && !!t && t.attempts === 3, { verdict: h.verdict, kind: t?.kind, attempts: t?.attempts, bridge: t?.bridge, hint: t?.hint, retries_evidencia: (h.evidence?.recent_calls ?? []).slice(-3).map(c => `${c.target} intento ${c.attempt} -> ${c.kind}`) }, ms);
}

// ─── (c) busqueda SIN acotar sobre la red grande, con presupuesto ────────────
{
  const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http", retryAttempts: 1, requestTimeout: 120000 });
  const scope = normalizeScope(SCOPE);
  const t0 = Date.now();
  let status = "completed", payload = null, err = null;
  try {
    payload = await runBounded("td_find", scope, () => client.findOperators({ path: scope, recursive: true, limit: 100, query: "" }), 20000);
  } catch (e) {
    err = e;
    status = e instanceof ExploreTimeoutError ? "timeout_guard" : "error";
  }
  const ms = Date.now() - t0;
  out.find_unscoped = { status, ms, count: payload?.count ?? payload?.total ?? null, truncated: payload?.truncated ?? null, error: err ? { name: err.name, message: String(err.message).slice(0, 300), hint: err.envelope?.hint } : null };
  const ok = status === "completed" || status === "timeout_guard";
  rec(`td_find sin acotar (${scope}, recursive, limit=100) -> ${status} en ${Math.round(ms)}ms`, ok, out.find_unscoped, ms);

  // ¿TD sigue vivo después de la barrida? (prueba de que el guard no dejó nada colgado)
  const t1 = Date.now();
  let alive = false;
  try { const info = await client.getInfo(); alive = !!info?.build; } catch { alive = false; }
  rec("TD sigue respondiendo después de la barrida", alive, { build_ok: alive }, Date.now() - t1);
}

// ─── (item 43) evidencia del cliente en vivo ────────────────────────────────
{
  const logPath = clientLogPath();
  const calls = getRecentCalls(10);
  const stats = getCallStats();
  const lastOk = getLastOkAt();
  const fileExists = existsSync(logPath);
  let lines = 0, lastLine = null;
  if (fileExists) {
    const all = readFileSync(logPath, "utf-8").trim().split("\n");
    lines = all.length; lastLine = all[all.length - 1];
  }
  out.client_evidence = { log_path: logPath, log_file_exists: fileExists, log_lines: lines, last_ok_call: lastOk, stats, recent: calls.slice(-4) };
  rec("log de cliente escrito en archivo y con last_ok", fileExists && lines > 0 && !!lastOk, { log: logPath, lines, last_ok: lastOk, stats }, 0);
}

out.finished_at = new Date().toISOString();
out.all_ok = out.checks.every(c => c.ok);
if (!existsSync(EVID)) mkdirSync(EVID, { recursive: true });
const dest = join(EVID, "twozero_chain_live.json");
writeFileSync(dest, JSON.stringify(out, null, 2), "utf-8");
console.log(`\nevidence: ${dest}`);
console.log(`ALL_OK=${out.all_ok}`);
process.exitCode = out.all_ok ? 0 : 1;
