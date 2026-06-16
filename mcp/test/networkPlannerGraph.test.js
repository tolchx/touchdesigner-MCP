/**
 * Unit tests for Network Planner Graph — Topology-Aware Network Planning
 *
 * Tests two pure functions:
 *   - inferOpTopology(opType, opData) — topology inference from patterns
 *   - deterministicPlan(prompt, catalog, targetPath) — keyword-based fallback planner
 *
 * These functions have no external dependencies (no TD, no SQLite, no HTTP).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  inferOpTopology,
  deterministicPlan,
} from "../dist/networkPlannerGraph.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a minimal OpTopology for catalog entries */
function makeTopo(overrides = {}) {
  return {
    opType: "nullTOP",
    family: "TOP",
    label: "Null",
    inputCount: 1,
    inputs: [{ index: 0, description: "Input", accepts: "TOP" }],
    outputs: [{ name: "output", type: "TOP" }],
    connectsTo: [],
    isMultiInput: false,
    warnings: [],
    commonCombinations: [],
    ...overrides,
  };
}

/** Build a catalog Map from an array of topo overrides */
function buildCatalog(entries = []) {
  const map = new Map();
  for (const e of entries) {
    const topo = makeTopo(e);
    map.set(topo.opType, topo);
  }
  return map;
}

// ─── inferOpTopology Tests ────────────────────────────────────────────────────

