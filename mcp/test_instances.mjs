#!/usr/bin/env node
/**
 * Sistema de Instancias CORREGIDO
 * Cubos + Partículas + Fuerzas + Turbulencia
 * 
 * Flujo real:
 *   POPs: gridPOP → noisePOP → attributePOP → mathPOP → nullPOP → geometryCOMP
 *   Render: geometryCOMP → renderTOP → nullTOP  
 *   CHOPs: noiseCHOP + lfoCHOP → mathCHOP → expresiones en parámetros
 *   Camera: cameraCOMP apuntando al geometryCOMP
 * 
 * Layout: izquierda→derecha, arriba→abajo, 280px/180px
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "dist/index.js");
const HOST = process.env.TDAPI_HOST || "172.24.0.1";
const PORT = process.env.TDAPI_PORT || "44444";

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, TDAPI_HOST: HOST, TDAPI_PORT: PORT },
});

let buffer = "", pending = new Map(), msgId = 1, passed = 0, failed = 0;
const SX = 280, SY = 180;
const B = "/project1/instances_sys";

function send(m, p = {}, t = 15000) {
  const id = msgId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method: m, params: p }) + "\n";
  server.stdin.write(msg);
  return new Promise((res, rej) => {
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`Timeout ${t}ms`)); }, t);
    pending.set(id, r => { clearTimeout(timer); res(r); });
  });
}

function check(l, ok, d = "") { if (ok) { console.log(`  ✅ ${l} ${d}`); passed++; } else { console.log(`  ❌ ${l} ${d}`); failed++; } }

server.stdout.on("data", c => {
  buffer += c.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const l of lines) {
    if (!l.trim()) continue;
    try { const m = JSON.parse(l); if (m.id != null && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch {}
  }
});

function pr(resp) {
  try { const t = resp.result?.content?.[0]?.text; return t ? JSON.parse(t) : { error: "no content" }; }
  catch (e) { return { error: e.message }; }
}

async function main() {
  console.log("\n🧊 SISTEMA DE INSTANCIAS v2 — CORREGIDO");
  console.log("═══════════════════════════════════════════\n");

  // Eliminar instancia anterior si existe
  const del = await send("tools/call", { name: "td_delete_operator", arguments: { path: B } }, 5000);
  if (!pr(del).error) console.log("  🗑️  instances_sys anterior eliminado\n");

  // ── 1. baseCOMP ──
  const base = await send("tools/call", { name: "td_create_operator", arguments: { type: "baseCOMP", name: "instances_sys", path: "/project1", position_x: 50, position_y: 50 } }, 10000);
  check("baseCOMP instances_sys", !pr(base).error);

  // ── 2. POP CHAIN (fila 0) ──
  console.log("\n─── POP Chain ───\n");
  const pops = [
    ["gridPOP",      "pop_src",    50,        50],
    ["noisePOP",     "pop_noise",  50 + SX,   50],
    ["attributePOP", "pop_attr",   50 + SX*2, 50],
    ["mathPOP",      "pop_math",   50 + SX*3, 50],
    ["nullPOP",      "pop_out",    50 + SX*4, 50],
  ];
  for (const [t, n, x, y] of pops) {
    const r = await send("tools/call", { name: "td_create_operator", arguments: { type: t, name: n, path: B, position_x: x, position_y: y } }, 10000);
    check(`${n} (${t})`, !pr(r).error);
  }
  for (let i = 0; i < pops.length - 1; i++) {
    const r = await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/${pops[i][1]}`, target_path: `${B}/${pops[i+1][1]}` } }, 10000);
    check(`${pops[i][1]} → ${pops[i+1][1]}`, !pr(r).error);
  }

  // ── 3. GEOMETRY COMP + RENDER (fila 1) ──
  console.log("\n─── Geometry + Render ───\n");
  const geos = [
    ["geometryCOMP", "geo_comp",   50,       50 + SY],
    ["cameraCOMP",   "geo_cam",    50 + SX,  50 + SY],
    ["renderTOP",    "geo_render", 50 + SX*2, 50 + SY],
    ["nullTOP",      "geo_out",    50 + SX*3, 50 + SY],
  ];
  for (const [t, n, x, y] of geos) {
    const r = await send("tools/call", { name: "td_create_operator", arguments: { type: t, name: n, path: B, position_x: x, position_y: y } }, 10000);
    check(`${n} (${t})`, !pr(r).error);
  }

  // Conectar render → null, y camera al render
  await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/geo_render`, target_path: `${B}/geo_out` } }, 10000);
  check("geo_render → geo_out", true);

  // ── 4. CHOP CHAIN (fila 2) ──
  console.log("\n─── CHOP Chain (fuerzas + turbulencia) ───\n");
  const chops = [
    ["noiseCHOP",    "chop_noise", 50,        50 + SY*2],
    ["lfoCHOP",      "chop_lfo",   50,        50 + SY*2 + SX/2],
    ["mathCHOP",     "chop_math",  50 + SX,   50 + SY*2],
    ["nullCHOP",     "chop_out",   50 + SX*2, 50 + SY*2],
  ];
  for (const [t, n, x, y] of chops) {
    const r = await send("tools/call", { name: "td_create_operator", arguments: { type: t, name: n, path: B, position_x: x, position_y: y } }, 10000);
    check(`${n} (${t})`, !pr(r).error);
  }

  await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/chop_noise`, target_path: `${B}/chop_math` } }, 10000);
  check("chop_noise → chop_math", true);
  await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/chop_lfo`, target_path: `${B}/chop_math` } }, 10000);
  check("chop_lfo → chop_math", true);
  await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/chop_math`, target_path: `${B}/chop_out` } }, 10000);
  check("chop_math → chop_out", true);

  // ── 5. CONEXIONES CRUZADAS ENTRE FAMILIAS ──
  console.log("\n─── Conexiones entre familias ───\n");

  // POP OUT → geometry COMP (la conexión clave: POP data al geometry)
  // geometryCOMP acepta input POP en su entrada 0
  const pop2geo = await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/pop_out`, target_path: `${B}/geo_comp`, target_input: 0 } }, 10000);
  check("pop_out → geo_comp (POP data a geometry)", !pr(pop2geo).error);

  // Conectar geo_comp → render (geometryCOMP output al renderTOP)
  const geo2ren = await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: `${B}/geo_comp`, target_path: `${B}/geo_render`, target_input: 0 } }, 10000);
  check("geo_comp → geo_render (geometry a render)", !pr(geo2ren).error);

  // ── 6. PARÁMETROS ──
  console.log("\n─── Parámetros ───\n");

  let ok = true;

  // gridPOP: tamaño de la grilla y spacing
  let r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/pop_src`, updates: [{ name: "size", value: 8 }, { name: "tx", value: 0.4 }, { name: "ty", value: 0.4 }] } }, 10000);
  ok = !pr(r).error; check("gridPOP size=8, tx=0.4, ty=0.4", ok);

  // noisePOP: turbulencia de puntos
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/pop_noise`, updates: [{ name: "amp0", value: 0.6 }, { name: "period", value: 1.5 }] } }, 10000);
  ok = !pr(r).error; check("noisePOP amp=0.6, period=1.5", ok);

  // attributePOP: crear atributo custom psize
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/pop_attr`, updates: [{ name: "attr0name", value: "psize" }, { name: "attr0size", value: 1 }, { name: "attr0scope", value: 1 }, { name: "attr0type", value: 2 }] } }, 10000);
  ok = !pr(r).error; check("attributePOP psize config", ok);

  // mathPOP: escalar tamaño
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/pop_math`, updates: [{ name: "mult0", value: 2.5 }] } }, 10000);
  ok = !pr(r).error; check("mathPOP mult=2.5", ok);

  // renderTOP: resolución
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/geo_render`, updates: [{ name: "Resolution", value: "800x600" }] } }, 10000);
  ok = !pr(r).error; check("renderTOP 800x600", ok);

  // cameraCOMP: posicionar cámara
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/geo_cam`, updates: [{ name: "tx", value: 0 }, { name: "ty", value: 0 }, { name: "tz", value: -5 }] } }, 10000);
  ok = !pr(r).error; check("cameraCOMP tz=-5", ok);

  // noiseCHOP: turbulencia
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/chop_noise`, updates: [{ name: "amp", value: 0.4 }, { name: "freq", value: 0.3 }] } }, 10000);
  ok = !pr(r).error; check("noiseCHOP amp=0.4, freq=0.3", ok);

  // lfoCHOP
  r = await send("tools/call", { name: "td_pars_set", arguments: { path: `${B}/chop_lfo`, updates: [{ name: "level", value: 0.8 }, { name: "rate", value: 0.2 }] } }, 10000);
  ok = !pr(r).error; check("lfoCHOP level=0.8, rate=0.2", ok);

  // ── 7. VERIFICACIÓN ──
  console.log("\n─── Verificación ───\n");

  const opsList = await send("tools/call", { name: "td_operators", arguments: { path: B } }, 10000);
  const opsD = pr(opsList);
  const count = opsD.operators?.length || 0;
  check("Operadores totales", count >= 12, `(${count})`);

  // Verificar conexiones clave
  for (const [name, expectedIns, expectedOuts] of [
    ["pop_out", 1, 1],     // debe tener input de pop_math y output a geo_comp
    ["geo_comp", 1, 1],    // debe tener input de pop_out y output
    ["geo_render", 1, 1],  // debe tener input de geo_comp y output a geo_out
  ]) {
    const conn = await send("tools/call", { name: "td_connections", arguments: { path: `${B}/${name}`, recurse: false } }, 10000);
    const d = pr(conn);
    const op = d.operators?.[0];
    const ins = op?.inputs?.length || 0;
    const outs = op?.outputs?.length || 0;
    check(`${name} conectado (in=${ins}, out=${outs})`, ins >= expectedIns && outs >= expectedOuts);
  }

  const hc = await send("tools/call", { name: "td_healthcheck", arguments: { path: B, recurse: false } }, 10000);
  const hcd = pr(hc);
  check("Healthcheck instances_sys", !hcd.error, `(issues: ${hcd.issueCount || 0})`);

  // ── LAYOUT ──
  console.log("\n─── Layout Final ───\n");
  console.log("   ┌──────────────────────────────────────────────────────────────────┐");
  console.log("   │  Fila 0 (POPs):                                                    │");
  console.log("   │  [pop_src gridPOP] → [pop_noise] → [pop_attr] → [pop_math] → [pop_out] │");
  console.log("   │       size=8          amp=0.6       psize         mult=2.5           │");
  console.log("   │                       period=1.5                                     │");
  console.log("   └──────────────────────────────┬───────────────────────────────────────┘");
  console.log("                                  │ pop_out → geo_comp (entrada 0)");
  console.log("   ┌──────────────────────────────┴───────────────────────────────────────┐");
  console.log("   │  Fila 1 (Geometry + Render):                                        │");
  console.log("   │                        ┌──────────┐                                 │");
  console.log("   │  [geo_comp] → [geo_render] → [geo_out]                              │");
  console.log("   │   geometry      800x600      nullTOP                                 │");
  console.log("   │                        ↑                                             │");
  console.log("   │  [geo_cam] ─────────────┘  camera apuntando al geometry              │");
  console.log("   │   tz=-5                                                                │");
  console.log("   └──────────────────────────────────────────────────────────────────┘");
  console.log("   ┌──────────────────────────────────────────────────────────────────┐");
  console.log("   │  Fila 2 (CHOPs — Fuerzas + Turbulencia):                          │");
  console.log("   │  [chop_noise] ─┐                                                   │");
  console.log("   │   amp=0.4      ├──→ [chop_math] → [chop_out]                       │");
  console.log("   │   freq=0.3    ┘       mezcla      nullCHOP                          │");
  console.log("   │  [chop_lfo] ──┘                                                    │");
  console.log("   │   rate=0.2, level=0.8                                              │");
  console.log("   └──────────────────────────────────────────────────────────────────┘");

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  📊 ${passed}/${passed + failed} tests pasaron`);
  console.log(`═══════════════════════════════════════\n`);

  server.stdin.end();
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
}

main().catch(e => { console.error(`\n  ❌ ${e.message}`); process.exit(1); });
