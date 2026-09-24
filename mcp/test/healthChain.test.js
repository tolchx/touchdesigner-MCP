/**
 * Chain-health suite — the "one live verdict" tool.
 *
 * Rationale (2026-09-24, evidence from the closest comparable project): their
 * longest-running bug was a status indicator that reported CONFIGURATION instead
 * of a live connection, so users spent weeks clicking a green check while the
 * bridge was dead. These tests pin the decision table: DOWN only when the
 * transport is really gone, DEGRADED when TD answers but cannot do the work
 * (not cooking, network errors, dead reads), OK otherwise — and always with the
 * evidence needed to report the failure.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runHealthChain, buildBugReport } from "../dist/tools/health.js";
import { err } from "../dist/helpers.js";
import { TDRequestError } from "../../api/dist/index.js";

const INFO_OK = {
  build: "2025.32460",
  product: "TouchDesigner",
  platform: "Windows",
  runtime: { cooking: "on", fps: 60, pid: 1234 },
};

function fake(overrides = {}) {
  return {
    getInfo: async () => INFO_OK,
    getOperators: async () => ({ operators: [{ name: "a" }], count: 1 }),
    healthcheck: async () => ({ issueCount: 0, issues: [] }),
    getPerf: async () => ({ fps: 60, cookTime: 4 }),
    ...overrides,
  };
}

function downError() {
  return new TDRequestError("fetch failed ECONNREFUSED [bridge=127.0.0.1:44444]", {
    kind: "bridge_unreachable",
    bridge: "127.0.0.1:44444",
    transport: "http",
    method: "GET",
    target: "/info",
    attempts: 3,
    last_ok_call: null,
    hint: "HINT_DE_BRIDGE",
    benign: false,
  });
}

describe("td_healthchain — tabla de decisión", () => {
  it("OK cuando la cadena completa responde y la red está limpia", async () => {
    const r = await runHealthChain(fake());
    assert.equal(r.verdict, "OK");
    assert.equal(r.checks.length, 4);
    assert.deepEqual(
      r.checks.map((c) => c.name),
      ["bridge_info", "operators_read", "network_errors", "performance"],
    );
    assert.ok(r.checks.every((c) => c.ok));
    assert.equal(r.runtime.cooking, "on");
    assert.equal(r.checks[0].detail.build, "2025.32460");
    assert.match(r.summary, /Cadena completa operativa/);
  });

  it("DOWN cuando el bridge no responde, propagando el hint del envelope", async () => {
    const r = await runHealthChain(
      fake({
        getInfo: async () => {
          throw downError();
        },
        getOperators: async () => {
          throw downError();
        },
      }),
    );
    assert.equal(r.verdict, "DOWN");
    assert.equal(r.checks[0].ok, false);
    assert.match(r.checks[0].error, /ECONNREFUSED/);
    assert.equal(r.hint, "HINT_DE_BRIDGE", "el hint accionable llega al veredicto");
    // Clasificación de transporte también en el resultado, no sólo en el log:
    // es lo que distingue "no llegó nunca" de "se cortó a mitad".
    assert.equal(r.transport.kind, "bridge_unreachable");
    assert.equal(r.transport.attempts, 3);
    assert.equal(r.transport.bridge, "127.0.0.1:44444");
  });

  it("DEGRADED cuando TD responde pero no está cocinando", async () => {
    const r = await runHealthChain(
      fake({
        getInfo: async () => ({ ...INFO_OK, runtime: { cooking: "off", fps: 0 } }),
      }),
    );
    assert.equal(r.verdict, "DEGRADED");
    assert.match(r.summary, /no está cocinando/);
    assert.match(r.hint, /cooking/i);
  });

  it("DEGRADED cuando el bridge responde pero la lectura de operadores falla", async () => {
    const r = await runHealthChain(
      fake({
        getOperators: async () => {
          throw new Error("ExecutionError: op('/') does not exist");
        },
      }),
    );
    assert.equal(r.verdict, "DEGRADED");
    assert.equal(r.checks[0].ok, true);
    assert.equal(r.checks[1].ok, false);
    assert.match(r.summary, /lectura de operadores falló/);
  });

  it("los errores del PROYECTO van como warning, no degradan (hallazgo en vivo)", async () => {
    const r = await runHealthChain(
      fake({ healthcheck: async () => ({ issueCount: 3, issues: [1, 2, 3] }) }),
    );
    // Medido en vivo el 24/09/26: cadena 4/4 OK y 31 issues del proyecto daban
    // DEGRADED. Un indicador que grita siempre es tan inútil como uno que
    // miente: los avisos del proyecto van aparte del veredicto de cadena.
    assert.equal(r.verdict, "OK");
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /3 error/);
  });

  it("un fallo de performance NO degrada el veredicto por sí solo", async () => {
    const r = await runHealthChain(
      fake({
        getPerf: async () => {
          throw new Error("perf no disponible");
        },
      }),
    );
    assert.equal(r.verdict, "OK", "perf es best-effort");
    assert.equal(r.checks[3].ok, false);
  });

  it("incluye evidencia del cliente (last_ok, calls, log)", async () => {
    const r = await runHealthChain(fake(), { include_calls: 3 });
    assert.ok("last_ok_call" in r.evidence);
    assert.ok(Array.isArray(r.evidence.recent_calls));
    assert.ok(r.evidence.recent_calls.length <= 3);
    assert.ok("byKind" in r.evidence.call_stats);
  });
});

describe("td_report_bug — bundle de evidencia", () => {
  it("arma un reporte autosuficiente (versiones + veredicto + log)", async () => {
    const health = await runHealthChain(
      fake({
        getInfo: async () => {
          throw downError();
        },
        getOperators: async () => {
          throw downError();
        },
      }),
    );
    const md = buildBugReport(health, {
      symptoms: "le pido algo y no hace nada",
      expected: "que cree el nodo",
      path: "/project1",
    });
    assert.match(md, /# TD-MCP bug report/);
    assert.match(md, /\*\*síntoma:\*\* le pido algo y no hace nada/);
    assert.match(md, /\*\*esperado:\*\* que cree el nodo/);
    assert.match(md, /veredicto de cadena:\*\* DOWN/);
    assert.match(md, /## Chequeos/);
    assert.match(md, /## Últimas llamadas del cliente/);
    assert.match(md, /node:/);
  });

  it("no explota cuando no hay runtime ni llamadas previas", async () => {
    const health = await runHealthChain(
      fake({ getInfo: async () => ({ build: "2025.1" }) }),
    );
    const md = buildBugReport(health, { symptoms: "x" });
    assert.match(md, /runtime TD:\*\* null/);
    assert.match(md, /última llamada OK:\*\* (ninguna|null)/);
  });
});

describe("err() adjunta el diagnóstico a las tools", () => {
  it("incluye envelope + evidencia cuando el error es de transporte", () => {
    const out = err(downError());
    assert.equal(out.isError, true);
    const payload = JSON.parse(out.content[0].text);
    assert.equal(payload.diagnostic.kind, "bridge_unreachable");
    assert.equal(payload.diagnostic.attempts, 3);
    assert.ok(payload.diagnostic.hint);
    assert.ok(Array.isArray(payload.recent_calls));
    assert.match(payload.hint, /td_healthchain/);
  });

  it("un error común sigue siendo sólo el mensaje (sin ruido)", () => {
    const out = err(new Error("op('/x') does not exist"));
    const payload = JSON.parse(out.content[0].text);
    assert.equal(payload.error, "op('/x') does not exist");
    assert.equal(payload.diagnostic, undefined);
  });
});
