/**
 * Exploration guardrails suite.
 *
 * Context (2026-09-24): in the closest comparable project, the search tool
 * "will hang TD on a sufficiently large network" (confirmed by its maintainer);
 * users worked around it by writing warnings into their agent's context file.
 * These tests pin the three defences: explicit scope, a clamped result budget,
 * and a bounded wait whose failure tells the agent TD may STILL be busy — so it
 * narrows the scope instead of retrying the same sweep.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  EXPLORE_DEFAULT_LIMIT,
  EXPLORE_MAX_LIMIT,
  ExploreTimeoutError,
  clampLimit,
  normalizeScope,
  runBounded,
} from "../dist/exploreGuard.js";
import { err } from "../dist/helpers.js";

describe("normalizeScope", () => {
  it("normaliza vacíos a la raíz", () => {
    assert.equal(normalizeScope(undefined), "/");
    assert.equal(normalizeScope(null), "/");
    assert.equal(normalizeScope(""), "/");
    assert.equal(normalizeScope("   "), "/");
  });
  it("recorta espacios y respeta el path pedido", () => {
    assert.equal(normalizeScope("  /project1/geo "), "/project1/geo");
  });
});

describe("clampLimit", () => {
  it("default cuando no se especifica", () => {
    assert.equal(clampLimit(undefined), EXPLORE_DEFAULT_LIMIT);
  });
  it("techo duro", () => {
    assert.equal(clampLimit(99999), EXPLORE_MAX_LIMIT);
    assert.equal(clampLimit(99999, 200), 200);
  });
  it("piso en 1 y trunca decimales", () => {
    assert.equal(clampLimit(0), 1);
    assert.equal(clampLimit(-5), 1);
    assert.equal(clampLimit(12.7), 12);
  });
  it("no toca valores razonables", () => {
    assert.equal(clampLimit(37), 37);
  });
});

describe("runBounded", () => {
  it("devuelve el resultado cuando entra en el budget", async () => {
    const out = await runBounded("td_test", "/", async () => ({ ok: 1 }), 200);
    assert.deepEqual(out, { ok: 1 });
  });

  it("corta y explica que TD puede seguir ocupado", async () => {
    const hang = () => new Promise(() => {});
    await assert.rejects(
      () => runBounded("td_search", "/project1", hang, 30),
      (e) => {
        assert.ok(e instanceof ExploreTimeoutError);
        assert.equal(e.kind, "timeout");
        assert.equal(e.tool, "td_search");
        assert.equal(e.scope, "/project1");
        assert.match(e.message, /PUEDE SEGUIR TRABAJANDO/);
        assert.match(e.envelope.hint, /acotá el scope/);
        return true;
      },
    );
  });

  it("el error del guard llega a la tool con diagnóstico accionable", async () => {
    let captured;
    try {
      await runBounded("td_find", "/", () => new Promise(() => {}), 20);
    } catch (e) {
      captured = e;
    }
    const payload = JSON.parse(err(captured).content[0].text);
    assert.equal(payload.diagnostic.kind, "timeout");
    assert.equal(payload.diagnostic.target, "td_find");
    assert.match(payload.diagnostic.hint, /No lo repitas igual/);
  });

  it("propaga el error real si la operación falla antes del budget", async () => {
    await assert.rejects(
      () => runBounded("td_find", "/", async () => { throw new Error("boom real"); }, 500),
      /boom real/,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// test-GUARD: toda tool de exploración DEBE estar envuelta en runBounded.
//
// No mira el dist ni mocks: escanea el FUENTE real de mcp/src/tools/*.ts y
// empareja cada llamada `runBounded("<tool>", ...)` con el `registerTool`
// que la contiene. Si mañana alguien agrega una tool de exploración sin
// guardrails — o le quita el envoltorio a una existente — este test cae
// nombrando la tool. Item 56 del BACKLOG.
// ════════════════════════════════════════════════════════════════════════════

const TOOLS_SRC_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)), "..", "src", "tools",
);

/** Lista canónica de tools de exploración que REQUIEREN guardrails.
 * Las que recorren la red o pueden dejar TD ocupado barriendo. */
