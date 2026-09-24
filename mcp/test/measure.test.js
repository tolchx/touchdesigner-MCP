/**
 * Offline tests: td_measure MCP tool (mcp/src/tools/measure.ts) — ítem 47.
 *
 * Se testea el HANDLER REAL (no un espejo): un doble de McpServer captura
 * `registerTool(name, spec, handler)` y se invoca ese handler con un TDClient
 * doble. Es el patrón de mcp/test/wiringCheck.test.js.
 *
 * El timeout del guard se acorta por env ANTES de importar el módulo: exploreGuard
 * lee TDMCP_EXPLORE_TIMEOUT_MS al cargarse (con piso de 1000 ms), por eso los
 * imports de abajo son dinámicos y no estáticos.
 *
 * Build first:  cd mcp && npm run build
 * Run:          node --test test/measure.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// El guard tiene un piso de 1000 ms a propósito (evita el pie de banqueta de
// un timeout absurdamente chico que generaría falsos timeouts): el test usa el piso.
process.env.TDMCP_EXPLORE_TIMEOUT_MS = "1000";

const { registerMeasureTools, statsForChannel, familyFromOpType, interpretationFor } =
  await import("../dist/tools/measure.js");

function makeServer() {
  const tools = new Map();
  return {
    tools,
    registerTool(name, spec, handler) {
      tools.set(name, { spec, handler });
    },
  };
}

function payload(result) {
  return JSON.parse(result.content[0].text);
}

/** Cliente doble: cada test decide qué devuelve cada método. */
function makeClient({
  opType = "noiseCHOP",
  channels = { chan1: [0.1, 0.4, 0.9] },
  chopError = null,
  hang = false,
  dat = { success: true, totalLines: 7 },
  pop = { success: true, data: { numPoints: 100, numPrims: 50, attributes: [] } },
  top = { success: true, data: { width: 1280, height: 720, aspect: 16 / 9, depth: 1 } },
  execute = null,
} = {}) {
  const calls = [];
  const hangForever = () => new Promise(() => {});
  return {
    calls,
    getNodeDetail: async (path) => {
      calls.push({ m: "getNodeDetail", path });
      if (hang) return hangForever();
      return { success: true, data: { path, name: path.split("/").pop(), type: opType } };
    },
    readChop: async (path, chans, s, e) => {
      calls.push({ m: "readChop", path, chans, s, e });
      if (chopError) return { success: false, error: chopError };
      return { success: true, data: { path, numSamples: 3, numChannels: Object.keys(channels).length, channels } };
    },
    readDat: async (path) => {
      calls.push({ m: "readDat", path });
      return dat;
    },
    popInspect: async (path) => {
      calls.push({ m: "popInspect", path });
      return pop;
    },
    // Forma REAL de ExecuteResult: el JSON vive dentro de `stdout` como string
    // (leer `.data` daba resolution: null en un TOP que sí reporta tamaño).
    execute: async (code, fromOp) => {
      calls.push({ m: "execute", fromOp });
      const payload = execute ?? top;
      return { success: true, stdout: JSON.stringify(payload) + "\n", stderr: "", from_op: fromOp };
    },
    executeRaw: async (stdout) => ({ success: true, stdout, stderr: "", from_op: "/" }),
  };
}