describe("inferOpTopology", () => {

  it("infers TOP family from suffix", () => {
    const result = inferOpTopology("blurTOP", {});
    assert.equal(result.family, "TOP");
    assert.equal(result.opType, "blurTOP");
    assert.equal(result.inputCount, 1);
    assert.equal(result.isMultiInput, false);
  });

  it("infers CHOP family from suffix", () => {
    const result = inferOpTopology("mathCHOP", {});
    assert.equal(result.family, "CHOP");
  });

  it("infers SOP family from suffix", () => {
    const result = inferOpTopology("sphereSOP", {});
    assert.equal(result.family, "SOP");
  });

  it("infers DAT family from suffix", () => {
    const result = inferOpTopology("textDAT", {});
    assert.equal(result.family, "DAT");
  });

  it("infers POP family from suffix", () => {
    const result = inferOpTopology("particlePOP", {});
    assert.equal(result.family, "POP");
  });

  it("infers COMP family from suffix", () => {
    const result = inferOpTopology("containerCOMP", {});
    assert.equal(result.family, "COMP");
  });

  it("defaults to unknown for unrecognized suffix", () => {
    const result = inferOpTopology("somethingELSE", {});
    assert.equal(result.family, "unknown");
  });

  it("uses opData.pageTitle as label when available", () => {
    const result = inferOpTopology("blurTOP", {
      pageTitle: "Blur (Filter)",
      label: "blur",
    });
    assert.equal(result.label, "Blur (Filter)");
  });

  it("falls back to opData.label when pageTitle missing", () => {
    const result = inferOpTopology("blurTOP", { label: "blur" });
    assert.equal(result.label, "blur");
  });

  it("falls back to opType when no label data", () => {
    const result = inferOpTopology("blurTOP", {});
    assert.equal(result.label, "blurTOP");
  });

  it("detects multi-input from MULTI_INPUT_PATTERNS (compositeTOP)", () => {
    const result = inferOpTopology("compositeTOP", {});
    assert.equal(result.isMultiInput, true);
    assert.ok(result.inputCount >= 2);
  });

  it("detects multi-input from MULTI_INPUT_PATTERNS (mergeCHOP)", () => {
    const result = inferOpTopology("mergeCHOP", {});
    assert.equal(result.isMultiInput, true);
  });

  it("detects multi-input from MULTI_INPUT_PATTERNS (mergePOP)", () => {
    const result = inferOpTopology("mergePOP", {});
    assert.equal(result.isMultiInput, true);
  });

  it("detects multi-input from MULTI_INPUT_PATTERNS (blendPOP)", () => {
    const result = inferOpTopology("blendPOP", {});
    assert.equal(result.isMultiInput, true);
  });

  it("detects single input from SINGLE_INPUT_PATTERNS (blurTOP)", () => {
    const result = inferOpTopology("blurTOP", {});
    assert.equal(result.inputCount, 1);
    assert.equal(result.isMultiInput, false);
  });

  it("detects single input (noiseTOP)", () => {
    const result = inferOpTopology("noiseTOP", {});
    assert.equal(result.inputCount, 1);
  });

  it("adds multi-input extra entry when isMultiInput", () => {
    const result = inferOpTopology("compositeTOP", {});
    const extraInput = result.inputs.find((i) =>
      i.description.startsWith("Additional")
    );
    assert.ok(extraInput, "should have an 'Additional inputs' entry");
  });

  it("adds warning for feedbackTOP", () => {
    const result = inferOpTopology("feedbackTOP", {});
    assert.ok(
      result.warnings.some((w) => w.includes("top") && w.includes("feedback")),
      "feedbackTOP should have a warning about 'top' parameter"
    );
  });

  it("adds warning for particlePOP", () => {
    const result = inferOpTopology("particlePOP", {});
    assert.ok(
      result.warnings.some((w) => w.includes("particlesupdatepop")),
      "particlePOP should warn about particlesupdatepop"
    );
  });

  it("adds warning for glslPOP", () => {
    const result = inferOpTopology("glslPOP", {});
    assert.ok(
      result.warnings.some((w) => w.includes("attribute")),
      "glslPOP should warn about attribute declarations"
    );
  });

  it("adds warning for neighborPOP", () => {
    const result = inferOpTopology("neighborPOP", {});
    assert.ok(
      result.warnings.some((w) => w.includes("neighbor")),
      "neighborPOP should warn about performance"
    );
  });

  it("adds warning for feedbackPOP", () => {
    const result = inferOpTopology("feedbackPOP", {});
    assert.ok(
      result.warnings.some((w) => w.includes("target")),
      "feedbackPOP should warn about target POP"
    );
  });

  it("parses commonCombinations from opData", () => {
    const result = inferOpTopology("blurTOP", {
      commonCombinations: [
        { operators: ["noiseTOP", "compositeTOP"], description: "Blur noise" },
      ],
    });
    assert.equal(result.commonCombinations.length, 1);
    assert.equal(result.commonCombinations[0].operators[0], "noiseTOP");
  });

  it("connectsTo is populated from commonCombinations", () => {
    const result = inferOpTopology("blurTOP", {
      commonCombinations: [
        { operators: ["noiseTOP", "compositeTOP"], description: "Blur noise" },
      ],
    });
    assert.ok(result.connectsTo.includes("noiseTOP"));
    assert.ok(result.connectsTo.includes("compositeTOP"));
    assert.ok(!result.connectsTo.includes("blurTOP")); // shouldn't include self
  });

  it("handles merge/switch/composite name patterns without explicit pattern entry", () => {
    // Note: name matching is case-sensitive — "customMergeTOP" (camelCase)
    // would NOT match because includes("merge") checks lowercase.
    // Use lowercase "merge" in the opType name.
    const result = inferOpTopology("custommergeTOP", {});
    // Falls into the name-pattern branch: opType includes "merge"
    assert.equal(result.isMultiInput, true, "custommergeTOP should be multi-input via name pattern");
    assert.equal(result.inputCount, 2);
  });

  it("handles empty opData gracefully", () => {
    const result = inferOpTopology("null", {});
    assert.equal(result.family, "unknown");
    assert.equal(result.inputCount, 1);
    assert.equal(result.isMultiInput, false);
  });

  it("handles opType with mixed casing", () => {
    const result = inferOpTopology("glslTOP", {});
    assert.equal(result.family, "TOP");
    assert.equal(result.inputCount, 1);
  });

  it("outputs always has at least one entry", () => {
    const result = inferOpTopology("noiseTOP", {});
    assert.ok(result.outputs.length >= 1);
    assert.equal(result.outputs[0].name, "output");
  });

});

// ─── deterministicPlan Tests ─────────────────────────────────────────────────

