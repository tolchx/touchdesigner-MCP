import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { runBounded, normalizeScope } from "../exploreGuard.js";

/**
 * `td_measure` — muestrear magnitudes REALES antes de fijar escalares.
 *
 * Origen (2026-09-24, auditoría del Discord de TWOZERO — ítem 47 del BACKLOG):
 * el mejor consejo técnico de ese server, de un usuario avanzado:
 *   "the biggest problem has been scale. the llm has no sense of even an order of
 *    magnitude for some things. i've helped it by asking it to sample at the
 *    input before determining scalars for sliders/parameters."
 * El agente escribe `scale = 2.0` sin saber si la señal va de 0..1 o de 0..40000.
 * Esta tool mide la señal y devuelve, además de los números, una interpretación
 * en texto plano pensada para que un LLM la lea y actúe.
 *
 * READ-ONLY: no muta, no fuerza cooks, no crea ni borra nada.
 */

// -----------------------------------------------------------------------------
// Tipos
// -----------------------------------------------------------------------------

export interface ChannelStats {
  name: string;
  samples: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  first: number | null;
  last: number | null;
  range: number | null;
  is_constant: boolean;
  looks_normalized: boolean;
  looks_unit: boolean;
  suggested_scale: number | null;
  suggested_offset: number | null;
}

export interface MeasureResult {
  path: string;
  family: string;
  type: string | null;
  measured_at: string;
  units_guess: string;
  measurements: Record<string, unknown>;
  summary_for_scaling: {
    ranges: Array<{ channel: string; min: number | null; max: number | null; range: number | null }>;
    suggested_scalars: Array<{ channel: string; scale: number | null; offset: number | null }>;
  };
  interpretation: string;
  warnings: string[];
}

// -----------------------------------------------------------------------------
// Lógica pura (testeable sin TD)
// -----------------------------------------------------------------------------

/** OPType de TouchDesigner termina con la familia: noiseTOP, boxPOP, baseCOMP... */
export function familyFromOpType(opType: unknown): string | null {
  if (typeof opType !== "string" || !opType) return null;
  const t = opType.trim();
  for (const fam of ["POP", "TOP", "CHOP", "DAT", "SOP", "MAT", "COMP"]) {
    if (t.endsWith(fam)) return fam;
  }
  return null;
}

const isFiniteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Estadística de un canal. Los valores no finitos (NaN/Inf) se CUENTAN y se
 * excluyen del cálculo: devolver un min/max "limpio" calculado sobre NaN sería
 * un número falso disfrazado de medición.
 */
