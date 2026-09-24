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