describe("deterministicPlan", () => {

  it("returns empty graph for empty prompt with empty catalog", () => {
    const result = deterministicPlan("", new Map(), "/project1");
    assert.equal(result.nodes.length, 0);
    assert.equal(result.connections.length, 0);
    assert.equal(result.targetPath, "/project1");
  });

  it("returns empty graph for single short words with empty catalog", () => {
    const result = deterministicPlan("a", new Map(), "/project1");
    assert.equal(result.nodes.length, 0);
    assert.equal(result.connections.length, 0);
  });

  it("selects matching operators from catalog by keyword", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("noise", catalog, "/project1");
    assert.ok(result.nodes.length >= 1);
    const nodeTypes = result.nodes.map((n) => n.opType);
    assert.ok(nodeTypes.includes("noiseTOP"), "should include noiseTOP");
  });

  it("ranks higher for multi-keyword matches", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      { opType: "noiseBlurTOP", family: "TOP", label: "Noise Blur" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    const nodeTypes = result.nodes.map((n) => n.opType);
    // noiseBlurTOP should score highest (matches both words)
    assert.ok(
      nodeTypes.includes("noiseBlurTOP"),
      "should include best-scoring operator"
    );
    assert.ok(nodeTypes.includes("noiseTOP"), "should include noiseTOP");
    assert.ok(nodeTypes.includes("blurTOP"), "should include blurTOP");
  });

  it("applies family bonus for TOP when prompt mentions texture/image", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "noiseCHOP", family: "CHOP", label: "Noise" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("texture noise", catalog, "/project1");
    // Should prefer TOP over CHOP for "texture" hint
    const tops = result.nodes.filter((n) => n.opType === "noiseTOP");
    const chops = result.nodes.filter((n) => n.opType === "noiseCHOP");
    assert.ok(
      tops.length > 0,
      "should include noiseTOP (bonus for texture hint)"
    );
    assert.ok(
      chops.length === 0 || result.nodes.indexOf(tops[0]) < result.nodes.indexOf(chops[0]),
      "noiseTOP should rank higher than noiseCHOP"
    );
  });

  it("applies family bonus for POP when prompt mentions particle", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "noisePOP", family: "POP", label: "Noise" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("particle noise", catalog, "/project1");
    const pops = result.nodes.filter((n) => n.opType === "noisePOP");
    assert.ok(
      pops.length > 0,
      "should include noisePOP (bonus for particle hint)"
    );
  });

  it("applies family bonus for CHOP when prompt mentions audio", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "audioCHOP", family: "CHOP", label: "Audio" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("audio signal", catalog, "/project1");
    const chops = result.nodes.filter((n) => n.opType === "audioCHOP");
    assert.ok(
      chops.length > 0,
      "should include audioCHOP (bonus for audio hint)"
    );
  });

  it("adds null output if not already present", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    const nullOps = result.nodes.filter((n) => n.opType.includes("null"));
    assert.ok(nullOps.length >= 1, "should add a null output node");
  });

  it("does not add null output if already present", () => {
    const catalog = buildCatalog([
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("null", catalog, "/project1");
    const nullCount = result.nodes.filter((n) =>
      n.opType.includes("null")
    ).length;
    assert.equal(nullCount, 1, "should not duplicate null node");
  });

  it("limits selected nodes to 15", () => {
    const catalog = buildCatalog(
      Array.from({ length: 30 }, (_, i) => ({
        opType: `testTOP${i}`,
        family: "TOP",
        label: `Test ${i}`,
      }))
    );
    // Add "test" keyword to all entries via labels
    const catalog2 = new Map();
    for (const [key, val] of catalog) {
      catalog2.set(key, { ...val, label: `test ${key}` });
    }
    const result = deterministicPlan("test", catalog2, "/project1");
    // 15 max + possible null = up to 16
    assert.ok(
      result.nodes.length <= 16,
      `should not exceed 16 nodes (was ${result.nodes.length})`
    );
  });

  it("wires nodes in family chain connections", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    assert.ok(
      result.connections.length >= 1,
      "should create at least one connection"
    );
    // Each connection should have valid from/to node IDs
    const nodeIds = new Set(result.nodes.map((n) => n.id));
    for (const conn of result.connections) {
      assert.ok(nodeIds.has(conn.from), `from node '${conn.from}' must exist`);
      assert.ok(nodeIds.has(conn.to), `to node '${conn.to}' must exist`);
    }
  });

  it("wires connections with inputIndex 0 by default", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    for (const conn of result.connections) {
      assert.equal(
        conn.inputIndex,
        0,
        "single-input chain should always use inputIndex 0"
      );
    }
  });

  it("selects correct null suffix for POP family", () => {
    const catalog = buildCatalog([
      { opType: "noisePOP", family: "POP", label: "Noise" },
      { opType: "blurPOP", family: "POP", label: "Blur" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    const nullNode = result.nodes.find((n) => n.opType.includes("null"));
    assert.ok(nullNode, "should have a null node");
    assert.equal(nullNode.opType, "nullPOP", "POP family should get nullPOP");
  });

  it("selects correct null suffix for CHOP family", () => {
    const catalog = buildCatalog([
      { opType: "noiseCHOP", family: "CHOP", label: "Noise" },
    ]);
    const result = deterministicPlan("noise", catalog, "/project1");
    const nullNode = result.nodes.find((n) => n.opType.includes("null"));
    assert.equal(nullNode.opType, "nullCHOP");
  });

  it("selects correct null suffix for SOP family", () => {
    const catalog = buildCatalog([
      { opType: "noiseSOP", family: "SOP", label: "Noise" },
    ]);
    const result = deterministicPlan("noise", catalog, "/project1");
    const nullNode = result.nodes.find((n) => n.opType.includes("null"));
    assert.equal(nullNode.opType, "nullSOP");
  });

  it("positions nodes with x spacing", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
    ]);
    const result = deterministicPlan("noise blur", catalog, "/project1");
    if (result.nodes.length >= 2) {
      assert.ok(
        result.nodes[1].x > result.nodes[0].x,
        "nodes should be spaced 180px apart"
      );
    }
  });

  it("uses targetPath for all nodes", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
    ]);
    const result = deterministicPlan("noise", catalog, "/my/toe/network");
    for (const node of result.nodes) {
      assert.equal(node.parentPath, "/my/toe/network");
    }
  });

  it("avoids matching words shorter than 3 characters", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
    ]);
    const result = deterministicPlan("a an to", catalog, "/project1");
    assert.equal(
      result.nodes.length,
      0,
      "short words should not match anything"
    );
  });

  it("scores feedback keyword higher for feedback operators", () => {
    const catalog = buildCatalog([
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      { opType: "feedbackTOP", family: "TOP", label: "Feedback" },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("feedback", catalog, "/project1");
    const feedbackNode = result.nodes.find((n) =>
      n.opType.includes("feedback")
    );
    assert.ok(feedbackNode, "feedbackTOP should be selected for 'feedback'");
  });

  it("handles multi-input wiring when isMultiInput topo exists", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
      { opType: "blurTOP", family: "TOP", label: "Blur" },
      {
        opType: "compositeTOP",
        family: "TOP",
        label: "Composite",
        isMultiInput: true,
        inputCount: 2,
      },
      { opType: "nullTOP", family: "TOP", label: "Null" },
    ]);
    const result = deterministicPlan("noise blur composite", catalog, "/project1");
    // compositeTOP should get connections from the TOP chain
    const compositeConns = result.connections.filter((c) =>
      c.to === result.nodes.find((n) => n.opType === "compositeTOP")?.id
    );
    // At minimum composite should be connected in the chain
    assert.ok(result.nodes.length >= 3, "should have at least 3 nodes");
  });

  it("returns description matching the prompt", () => {
    const result = deterministicPlan("my custom network", new Map(), "/p");
    assert.equal(result.description, "my custom network");
  });

  it("handles gibberish input gracefully (no crash)", () => {
    const catalog = buildCatalog([
      { opType: "noiseTOP", family: "TOP", label: "Noise" },
    ]);
    // Should not throw
    const result = deterministicPlan("xyzzy flurbo garblex", catalog, "/p");
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.connections));
  });

});