async function callTool(client, args) {
  const server = makeServer();
  registerMeasureTools(server, client);
  const { handler, spec } = server.tools.get("td_measure");
  const res = await handler(args);
  return { res, spec, payload: payload(res) };
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

describe("td_measure — helpers puros", () => {
  it("detecta la familia por el sufijo del OPType", () => {
    assert.equal(familyFromOpType("noiseCHOP"), "CHOP");
    assert.equal(familyFromOpType("boxPOP"), "POP");
    assert.equal(familyFromOpType("geometryCOMP"), "COMP");
    assert.equal(familyFromOpType("blurTOP"), "TOP");
    assert.equal(familyFromOpType("selectDAT"), "DAT");
    assert.equal(familyFromOpType("lineMAT"), "MAT");
    assert.equal(familyFromOpType("circleSOP"), "SOP");
    assert.equal(familyFromOpType(""), null);
    assert.equal(familyFromOpType(null), null);
  });

  it("estadística de un canal normalizado", () => {
    const s = statsForChannel("c", [0, 0.5, 1]);
    assert.equal(s.min, 0);
    assert.equal(s.max, 1);
    assert.equal(s.mean, 0.5);
    assert.equal(s.range, 1);
    assert.equal(s.is_constant, false);
    assert.equal(s.looks_normalized, true);
    assert.equal(s.looks_unit, true);
    assert.equal(s.suggested_scale, 1);
    assert.equal(s.suggested_offset, 0);
  });

  it("nunca divide por cero en un canal constante", () => {
    const s = statsForChannel("c", [2.5, 2.5, 2.5]);
    assert.equal(s.is_constant, true);
    assert.equal(s.range, 0);
    assert.equal(s.suggested_scale, null, "1/0 no existe: null, no Infinity");
    assert.equal(s.suggested_offset, null);
  });

  it("excluye NaN/Inf y los cuenta aparte", () => {
    const s = statsForChannel("c", [0, NaN, 1, Infinity, -Infinity]);
    assert.equal(s.non_finite, 3);
    assert.equal(s.samples, 2);
    assert.equal(s.min, 0);
    assert.equal(s.max, 1);
  });
});

// ---------------------------------------------------------------------------
// Tool: CHOP
// ---------------------------------------------------------------------------

describe("td_measure — CHOP", () => {
  it("(a) canales en 0..1: looks_normalized y no hay que reescalar", async () => {
    const { res, payload: p } = await callTool(
      makeClient({ channels: { lfo: [0, 0.25, 0.5, 0.75, 1] } }),
      { path: "/project1/lfo" },
    );
    assert.equal(res.isError, undefined);
    assert.equal(p.family, "CHOP");
    assert.equal(p.units_guess, "normalizado 0..1");
    assert.equal(p.summary_for_scaling.suggested_scalars[0].scale, 1);
    assert.match(p.interpretation, /ya viven en 0\.\.1|no hace falta reescalar/i);
  });

  it("(b) canales en -1..1: unidad bipolar y consejo de mapeo a 0..1", async () => {
    const { payload: p } = await callTool(
      makeClient({ channels: { wave: [-1, 0, 1] } }),
      { path: "/project1/wave" },
    );
    assert.equal(p.units_guess, "bipolar -1..1");
    assert.match(p.interpretation, /-1\.\.1/);
    assert.match(p.interpretation, /scale 0\.5/);
  });

  it("(c) canal constante: is_constant + warning, sin 1/0", async () => {
    const { payload: p } = await callTool(
      makeClient({ channels: { flat: [7, 7, 7] } }),
      { path: "/project1/flat" },
    );
    assert.equal(p.measurements.channels[0].is_constant, true);
    assert.equal(p.summary_for_scaling.suggested_scalars[0].scale, null);
    assert.ok(p.warnings.some((w) => /Rango cero/.test(w)));
    assert.match(p.interpretation, /CONSTANTES/);
  });

  it("(d) NaN/Inf: warning explícito, nunca una medición limpia y falsa", async () => {
    const { payload: p } = await callTool(
      makeClient({ channels: { broken: [0.2, NaN, Infinity, 0.8] } }),
      { path: "/project1/broken" },
    );
    assert.ok(p.warnings.some((w) => /NaN\/Inf excluidas/.test(w)));
    assert.equal(p.summary_for_scaling.ranges[0].min, 0.2);
    assert.equal(p.summary_for_scaling.ranges[0].max, 0.8);
  });

  it("(e) rango crudo enorme: avisa del orden de magnitud", async () => {
    const { payload: p } = await callTool(
      makeClient({ channels: { audio: [0, 30.5, 40000] } }),
      { path: "/project1/audio" },
    );
    assert.equal(p.units_guess, "crudo (sin normalizar)");
    assert.ok(p.summary_for_scaling.suggested_scalars[0].scale > 0);
    assert.match(p.interpretation, /order|magnitud|enormes/i);
  });

  it("respeta el cap de samples y los canales pedidos", async () => {
    const c = makeClient({ channels: { a: [1], b: [2] } });
    await callTool(c, { path: "/project1/x", channels: ["a"], samples: 99999 });
    const call = c.calls.find((x) => x.m === "readChop");
    assert.deepEqual(call.chans, ["a"]);
    assert.equal(call.e, 5000, "cap duro de samples");
  });

  it("propaga el error del CHOP en vez de devolver ceros", async () => {
    const { res } = await callTool(makeClient({ chopError: "Operator is not a CHOP, it is a TOP" }), {
      path: "/project1/t",
    });
    assert.equal(res.isError, true);
  });
});

// ---------------------------------------------------------------------------
// Tool: otras familias
// ---------------------------------------------------------------------------

describe("td_measure — TOP / POP / DAT / no soportada", () => {
  it("TOP: resolución y aspect", async () => {
    const { payload: p } = await callTool(makeClient({ opType: "blurTOP" }), { path: "/project1/blur1" });
    assert.equal(p.family, "TOP");
    assert.deepEqual(p.measurements.resolution, { width: 1280, height: 720 });
    assert.equal(p.units_guess, "pixeles");
  });

  it("TOP: tolera stdout sin wrapper {success,data}", async () => {
    const c = makeClient({ opType: "blurTOP", execute: null });
    c.execute = async () => ({ success: true, stdout: JSON.stringify({ width: 512, height: 256 }) + "\n", stderr: "" });
    const { payload: p } = await callTool(c, { path: "/project1/b" });
    assert.equal(p.measurements.resolution.width, 512);
    assert.equal(p.measurements.aspect, 2);
  });

  it("TOP: un /exec sin JSON es error explícito, no un ok vacío", async () => {
    const c = makeClient({ opType: "blurTOP" });
    c.execute = async () => ({ success: true, stdout: "Traceback (most recent call last)\n", stderr: "" });
    const { res, payload: p } = await callTool(c, { path: "/project1/b" });
    assert.equal(res.isError, true);
    assert.match(p.error, /no devolvió JSON/);
  });

  it("POP: conteos y bytes por punto", async () => {
    const { payload: p } = await callTool(
      makeClient({
        opType: "boxPOP",
        pop: {
          success: true,
          data: {
            numPoints: 1000,
            numPrims: 200,
            attributes: [{ name: "P", size: 3, type: "float" }],
          },
        },
      }),
      { path: "/project1/box1" },
    );
    assert.equal(p.family, "POP");
    assert.equal(p.measurements.counts.points, 1000);
    assert.equal(p.measurements.attribute_bytes_per_point, 12);
  });

  it("POP gigante: avisa del costo por punto", async () => {
    const { payload: p } = await callTool(
      makeClient({ opType: "boxPOP", pop: { success: true, data: { numPoints: 900000 } } }),
      { path: "/project1/big" },
    );
    assert.ok(p.warnings.some((w) => /900000 puntos/.test(w)));
  });

  it("DAT: filas", async () => {
    const { payload: p } = await callTool(makeClient({ opType: "tableDAT", dat: { success: true, totalLines: 42 } }), {
      path: "/project1/table1",
    });
    assert.equal(p.family, "DAT");
    assert.equal(p.measurements.rows, 42);
  });

  it("(e) familia no soportada: err() accionable, no un ok vacío", async () => {
    const { res, payload: p } = await callTool(makeClient({ opType: "circleSOP" }), { path: "/project1/circle1" });
    assert.equal(res.isError, true);
    assert.match(p.error, /no se muestrea/);
    assert.match(p.error, /td_get_node_detail/);
  });

  it("(f) el timeout del guard llega como diagnostic.kind=timeout", async () => {
    const { res, payload: p } = await callTool(makeClient({ hang: true }), { path: "/project1/colgado" });
    assert.equal(res.isError, true);
    assert.equal(p.diagnostic.kind, "timeout");
    assert.ok(p.diagnostic.hint);
    assert.match(p.diagnostic.hint, /acot/i);
  });

  it("normaliza el path vacío a la raíz", async () => {
    const c = makeClient();
    await callTool(c, { path: "" });
    assert.equal(c.calls[0].path, "/");
  });
});
