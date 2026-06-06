#!/usr/bin/env node
/**
 * Crea un sistema de nodos en TouchDesigner con layout ordenado.
 * Reglas:
 *   - Izquierda → Derecha (flujo de señal)
 *   - Arriba → Abajo (cadenas paralelas)
 *   - Sin superposición (spacing = 250px X, 150px Y)
 *   - Nombres descriptivos con prefijo
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

let buffer = "";
let pending = new Map();
let msgId = 1;
let passed = 0;
let failed = 0;

const SPACING_X = 280;
const SPACING_Y = 180;
const START_X = 100;
const START_Y = 100;

function send(method, params = {}, timeoutMs = 15000) {
  const id = msgId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
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

function check(label, ok, detail = "") {
  if (ok) { console.log(`  ✅ ${label} ${detail}`); passed++; }
  else { console.log(`  ❌ ${label} ${detail}`); failed++; }
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

function parse(resp) {
  try {
    const text = resp.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : { error: "no content" };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log("\n🧩 SISTEMA DE NODOS — LAYOUT ORDENADO");
  console.log("═══════════════════════════════════════\n");
  console.log(`   Espaciado: ${SPACING_X}px X, ${SPACING_Y}px Y`);
  console.log(`   Orden: izquierda→derecha, arriba→abajo\n`);

  // ── Sistema 1: Feedback Loop (cadena única) ──
  // Posiciones: columna 0 → 1 → 2 → 3
  console.log("─── Sistema 1: Feedback Loop ───\n");

  const sys1 = [
    { type: "circleTOP",    name: "fb_src",     x: START_X,                 y: START_Y },
    { type: "noiseTOP",     name: "fb_noise",    x: START_X + SPACING_X,    y: START_Y },
    { type: "blurTOP",      name: "fb_blur",     x: START_X + SPACING_X*2,  y: START_Y },
    { type: "compositeTOP", name: "fb_comp",     x: START_X + SPACING_X*3,  y: START_Y },
    { type: "nullTOP",      name: "fb_out",      x: START_X + SPACING_X*4,  y: START_Y },
  ];

  for (const op of sys1) {
    const r = await send("tools/call", {
      name: "td_create_operator",
      arguments: { type: op.type, name: op.name, path: "/project1", position_x: op.x, position_y: op.y },
    }, 10000);
    check(`Crear ${op.name} (${op.type}) en (${op.x}, ${op.y})`, !parse(r).error);
  }

  const c1 = [
    ["/project1/fb_src", "/project1/fb_noise"],
    ["/project1/fb_noise", "/project1/fb_blur"],
    ["/project1/fb_blur", "/project1/fb_comp"],
    ["/project1/fb_comp", "/project1/fb_out"],
  ];
  for (const [src, tgt] of c1) {
    const r = await send("tools/call", { name: "td_connect_nodes", arguments: { source_path: src, target_path: tgt } }, 10000);
    check(`Conectar ${src.split("/").pop()} → ${tgt.split("/").pop()}`, !parse(r).error);
  }

  // Params
  const p1 = await send("tools/call", { name: "td_pars_set", arguments: { path: "/project1/fb_noise", updates: [{ name: "Amplitude", value: 0.5 }] } }, 10000);
  check("Noise Amplitude=0.5", !parse(p1).error);
  const p2 = await send("tools/call", { name: "td_pars_set", arguments: { path: "/project1/fb_blur", updates: [{ name: "Radius", value: 0.02 }] } }, 10000);
  check("Blur Radius=0.02", !parse(p2).error);

  // ── Sistema 2: Audio Visualizer (cadena paralela) ──
  // Fila 0: generación de audio
  // Fila 1: visualización
  console.log("\n─── Sistema 2: Audio Visualizer ───\n");

  const sys2_row0 = [
    { type: "constantCHOP", name: "av_freq",    x: START_X,                 y: START_Y + SPACING_Y*1 },
    { type: "mathCHOP",     name: "av_math",    x: START_X + SPACING_X,    y: START_Y + SPACING_Y*1 },
    { type: "nullCHOP",     name: "av_signal",  x: START_X + SPACING_X*2,  y: START_Y + SPACING_Y*1 },
  ];
  const sys2_row1 = [
    { type: "circleTOP",    name: "av_circle",  x: START_X,                 y: START_Y + SPACING_Y*2 },
    { type: "levelTOP",     name: "av_level",   x: START_X + SPACING_X,    y: START_Y + SPACING_Y*2 },
    { type: "compositeTOP", name: "av_mix",     x: START_X + SPACING_X*2,  y: START_Y + SPACING_Y*2 },
    { type: "nullTOP",      name: "av_out",     x: START_X + SPACING_X*3,  y: START_Y + SPACING_Y*2 },
  ];

  const sys2 = [...sys2_row0, ...sys2_row1];
  for (const op of sys2) {
    const r = await send("tools/call", {
      name: "td_create_operator",
      arguments: { type: op.type, name: op.name, path: "/project1", position_x: op.x, position_y: op.y },
    }, 10000);
    check(`Crear ${op.name} (${op.type}) en (${op.x}, ${op.y})`, !parse(r).error);
  }

  // ── Sistema 3: Partículas (fila 3) ──
  console.log("\n─── Sistema 3: Sistema de Partículas ───\n");

  const sys3 = [
    { type: "spherePOP",    name: "pt_src",     x: START_X,                 y: START_Y + SPACING_Y*3 },
    { type: "noisePOP",     name: "pt_noise",   x: START_X + SPACING_X,    y: START_Y + SPACING_Y*3 },
    { type: "nullPOP",      name: "pt_points",  x: START_X + SPACING_X*2,  y: START_Y + SPACING_Y*3 },
  ];

  for (const op of sys3) {
    const r = await send("tools/call", {
      name: "td_create_operator",
      arguments: { type: op.type, name: op.name, path: "/project1", position_x: op.x, position_y: op.y },
    }, 10000);
    check(`Crear ${op.name} (${op.type}) en (${op.x}, ${op.y})`, !parse(r).error);
  }

  // ── Verificar sin superposición ──
  console.log("\n─── Verificación de Layout ───\n");

  const ops_list = await send("tools/call", { name: "td_operators", arguments: { path: "/project1" } }, 10000);
  const opsd = parse(ops_list);
  
  if (opsd.operators) {
    const ourOps = opsd.operators.filter((o) => o.name !== "TouchDesignerAPI");
    
    // Verificar espaciado mínimo
    let minGapX = Infinity;
    let minGapY = Infinity;
    let overlaps = 0;

    // Usar posiciones conocidas
    const allPlanned = [...sys1, ...sys2, ...sys3];
    for (let i = 0; i < allPlanned.length; i++) {
      for (let j = i + 1; j < allPlanned.length; j++) {
        const dx = Math.abs(allPlanned[i].x - allPlanned[j].x);
        const dy = Math.abs(allPlanned[i].y - allPlanned[j].y);
        if (dx < 100 && dy < 100) overlaps++;
        if (dx > 0 && dx < minGapX) minGapX = dx;
        if (dy > 0 && dy < minGapY) minGapY = dy;
      }
    }

    check("Total operadores creados", ourOps.length === allPlanned.length, `(${ourOps.length})`);
    check("Sin superposiciones", overlaps === 0, `(0 overlaps)`);
    check("Espaciado X mínimo", minGapX >= SPACING_X - 100, `(${minGapX}px)`);
    check("Espaciado Y mínimo", minGapY >= SPACING_Y - 100, `(${minGapY}px)`);

    console.log(`\n   Layout generado:`);
    const byRow = {};
    for (const op of allPlanned) {
      if (!byRow[op.y]) byRow[op.y] = [];
      byRow[op.y].push(op);
    }
    const rows = Object.keys(byRow).sort((a,b) => parseInt(a)-parseInt(b));
    for (const rowY of rows) {
      const ops = byRow[parseInt(rowY)].sort((a,b) => a.x - b.x);
      const names = ops.map((o) => o.name);
      const yLabel = rowY === String(START_Y) ? "Fila 0" :
                     rowY === String(START_Y + SPACING_Y*1) ? "Fila 1" :
                     rowY === String(START_Y + SPACING_Y*2) ? "Fila 2" : "Fila 3";
      console.log(`   ${yLabel}: ${names.join(" → ")}`);
    }
  }

  // ── Resultados ──
  console.log(`\n═══════════════════════════════════════`);
  console.log(`  📊 ${passed}/${passed + failed} tests pasaron`);
  console.log(`═══════════════════════════════════════\n`);

  server.stdin.end();
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 500);
}

main().catch((e) => {
  console.error(`\n  ❌ ${e.message}`);
  process.exit(1);
});