export function statsForChannel(name: string, raw: unknown[]): ChannelStats & { non_finite: number } {
  const vals = (raw ?? []).filter(isFiniteNum);
  const non_finite = (raw ?? []).length - vals.length;
  if (vals.length === 0) {
    return {
      name,
      samples: non_finite,
      min: null,
      max: null,
      mean: null,
      first: null,
      last: null,
      range: null,
      is_constant: false,
      looks_normalized: false,
      looks_unit: false,
      suggested_scale: null,
      suggested_offset: null,
      non_finite,
    };
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  const range = max - min;
  const scale = range > 0 ? 1 / range : null;
  return {
    name,
    samples: vals.length,
    min,
    max,
    mean: sum / vals.length,
    first: vals[0],
    last: vals[vals.length - 1],
    range,
    is_constant: range === 0,
    looks_normalized: min >= 0 && max <= 1,
    looks_unit: min >= -1 && max <= 1,
    suggested_scale: scale,
    // `|| 0` convierte -0 en 0: -0 aparece cuando min===0 y en JSON es ruido.
    suggested_offset: range > 0 ? -min / range || 0 : null,
    non_finite,
  };
}

/** Texto para el LLM: qué significan estos números y si hay que reescalar. */
export function interpretationFor(stats: ChannelStats[], family: string): string {
  if (family !== "CHOP") {
    return `Familia ${family}: la medición no es de señal numérica; mirá measurements para dimensionar (resolución, conteos, bounding box).`;
  }
  if (stats.length === 0) return "No se pudieron leer canales: revisá el path y que el CHOP tenga datos.";
  const parts: string[] = [];
  const allNormalized = stats.every((s) => s.looks_normalized);
  const allUnit = stats.every((s) => s.looks_unit);
  const constant = stats.filter((s) => s.is_constant);
  if (allNormalized) {
    parts.push("Todos los canales ya viven en 0..1: no hace falta reescalar si el parámetro destino también espera 0..1.");
  } else if (allUnit) {
    parts.push("Los canales viven en -1..1: para 0..1 sumá 1 y dividí por 2 (scale 0.5, offset 0.5); para un bipolar dejalo como está.");
  } else {
    const r = stats
      .map((s) => `${s.name} ${s.min?.toFixed(4)}..${s.max?.toFixed(4)}`)
      .join(", ");
    const s0 = stats[0];
    parts.push(
      `Rangos medidos: ${r}. Para llevar '${s0.name}' a 0..1 usá scale=${s0.suggested_scale?.toFixed(6) ?? "n/d"} y offset=${s0.suggested_offset?.toFixed(6) ?? "n/d"}; fijate si ese rango es estable antes de hardcodear el escalar.`,
    );
  }
  if (constant.length === stats.length) {
    parts.push("Todos los canales son CONSTANTES en este buffer: no sirven como fuente de modulación (¿falta que TD cocine, o la señal está quieta?).");
  } else if (constant.length > 0) {
    parts.push(`Canales constantes (no modular con ellos): ${constant.map((c) => c.name).join(", ")}.`);
  }
  // El umbral es 100, no 1e9: el caso que motivó esta tool es una señal cruda
  // (audio 0..40000, coordenadas en píxeles) que el agente pretendía meter en un
  // slider 0..1. Con 1e9 el aviso no disparaba justo cuando hacía falta.
  const big = stats.filter(
    (s) =>
      s.range !== null &&
      (s.range > 100 || (s.max !== null && Math.abs(s.max) > 100) || (s.min !== null && Math.abs(s.min) > 100)),
  );
  if (big.length) {
    parts.push(
      `Ojo con el orden de magnitud de ${big.map((b) => b.name).join(", ")}: está lejos de 0..1, así que un slider 0..1 no lo toca — o normalizás con el scale sugerido o cambiás la unidad del parámetro.`,
    );
  }
  return parts.join(" ");
}

// -----------------------------------------------------------------------------
// Tool
// -----------------------------------------------------------------------------

const PY_ESCAPE = (p: string) => p.replace(/'/g, "\\'");

/**
 * `/exec` devuelve el JSON impreso dentro de `stdout` (string), NO en `.data`.
 * Leerlo mal devolvía `resolution: null` en un TOP que sí reporta width/height.
 */
export function parseExecJson(res: any, what: string): any {
  if (res?.success === false) {
    throw new Error(`${what} ilegible: ${res?.stderr || res?.error || "sin detalle"}`);
  }
  const out = String(res?.stdout ?? "").trim();
  const line = out
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith("{"));
  if (!line) {
    throw new Error(`${what}: /exec no devolvió JSON (stdout=${out.slice(0, 200)})`);
  }
  const parsed = JSON.parse(line);
  if (parsed?.success === false) {
    throw new Error(`${what} ilegible: ${parsed?.error ?? "sin detalle"}`);
  }
  return parsed?.data ?? parsed;
}

export function registerMeasureTools(server: McpServer, client: TDClient) {
  server.registerTool(
    "td_measure",
    {
      title: "Measure Signal Magnitudes",
      description:
        "Sample the REAL magnitude of a signal BEFORE choosing any scalar (scale/gain/offset/threshold). " +
        "Use this instead of guessing: a CHOP buffer tells you the range it actually swings through " +
        "(min/max/mean/last, whether it is already 0..1 or -1..1, whether it is constant) and returns " +
        "the scale/offset that would map it to 0..1 plus a plain-language interpretation. " +
        "Read-only, never mutates the network. For TOPs it reports resolution/aspect, for POPs point/prim " +
        "counts and attributes, for DATs rows/columns. Do NOT sample by taking screenshots or by reading " +
        "a DAT and doing the math yourself — call this tool.",
      inputSchema: {
        path: z.string().describe("Operator path to measure (a CHOP, TOP, POP, DAT...)"),
        channels: z
          .array(z.string())
          .optional()
          .describe("CHOP only: restrict to these channel names"),
        samples: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .optional()
          .describe("Max samples per channel to summarise (default 1000, cap 5000)"),
      },
    },
    async ({ path, channels, samples }) => {
      try {
        const scope = normalizeScope(path);
        const maxSamples = Math.min(Math.max(samples ?? 1000, 1), 5000);
        const warnings: string[] = [];

        const detail: any = await runBounded("td_measure", scope, () =>
          client.getNodeDetail(scope, false),
        );
        const d = detail?.data ?? detail;
        if (detail?.success === false) {
          throw new Error(
            `No se pudo leer '${scope}': ${detail?.error ?? "sin detalle"}. Verificá el path con td_find o td_operators.`,
          );
        }
        const opType: string | null = d?.type ?? null;
        const family = familyFromOpType(opType) ?? "UNKNOWN";

        const measurements: Record<string, unknown> = {};
        let stats: ChannelStats[] = [];

        if (family === "CHOP") {
          const res: any = await runBounded("td_measure", scope, () =>
            client.readChop(scope, channels, 0, maxSamples),
          );
          if (res?.success === false) throw new Error(`CHOP ilegible: ${res?.error ?? "sin detalle"}`);
          const data = res?.data ?? res;
          const chans: Record<string, unknown[]> = data?.channels ?? {};
          const names = Object.keys(chans);
          const declared = Number(data?.numChannels ?? 0);
          if (names.length === 0 && declared > 0) {
            // Canales declarados y cero leídos = lectura rota, no "CHOP sin señal".
            throw new Error(
              `El CHOP declara ${declared} canal(es) y no se pudo leer ninguno (¿cambió el acceso a canales en este build?): no devuelvo estadísticas vacías disfrazadas de medición.`,
            );
          }
          if (names.length === 0) warnings.push("El CHOP no tiene canales (¿vacío o sin conexión de entrada?).");
          stats = names.map((n) => statsForChannel(n, chans[n] ?? []));
          const nonFinite = stats.reduce((a, s: any) => a + (s.non_finite ?? 0), 0);
          if (nonFinite > 0) {
            warnings.push(
              `${nonFinite} muestra(s) NaN/Inf excluidas de las estadísticas (división por cero o señal rota): no las trates como valores válidos.`,
            );
          }
          const zeroRange = stats.filter((s) => s.is_constant).map((s) => s.name);
          if (zeroRange.length) {
            warnings.push(
              `Rango cero en ${zeroRange.join(", ")}: sin información de escala (no se calculó 1/range).`,
            );
          }
          measurements.channels = stats.map(({ suggested_scale, suggested_offset, ...rest }) => rest);
          measurements.numSamplesReported = data?.numSamples ?? null;
          measurements.numChannels = data?.numChannels ?? names.length;
        } else if (family === "TOP") {
          // Resolución: no hay endpoint propio, se usa /exec (read-only).
          const code = `import json
try:
    t = op('${PY_ESCAPE(scope)}')
    if t is None: print(json.dumps({'success':False,'error':'Not found'}))
    else:
        def _num(o, name):
            v = getattr(o, name, None)
            if v is None: return None
            if callable(v):
                try: v = v()
                except Exception: return None
            return v
        info = {'type': t.OPType}
        for a in ('width','height','depth'):
            info[a] = _num(t, a)
        try:
            if info.get('width') and info.get('height'):
                info['aspect'] = float(info['width']) / float(info['height'])
        except Exception: pass
        print(json.dumps({'success':True,'data':info}))
except Exception as e:
    print(json.dumps({'success':False,'error':str(e)}))`;
          const res: any = await runBounded("td_measure", scope, () => client.execute(code, scope));
          const info = parseExecJson(res, "TOP");
          const _w = info?.width ?? null;
          const _h = info?.height ?? null;
          measurements.resolution = { width: _w, height: _h };
          // Fallback aritmético: si el bridge no manda aspect, se calcula de lo
          // medido (no se inventa nada: es width/height).
          measurements.aspect = info?.aspect ?? (_w && _h ? _w / _h : null);
          measurements.depth = info?.depth ?? null;
          if (!info?.width || !info?.height) {
            warnings.push("El TOP no reportó resolución (¿está sin conexión de entrada?).");
          }
        } else if (family === "POP") {
          const res: any = await runBounded("td_measure", scope, () => client.popInspect(scope));
          if (res?.success === false) throw new Error(`POP ilegible: ${res?.error ?? "sin detalle"}`);
          const info = res?.data ?? res;
          measurements.counts = {
            points: info?.numPoints ?? null,
            prims: info?.numPrims ?? null,
            verts: info?.numVerts ?? null,
          };
          // MEDIDO EN VIVO: en 2025.32460 `t.attribs` / `pointAttribs` devuelven
          // None, así que la lista llega vacía SIN ser "0 atributos". [] mentiría.
          const attrs = info?.attributes;
          measurements.attributes = Array.isArray(attrs) && attrs.length > 0 ? attrs : null;
          if (!measurements.attributes) {
            warnings.push(
              "Este build no expone la lista de atributos del POP (t.attribs devuelve None): el conteo de puntos es válido, los atributos por punto no están disponibles.",
            );
          }
          const pts = info?.numPoints;
          if (typeof pts === "number") {
            measurements.attribute_bytes_per_point =
              Array.isArray(info?.attributes) && info.attributes.length
                ? info.attributes.reduce(
                    (a: number, x: any) => a + (x?.size ?? 0) * 4,
                    0,
                  )
                : null;
          }
          if (typeof pts === "number" && pts > 500000) {
            warnings.push(
              `${pts} puntos: cualquier atributo nuevo por punto cuesta memoria; medí el costo antes de agregar campos.`,
            );
          }
        } else if (family === "DAT") {
          const res: any = await runBounded("td_measure", scope, () => client.readDat(scope, 1, 1));
          if (res?.success === false) throw new Error(`DAT ilegible: ${res?.error ?? "sin detalle"}`);
          measurements.rows = res?.totalLines ?? null;
          if (Array.isArray(d?.pars)) {
            measurements.columns = null; // se completa abajo si el DAT lo expone
          }
        } else {
          return err(
            `La familia '${family}' (${opType ?? "tipo desconocido"}) no se muestrea: ` +
              `td_measure cubre CHOP (rango de la señal), TOP (resolución), POP (puntos/atributos) y DAT (filas). ` +
              `Para el resto usá td_get_node_detail o td_pars_get.`,
          );
        }

        const summary_for_scaling = {
          ranges: stats.map((s) => ({ channel: s.name, min: s.min, max: s.max, range: s.range })),
          suggested_scalars: stats.map((s) => ({
            channel: s.name,
            scale: s.suggested_scale,
            offset: s.suggested_offset,
          })),
        };

        let units_guess = "desconocido";
        if (family === "CHOP" && stats.length) {
          if (stats.every((s) => s.looks_normalized)) units_guess = "normalizado 0..1";
          else if (stats.every((s) => s.looks_unit)) units_guess = "bipolar -1..1";
          else units_guess = "crudo (sin normalizar)";
        } else if (family === "TOP") units_guess = "pixeles";
        else if (family === "POP") units_guess = "conteo de geometria";
        else if (family === "DAT") units_guess = "filas de texto";

        const result: MeasureResult = {
          path: scope,
          family,
          type: opType,
          measured_at: new Date().toISOString(),
          units_guess,
          measurements,
          summary_for_scaling,
          interpretation: interpretationFor(stats, family),
          warnings,
        };
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
