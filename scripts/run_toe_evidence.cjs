#!/usr/bin/env node
/**
 * run_toe_evidence — extiende la evidencia de docs/TOE_REPLICATION.md a más
 * proyectos reales del corpus Toe_Expand (mcp_td_v2).
 *
 * Para cada proyecto:
 *   1. parseToeDirScope(<scope>/project1)  — parser REAL de la herramienta
 *   2. buildImportCode(...)                — codegen REAL de la herramienta
 *   3. client.execute(code)                — un solo /exec por proyecto
 *   4. verifyAgainstDump(...)              — verificación REAL por nodo
 *   5. métricas: nodos, wires, errores TD, geometría, % reconstruido
 *
 * Uso:  node scripts/run_toe_evidence.cjs
 * Salida: docs/toe_replication_evidence.json + resumen por stdout.
 */
const path = require("node:path");
const fs = require("node:fs");
const process = require("node:process");

const MCP = path.join(__dirname, "..", "mcp");
const ROOT = path.join(__dirname, "..");
const CORPUS = "C:\\Users\\Tolch\\Documents\\AI_Code\\Touchdesigner_MCP\\old\\mcp_td_v2\\Toe_Expand";

const PROJECTS = [
  { name: "Facet", why: "referencia ya validada (baseline)" },
  { name: "Blending Attributes", why: "red chica, mezcla con mathmix/mathcombine" },
  { name: "CopyTemplateId.3", why: "copyPOP con plantillas + DATs popto" },
  { name: "fieldPOPtorus", why: "multi-familia: POPs + CHOPs + render TOPs + geo COMP" },
  { name: "RayPOP", why: "grande (33 ops), feedback + cache + ray" },
  { name: "LineStripsByAttribFourWays.5", why: "grande (37 ops), merge + sort + linebreak" },
];

async function main() {
  const { pathToFileURL } = require("node:url");
  const { TDClient } = require(path.join(ROOT, "node_modules", "td-api"));
  const { parseToeDirScope, buildImportCode, verifyAgainstDump } =
    await import(pathToFileURL(path.join(MCP, "dist", "tools", "toeImport.js")).href);

  const client = new TDClient({ requestTimeout: 180000, connectionTimeout: 5000, transport: "http" });

  // sanity: TD vivo
  const pingCode = "print('TD_OK', app.build)";
  const ping = await client.execute(pingCode);
  if (!ping.success) throw new Error("TD no responde: " + (ping.stderr || "?"));
  console.log("[ping]", ping.stdout.trim());

  const stamp = new Date();
  const p2 = (v) => String(v).padStart(2, "0");
  const ts = `${p2(stamp.getMonth() + 1)}${p2(stamp.getDate())}_${p2(stamp.getHours())}${p2(stamp.getMinutes())}${p2(stamp.getSeconds())}`;

  const evidence = [];
  for (const proj of PROJECTS) {
    const slug = proj.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const toeDir = path.join(CORPUS, proj.name, `${proj.name}.toe.dir`);
    const scopeDir = path.join(toeDir, "project1");
    const rec = {
      project: proj.name,
      why: proj.why,
      toe_dir: toeDir,
      scope: "project1",
      ok: false,
      error: null,
    };
    console.log(`\n=== ${proj.name} (${proj.why})`);
    try {
      const dump = parseToeDirScope(scopeDir);
      const containerName = `toe_evid_${slug}_${ts}`;
      const code = buildImportCode(dump, containerName, "/project1");
      const result = await client.execute(code);
      if (!result.success) throw new Error("TD exec failed: " + (result.stderr || "").slice(0, 200));
      let payload;
      try {
        payload = JSON.parse(result.stdout.trim());
      } catch {
        throw new Error("stdout no es JSON: " + result.stdout.slice(0, 200));
      }
      if (payload.error) throw new Error("TD import error: " + payload.error);

      const verdict = verifyAgainstDump(dump, payload.verification ?? {});
      const by = Object.fromEntries(verdict.checks.map((c) => [c.node, c]));
      const present = verdict.checks.filter((c) => c.checks.present).length;
      const clean = verdict.checks.filter((c) => c.checks.clean).length;
      const wiredOk = verdict.checks.filter((c) => c.checks.inputs).length;
      const withGeo = verdict.checks.filter((c) => (c.geometry.numPoints ?? 0) > 0).length;
      const erroredNodes = verdict.checks
        .filter((c) => !c.checks.clean)
        .map((c) => ({ node: c.node, error: (c.errors || "").replace(/\n/g, " ").slice(0, 160) }));
      const notCreated = payload.unsupported ?? [];

      rec.ok = true;
      rec.container = payload.container;
      rec.metrics = {
        dump_nodes: dump.nodes.length,
        dump_wires: dump.wires.length,
        created: (payload.created ?? []).length,
        not_created: notCreated.length,
        not_created_list: notCreated,
        unsupported: (payload.unsupported ?? []).slice(0, 20),
        wire_errors: (payload.wire_errors ?? []).slice(0, 20),
        wired: (payload.wired ?? []).length,
        params_set: (payload.set_params ?? []).length,
        drift_params: Object.keys(payload.drift ?? {}).length,
        drift_sample: Object.entries(payload.drift ?? {}).slice(0, 8).map(([k, v]) => `${k}: ${v}`),
        present, wired_ok_inputs: wiredOk, clean_cook: clean, with_geometry: withGeo,
        reconstruction_pct: Math.round((100 * present) / dump.nodes.length),
        clean_pct: Math.round((100 * clean) / dump.nodes.length),
        all_ok: verdict.allOk,
      };
      rec.errors = erroredNodes;
      rec.geometry_signature = verdict.geometrySignature;
      rec.node_types = dump.nodes.reduce((acc, n) => {
        acc[n.rawType] = (acc[n.rawType] || 0) + 1; return acc;
      }, {});
      console.log("   container:", payload.container);
      console.log("   metrics:", JSON.stringify(rec.metrics));
      if (erroredNodes.length) console.log("   con errores TD:", erroredNodes.length);
    } catch (e) {
      rec.error = String(e && e.message || e).slice(0, 300);
      console.log("   ERROR:", rec.error);
    }
    evidence.push(rec);
  }

  const outPath = path.join(ROOT, "docs", "toe_replication_evidence.json");
  fs.writeFileSync(outPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    td_build: (ping.stdout.match(/TD_OK (\S+)/) || [])[1] || null,
    corpus: CORPUS,
    tool: "td_import_toe_dir (parseToeDirScope + buildImportCode + verifyAgainstDump)",
    projects: evidence,
  }, null, 2));
  console.log(`\nJSON: ${outPath}`);

  // resumen final
  console.log("\n=== RESUMEN");
  for (const r of evidence) {
    if (!r.ok) { console.log(`  ✗ ${r.project}: ${r.error}`); continue; }
    const m = r.metrics;
    console.log(`  ${m.all_ok ? "✓" : "•"} ${r.project}: ${m.present}/${m.dump_nodes} nodos (${m.reconstruction_pct}%), ${m.wired}/${m.dump_wires} wires, cook limpio ${m.clean_cook}/${m.dump_nodes}, con geometría ${m.with_geometry}, params ${m.params_set} (drift ${m.drift_params}), all_ok=${m.all_ok}`);
  }
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
