/**
 * Unit tests for Deterministic Fallback Planner — isFamilyCompatible + deterministicPlan
 *
 * isFamilyCompatible: returns true only when source and target families match
 * (same-family connections are always valid in TD; cross-family need adapters).
 *
 * deterministicPlan: keyword-matching topology-aware planner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isFamilyCompatible, deterministicPlan } from "../dist/plannerDeterministic.js";
import { buildTopologyCatalog } from "../dist/topologyData.js";

// ─── isFamilyCompatible ────────────────────────────────────────────────────

describe("isFamilyCompatible", () => {
  it("should return true for TOP → TOP", () => {
    assert.equal(isFamilyCompatible("TOP", "TOP"), true);
  });

  it("should return true for CHOP → CHOP", () => {
    assert.equal(isFamilyCompatible("CHOP", "CHOP"), true);
  });

  it("should return true for SOP → SOP", () => {
    assert.equal(isFamilyCompatible("SOP", "SOP"), true);
  });

  it("should return true for DAT → DAT", () => {
    assert.equal(isFamilyCompatible("DAT", "DAT"), true);
  });

  it("should return true for POP → POP", () => {
    assert.equal(isFamilyCompatible("POP", "POP"), true);
  });

  it("should return true for COMP → COMP", () => {
    assert.equal(isFamilyCompatible("COMP", "COMP"), true);
  });

  it("should return true for MAT → MAT", () => {
    assert.equal(isFamilyCompatible("MAT", "MAT"), true);
  });

  it("should return false for TOP → CHOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("TOP", "CHOP"), false);
  });

  it("should return false for CHOP → TOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("CHOP", "TOP"), false);
  });

  it("should return false for POP → TOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("POP", "TOP"), false);
  });

  it("should return false for TOP → POP (cross-family)", () => {
    assert.equal(isFamilyCompatible("TOP", "POP"), false);
  });

  it("should return false for SOP → DAT (cross-family)", () => {
    assert.equal(isFamilyCompatible("SOP", "DAT"), false);
  });

  it("should return false for CHOP → POP (cross-family)", () => {
    assert.equal(isFamilyCompatible("CHOP", "POP"), false);
  });

  it("should return false for SOP → TOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("SOP", "TOP"), false);
  });

  it("should return false for MAT → COMP (cross-family)", () => {
    assert.equal(isFamilyCompatible("MAT", "COMP"), false);
  });

  it("should return false for MAT → TOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("MAT", "TOP"), false);
  });

  it("should return false for COMP → CHOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("COMP", "CHOP"), false);
  });

  it("should return false for DAT → TOP (cross-family)", () => {
    assert.equal(isFamilyCompatible("DAT", "TOP"), false);
  });

  it("should be case-sensitive (family names are canonical)", () => {
    assert.equal(isFamilyCompatible("top", "TOP"), false);
    assert.equal(isFamilyCompatible("TOP", "top"), false);
    assert.equal(isFamilyCompatible("pop", "POP"), false);
  });

  it("should return true for empty strings (strict equality)", () => {
    assert.equal(isFamilyCompatible("", ""), true);
  });

  it("should return true for same non-standard family name", () => {
    assert.equal(isFamilyCompatible("CUSTOM", "CUSTOM"), true);
  });

  it("should return false for non-standard different family names", () => {
    assert.equal(isFamilyCompatible("CUSTOM", "OTHER"), false);
  });

  it("should be symmetric — compat(A,B) === compat(B,A)", () => {
    const pairs = [
      ["TOP", "CHOP"], ["POP", "SOP"], ["DAT", "TOP"],
      ["COMP", "MAT"], ["TOP", "TOP"], ["POP", "POP"],
    ];
    for (const [a, b] of pairs) {
      assert.equal(
        isFamilyCompatible(a, b),
        isFamilyCompatible(b, a),
        `asymmetric: ${a}\u2192${b} vs ${b}\u2192${a}`
      );
    }
  });
});

// ─── deterministicPlan ─────────────────────────────────────────────────────

describe("deterministicPlan", () => {
  let catalog;

  it("should build a topology catalog", () => {
    catalog = buildTopologyCatalog();
    assert.ok(catalog.size > 10, `expected >10 entries, got ${catalog.size}`);
  });

  it("should plan a simple TOP chain for 'noise blur'", () => {
    const graph = deterministicPlan("noise blur", catalog, "/project1");
    assert.ok(graph.nodes.length >= 2, `expected ≥2 nodes, got ${graph.nodes.length}`);
    assert.equal(graph.targetPath, "/project1");
    assert.equal(graph.description, "noise blur");

    const types = graph.nodes.map((n) => n.opType);
    assert.ok(types.some((t) => t.includes("noise")), "expected noise operator");
    assert.ok(types.some((t) => t.includes("blur")), "expected blur operator");
  });

  it("should plan a POP chain for 'particle system'", () => {
    const graph = deterministicPlan("particle system simulation", catalog, "/project1");
    assert.ok(graph.nodes.length >= 1, `expected ≥1 node, got ${graph.nodes.length}`);

    const types = graph.nodes.map((n) => n.opType);
    assert.ok(
      types.some((t) => t.includes("particle") || t.includes("POP")),
      "expected POP operator"
    );
  });

  it("should add a null output node if not present", () => {
    const graph = deterministicPlan("noise blur", catalog, "/project1");
    const types = graph.nodes.map((n) => n.opType);
    assert.ok(
      types.some((t) => t.includes("null")),
      "expected null output node"
    );
  });

  it("should produce valid connections between nodes", () => {
    const graph = deterministicPlan("noise blur composite", catalog, "/project1");
    if (graph.connections.length > 0) {
      const nodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const conn of graph.connections) {
        assert.ok(nodeIds.has(conn.from), `connection from '${conn.from}' not in nodes`);
        assert.ok(nodeIds.has(conn.to), `connection to '${conn.to}' not in nodes`);
        assert.ok(typeof conn.inputIndex === "number" && conn.inputIndex >= 0);
      }
    }
  });

  it("should return empty nodes for gibberish prompt", () => {
    const graph = deterministicPlan("xyzzy quux", catalog, "/project1");
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.connections.length, 0);
  });

  it("should return empty nodes for empty string", () => {
    const graph = deterministicPlan("", catalog, "/project1");
    assert.equal(graph.nodes.length, 0);
    assert.equal(graph.connections.length, 0);
  });

  it("should plan at least one operator for single-word 'noise'", () => {
    const graph = deterministicPlan("noise", catalog, "/project1");
    assert.ok(graph.nodes.length >= 1, `expected ≥1 node for 'noise', got ${graph.nodes.length}`);
  });

  it("should plan a CHOP chain for 'audio spectrum'", () => {
    const graph = deterministicPlan("audio spectrum", catalog, "/project1");
    const types = graph.nodes.map((n) => n.opType);
    assert.ok(
      types.some((t) => t.includes("CHOP") || t.includes("audio") || t.includes("spectrum")),
      "expected CHOP operators"
    );
  });

  it("should limit selected nodes to max 15 (+ optional null output)", () => {
    const graph = deterministicPlan(
      "noise blur composite feedback transform level edge chromakey over kaleidoscope constant glsl text ramp threshold displace lookup crop",
      catalog,
      "/project1"
    );
    // deterministicPlan selects up to 15 matched operators, then may add a null output
    assert.ok(graph.nodes.length <= 16, `expected ≤16 nodes (15 + null), got ${graph.nodes.length}`);
    assert.ok(graph.nodes.length >= 15, `expected ≥15 nodes, got ${graph.nodes.length}`);
  });
});