const EXPLORATION_TOOLS = [
  "td_operators", // ya envuelta (backlog 4-tools)
  "td_find", // idem
  "td_connections", // idem
  "td_get_errors", // idem
  "td_measure", // item de guardrails de measure
  "td_search", // el caso que motivó el guardrail (colgaba TD en redes grandes)
  "td_spatial_context",
  "td_explore_project",
  "td_compare_networks",
  "td_snapshot_scene",
];

/** Registra en un archivo: cada registerTool ("td_x", y cada runBounded("td_x". */
function scanToolFile(filename) {
  const src = readFileSync(path.join(TOOLS_SRC_DIR, filename), "utf8");
  const registrations = [];
  const bounded = [];
  const re = /(?:^|\n)(\s*)"((?:td|tool|glsl)_[a-z0-9_]+)",\s*\n|runBounded\(\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m[2] !== undefined) {
      registrations.push({ tool: m[2], pos: m.index });
    } else {
      bounded.push({ tool: m[3], pos: m.index });
    }
  }
  return { registrations, bounded };
}

/** Mapa {tool: true} para las tools cuyo handler contiene SU PROPIO runBounded. */
function scanAllWrappedTools() {
  const wrapped = new Map();
  const orphanBounded = []; // runBounded fuera de cualquier registerTool (bug)
  for (const f of readdirSync(TOOLS_SRC_DIR)) {
    if (!f.endsWith(".ts")) continue;
    const { registrations, bounded } = scanToolFile(f);
    for (const b of bounded) {
      const enclosing = registrations
        .filter((r) => r.pos < b.pos)
        .sort((a, b2) => b2.pos - a.pos)[0];
      if (!enclosing) {
        orphanBounded.push({ file: f, tool: b.tool });
      } else if (enclosing.tool === b.tool) {
        wrapped.set(b.tool, f);
      }
    }
  }
  return { wrapped, orphanBounded };
}

describe("test-guard: las tools de exploración llevan guardrails", () => {
  const { wrapped, orphanBounded } = scanAllWrappedTools();

  it("cada tool de la lista canónica está envuelta en runBounded", () => {
    const missing = EXPLORATION_TOOLS.filter((t) => !wrapped.has(t));
    assert.deepEqual(
      missing, [],
      `Tools de exploración SIN guardrails (runBounded/normalizeScope): ${missing.join(", ")}. ` +
        `Envolverlas con normalizeScope + clampLimit + runBounded (mcp/src/exploreGuard.ts).`,
    );
  });

  it("no hay runBounded fuera del handler de una tool registrada", () => {
    assert.deepEqual(
      orphanBounded, [],
      `runBounded() fuera de cualquier registerTool (¿quedó suelto tras un refactor?): ` +
        `${JSON.stringify(orphanBounded)}`,
    );
  });

  it("el envoltorio usa el MISMO nombre de la tool (para el diagnóstico del timeout)", () => {
    // Si el handler de td_search llama runBounded("otra_cosa"), el error de
    // timeout apunta a una tool inexistente y el agente no puede acotar.
    const mismatches = [];
    for (const f of readdirSync(TOOLS_SRC_DIR)) {
      if (!f.endsWith(".ts")) continue;
      const { registrations, bounded } = scanToolFile(f);
      for (const b of bounded) {
        const enclosing = registrations
          .filter((r) => r.pos < b.pos)
          .sort((a, b2) => b2.pos - a.pos)[0];
        if (enclosing && enclosing.tool !== b.tool) {
          mismatches.push(`${f}: ${enclosing.tool} llama runBounded("${b.tool}")`);
        }
      }
    }
    assert.deepEqual(mismatches, [],
      `runBounded con nombre distinto a la tool que lo contiene: ${mismatches.join("; ")}`);
  });

  it("la lista canónica no decae: las 4 tools originales siguen listadas", () => {
    for (const t of ["td_operators", "td_find", "td_connections", "td_get_errors"]) {
      assert.ok(EXPLORATION_TOOLS.includes(t), `la lista del guard perdió ${t}`);
    }
  });
});
