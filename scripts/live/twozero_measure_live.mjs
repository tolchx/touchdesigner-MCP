/**
 * Aceptación EN VIVO del ítem 47 (`td_measure`) contra el bridge real.
 *
 * Lo importante no es que la tool "no explote": es que sus NÚMEROS coincidan con
 * los que calcula el propio TouchDesigner. Por eso cada medición de CHOP se
 * cruza contra una cuenta independiente hecha en Python DENTRO de TD.
 *
 * Uso:  node scripts/live/twozero_measure_live.mjs
 * Salida: JSON por stdout + .freebuff_tasks/evidence/twozero_measure_live.json
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TDClient } from "../../api/dist/index.js";
import { registerMeasureTools } from "../../mcp/dist/tools/measure.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const EVID = join(REPO, ".freebuff_tasks", "evidence");

function makeServer() {
  const tools = new Map();
  return { tools, registerTool: (n, s, h) => tools.set(n, { spec: s, handler: h }) };
}

const client = new TDClient({ host: "127.0.0.1", port: 44444, transport: "http", retryAttempts: 3 });
const server = makeServer();
registerMeasureTools(server, client);
const measure = server.tools.get("td_measure").handler;

const out = { started_at: new Date().toISOString(), checks: [], measurements: {} };
const rec = (name, ok, detail) => {
  out.checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}  ${JSON.stringify(detail).slice(0, 300)}`);
};

async function run(path, args = {}) {
  const res = await measure({ path, ...args });
  const payload = JSON.parse(res.content[0].text);
  return { isError: !!res.isError, payload };
}

// ─── Cross-check independiente, calculado DENTRO de TD ──────────────────────
async function tdGroundTruth(path, channels, n) {
  const code = `import json
t = op('${path.replace(/'/g, "\\'")}')
res = {}
for name in ${JSON.stringify(channels)}:
    try:
        c = t.chan(name)
        vals = [c[i] for i in range(0, min(${n}, t.numSamples))]
        vals = [v for v in vals if v == v and abs(v) != float('inf')]
        if vals:
            res[name] = {'min': min(vals), 'max': max(vals), 'mean': sum(vals)/len(vals), 'n': len(vals)}
    except Exception as e:
        res[name] = {'error': str(e)}
print(json.dumps(res))`;
  return client.executeJson(code);
}

// ─── 1) CHOP con señal viva ────────────────────────────────────────────────
const chopA = "/ui/lib/TUIK/knob/slider1/math1";
{
  const { isError, payload } = await run(chopA);
  out.measurements.chop_signal = payload;
  rec(`CHOP ${chopA}: mide sin error`, !isError && payload.family === "CHOP", {
    units: payload.units_guess,
    chans: payload.summary_for_scaling?.ranges,
    interpretation: payload.interpretation?.slice(0, 140),
  });

  const names = (payload.measurements?.channels ?? []).map((c) => c.name);
  const gt = await tdGroundTruth(chopA, names, 1000);
  const mine = payload.summary_for_scaling?.ranges ?? [];
  const mismatches = [];
  for (const r of mine) {
    const g = gt?.[r.channel];
    if (!g || g.error) continue;
    for (const k of ["min", "max"]) {
      if (Math.abs((r[k] ?? 0) - g[k]) > 1e-6) mismatches.push(`${r.channel}.${k}: tool=${r[k]} td=${g[k]}`);
    }
  }
  rec(`cross-check min/max contra el propio TD (${names.length} canales)`, mismatches.length === 0, {
    canales: names,
    td: gt,
    discrepancias: mismatches,
  });
}


// ─── 1b) CHOP grande y NO normalizado (el caso que motiva la tool) ──────────
const chopBig = "/project1/LaGSplat/splats";
{
  const { isError, payload } = await run(chopBig, { samples: 200, channels: ["P_1", "P_2"] });
  out.measurements.chop_big = payload;
  const r1 = (payload.summary_for_scaling?.ranges ?? []).find((x) => x.channel === "P_1");
  rec(`CHOP grande ${chopBig}: orden de magnitud fuera de 0..1`, !isError && r1 && r1.max > 1 && payload.units_guess === "crudo (sin normalizar)", {
    units: payload.units_guess,
    P_1: r1,
    escala_sugerida: payload.summary_for_scaling?.suggested_scalars,
    aviso: (payload.interpretation ?? "").slice(0, 190),
  });

  const gt2 = await tdGroundTruth(chopBig, ["P_1", "P_2"], 200);
  const mism = [];
  const tolDetail = [];
  for (const r of payload.summary_for_scaling?.ranges ?? []) {
    const g = gt2?.[r.channel];
    if (!g || g.error) continue;
    // Este CHOP es un scriptCHOP VIVO: recocina entre la lectura del tool y la del
    // ground truth (~16 ms por frame a 60 fps), así que los valores no pueden ser
    // idénticos bit a bit. La tolerancia es 1% del rango medido, no 1e-6.
    const range = Math.abs(g.max - g.min);
    const tol = Math.max(1e-6, 0.01 * range);
    for (const k of ["min", "max"]) {
      const d = Math.abs((r[k] ?? 0) - g[k]);
      tolDetail.push({ ch: r.channel, k, tool: r[k], td: g[k], diff: Number(d.toFixed(6)), tol: Number(tol.toFixed(6)) });
      if (d > tol) mism.push(`${r.channel}.${k}: tool=${r[k]} td=${g[k]} (dif ${d} > tol ${tol})`);
    }
  }
  const medidoAlgo = (payload.summary_for_scaling?.ranges ?? []).some((r) => (r.range ?? 0) > 1);
  rec("cross-check del buffer grande contra TD (tolerancia 1% por recook)", mism.length === 0 && medidoAlgo, { td: gt2, detalle: tolDetail, discrepancias: mism });
}

// ─── 2) CHOP constante (la rama del rango cero) ─────────────────────────────
const chopConst = "/ui/lib/TUIK/knob/slider1/override";
{
  const { isError, payload } = await run(chopConst);
  out.measurements.chop_constant = payload;
  const c0 = payload.measurements?.channels?.[0];
  rec(`CHOP constante ${chopConst}: is_constant + warning, sin 1/0`, !isError && c0?.is_constant === true && payload.summary_for_scaling.suggested_scalars.every((s) => s.scale === null), {
    is_constant: c0?.is_constant,
    scale: payload.summary_for_scaling?.suggested_scalars?.[0]?.scale,
    warnings: payload.warnings,
  });
}

// ─── 3) TOP ────────────────────────────────────────────────────────────────
{
  const { isError, payload } = await run("/ui/lib/TUIK/knob/slider1/ramp1");
  out.measurements.top = payload;
  rec("TOP: resolución y aspect", !isError && payload.family === "TOP" && payload.measurements.resolution.width > 0, {
    resolution: payload.measurements.resolution,
    aspect: payload.measurements.aspect,
    warnings: payload.warnings,
  });
}

// ─── 4) POP ────────────────────────────────────────────────────────────────
{
  const { isError, payload } = await run("/sys/TDTox/popViewer/axes/line2");
  out.measurements.pop = payload;
  rec("POP: puntos/prims y atributos", !isError && payload.family === "POP", {
    counts: payload.measurements?.counts,
    attributes: (payload.measurements?.attributes ?? []).map?.((a) => a.name),
    bytes_por_punto: payload.measurements?.attribute_bytes_per_point,
  });
}

// ─── 5) DAT ────────────────────────────────────────────────────────────────
{
  const { isError, payload } = await run("/ui/lib/TUIK/TUIK/local/set_variables");
  out.measurements.dat = payload;
  rec("DAT: filas", !isError && payload.family === "DAT" && typeof payload.measurements.rows === "number", {
    rows: payload.measurements?.rows,
  });
}

// ─── 6) familia no soportada: err() accionable ─────────────────────────────
{
  const { isError, payload } = await run("/project1/timevolume/out3d/geo/p2s");
  out.measurements.unsupported = payload;
  rec("SOP: error accionable, nunca un ok vacío", isError && /no se muestrea/.test(payload.error ?? ""), {
    error: (payload.error ?? "").slice(0, 160),
  });
}

// ─── 7) path inexistente: error claro ──────────────────────────────────────
{
  const { isError, payload } = await run("/no/existe/esta/op");
  rec("path inexistente: error claro", isError, { error: (payload.error ?? "").slice(0, 160) });
}

out.all_ok = out.checks.every((c) => c.ok);
out.finished_at = new Date().toISOString();
if (!existsSync(EVID)) mkdirSync(EVID, { recursive: true });
writeFileSync(join(EVID, "twozero_measure_live.json"), JSON.stringify(out, null, 2), "utf-8");
console.log(`\nevidence: ${join(EVID, "twozero_measure_live.json")}`);
console.log(`ALL_OK=${out.all_ok}`);
process.exitCode = out.all_ok ? 0 : 1;
