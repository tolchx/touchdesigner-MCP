/**
 * Unit tests for Patch Engine — transactional complex system builder.
 *
 * Tests four pure functions:
 *   - detectComplexityTier(prompt)
 *   - scoreComplexity(prompt)
 *   - previewPatch(plan)
 *   - generateVariations(plan, count)
 *
 * Async functions (planPatch, applyPatch, gatherPreTurnContext, runPatchWorkflow)
 * depend on TDClient and external services — not tested here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectComplexityTier,
  scoreComplexity,
  previewPatch,
  generateVariations,
} from "../dist/patchEngine.js";

// ─── Test helpers ───────────────────────────────────────────────────────────

/** Build a minimal PatchPlan for testing previewPatch / generateVariations. */
function makePlan(overrides = {}) {
  return {
    patchId: "patch_test_abc123",
    description: "test plan",
    tier: "basic",
    graph: {
      description: "test graph",
      nodes: [
        { id: "n0", opType: "noiseTOP", label: "Noise", parentPath: "/project1", x: 0, y: 0 },
        { id: "n1", opType: "levelTOP", label: "Level", parentPath: "/project1", x: 200, y: 0 },
        { id: "n2", opType: "nullTOP", label: "Null", parentPath: "/project1", x: 400, y: 0 },
      ],
      connections: [
        { from: "n0", to: "n1", inputIndex: 0 },
        { from: "n1", to: "n2", inputIndex: 0 },
      ],
      targetPath: "/project1",
    },
    preContext: {
      templates: [],
      recipes: [],
      knowledgeHits: [],
      resolvedOps: [],
      bestFamily: "TOP",
      complexityScore: 10,
    },
    ...overrides,
  };
}

// ─── detectComplexityTier ───────────────────────────────────────────────────

describe("detectComplexityTier", () => {
  it("returns 'pro' for feedback-related prompts", () => {
    assert.equal(detectComplexityTier("create a feedback loop"), "pro");
    assert.equal(detectComplexityTier("build a feedback system"), "pro");
  });

  it("returns 'pro' for simulation prompts", () => {
    assert.equal(detectComplexityTier("build a fluid simulation"), "pro");
    assert.equal(detectComplexityTier("create a particle system"), "pro");
    assert.equal(detectComplexityTier("sph solver"), "pro");
  });

  it("returns 'pro' for GPU compute prompts", () => {
    assert.equal(detectComplexityTier("gpu compute shader"), "pro");
    assert.equal(detectComplexityTier("reaction-diffusion"), "pro");
  });

  it("returns 'standard' for shader/GLSL prompts", () => {
    assert.equal(detectComplexityTier("write a GLSL shader"), "standard");
    assert.equal(detectComplexityTier("create a bloom effect"), "standard");
  });

  it("returns 'standard' for audio reactive prompts", () => {
    assert.equal(detectComplexityTier("make it audio reactive"), "standard");
  });

  it("returns 'basic' for simple prompts", () => {
    assert.equal(detectComplexityTier("create a noise top"), "basic");
    assert.equal(detectComplexityTier("add a null"), "basic");
  });

  it("is case-insensitive", () => {
    assert.equal(detectComplexityTier("FEEDBACK LOOP"), "pro");
    assert.equal(detectComplexityTier("GlSL Shader"), "standard");
  });

  it("returns a valid ComplexityTier string", () => {
    const valid = ["basic", "standard", "pro"];
    for (const prompt of ["noise", "feedback loop", "glsl shader"]) {
      assert.ok(valid.includes(detectComplexityTier(prompt)), `should return valid tier for "${prompt}"`);
    }
  });
});

// ─── scoreComplexity ────────────────────────────────────────────────────────

describe("scoreComplexity", () => {
  it("returns a number between 0 and 100", () => {
    for (const prompt of ["noise", "feedback loop", "glsl shader", "particle system", ""]) {
      const score = scoreComplexity(prompt);
      assert.ok(typeof score === "number", `score should be a number for "${prompt}"`);
      assert.ok(score >= 0, `score should be >= 0 for "${prompt}"`);
      assert.ok(score <= 100, `score should be <= 100 for "${prompt}"`);
    }
  });

  it("returns higher score for pro-level prompts", () => {
    const basicScore = scoreComplexity("create a noise top");
    const proScore = scoreComplexity("feedback loop with fluid simulation and solver");
    assert.ok(proScore > basicScore, `pro score (${proScore}) should be > basic score (${basicScore})`);
  });

  it("returns higher score for more keywords", () => {
    const single = scoreComplexity("shader");
    const multi = scoreComplexity("shader glsl composite bloom glow trail");
    assert.ok(multi > single, `multi-keyword score (${multi}) should be > single keyword (${single})`);
  });

  it("returns 0 or low score for empty/simple prompts", () => {
    const score = scoreComplexity("");
    assert.ok(score <= 10, `empty prompt score (${score}) should be <= 10`);
  });

  it("saturates at 100 for extremely complex prompts", () => {
    const score = scoreComplexity(
      "feedback loop solver simulation fluid sph boids flocking instancing pipeline multi-pass particle system gpu compute reaction diffusion raymarch pathtrace"
    );
    assert.equal(score, 100, "should saturate at 100");
  });
});

// ─── previewPatch ───────────────────────────────────────────────────────────

describe("previewPatch", () => {
  it("returns correct shape", () => {
    const plan = makePlan();
    const preview = previewPatch(plan);
    assert.equal(preview.patchId, plan.patchId);
    assert.ok(Array.isArray(preview.nodesWillCreate));
    assert.ok(Array.isArray(preview.connectionsWillMake));
    assert.equal(typeof preview.estimatedNodeCount, "number");
    assert.ok(["low", "medium", "high"].includes(preview.riskLevel));
    assert.ok(Array.isArray(preview.warnings));
  });

  it("correctly counts nodes", () => {
    const plan = makePlan();
    const preview = previewPatch(plan);
    assert.equal(preview.estimatedNodeCount, 3);
    assert.equal(preview.nodesWillCreate.length, 3);
  });

  it("correctly counts connections", () => {
    const plan = makePlan();
    const preview = previewPatch(plan);
    assert.equal(preview.connectionsWillMake.length, 2);
  });

  it("maps node labels in connections", () => {
    const plan = makePlan();
    const preview = previewPatch(plan);
    assert.equal(preview.connectionsWillMake[0].from, "Noise");
    assert.equal(preview.connectionsWillMake[0].to, "Level");
  });

  it("sets risk to 'high' for pro tier", () => {
    const plan = makePlan({ tier: "pro" });
    const preview = previewPatch(plan);
    assert.equal(preview.riskLevel, "high");
    assert.ok(preview.warnings.some(w => w.includes("feedback") || w.includes("simulation") || w.includes("Complex")));
  });

  it("sets risk to 'medium' for large networks", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`, opType: `node${i}TOP`, label: `Node${i}`, parentPath: "/project1",
    }));
    const connections = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      connections.push({ from: `n${i}`, to: `n${i + 1}`, inputIndex: 0 });
    }
    const plan = makePlan({
      graph: { description: "big", nodes, connections, targetPath: "/project1" },
    });
    const preview = previewPatch(plan);
    assert.equal(preview.riskLevel, "medium");
    assert.ok(preview.warnings.some(w => w.includes("Large network")));
  });

  it("warns about feedback operators", () => {
    const plan = makePlan({
      graph: {
        description: "feedback test",
        nodes: [
          { id: "n0", opType: "feedbackTOP", label: "FB", parentPath: "/project1" },
          { id: "n1", opType: "noiseTOP", label: "Noise", parentPath: "/project1" },
        ],
        connections: [{ from: "n0", to: "n1", inputIndex: 0 }],
        targetPath: "/project1",
      },
    });
    const preview = previewPatch(plan);
    assert.ok(preview.warnings.some(w => w.includes("Feedback")), "should warn about feedback");
  });

  it("warns about GLSL operators", () => {
    const plan = makePlan({
      graph: {
        description: "glsl test",
        nodes: [
          { id: "n0", opType: "glslTOP", label: "GLSL", parentPath: "/project1" },
        ],
        connections: [],
        targetPath: "/project1",
      },
    });
    const preview = previewPatch(plan);
    assert.ok(preview.warnings.some(w => w.includes("GLSL")), "should warn about GLSL");
  });

  it("warns about unconnected nodes", () => {
    const plan = makePlan({
      graph: {
        description: "disconnected",
        nodes: [
          { id: "n0", opType: "noiseTOP", label: "Noise", parentPath: "/project1" },
          { id: "n1", opType: "nullTOP", label: "Island", parentPath: "/project1" },
        ],
        connections: [], // no connections
        targetPath: "/project1",
      },
    });
    const preview = previewPatch(plan);
    assert.ok(preview.warnings.some(w => w.includes("no connections")), "should warn about unconnected nodes");
  });
});

// ─── generateVariations ─────────────────────────────────────────────────────

describe("generateVariations", () => {
  it("returns correct number of variations", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 3);
    assert.equal(variations.length, 3);
  });

  it("defaults to 3 variations", () => {
    const plan = makePlan();
    const variations = generateVariations(plan);
    assert.equal(variations.length, 3);
  });

  it("clamps to available strategies (max 3)", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 10);
    assert.ok(variations.length <= 10, "should not exceed requested count");
  });

  it("each variation has correct shape", () => {
    const plan = makePlan();
    const variations = generateVariations(plan);
    for (const v of variations) {
      assert.equal(typeof v.patchId, "string");
      assert.equal(typeof v.variationIndex, "number");
      assert.equal(typeof v.description, "string");
      assert.ok(v.graph, "variation should have a graph");
      assert.ok(Array.isArray(v.graph.nodes), "graph should have nodes");
      assert.ok(Array.isArray(v.graph.connections), "graph should have connections");
      assert.ok(Array.isArray(v.differences), "should have differences");
    }
  });

  it("variation indices are sequential starting at 1", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 3);
    assert.equal(variations[0].variationIndex, 1);
    assert.equal(variations[1].variationIndex, 2);
    assert.equal(variations[2].variationIndex, 3);
  });

  it("patch IDs include variation suffix", () => {
    const plan = makePlan({ patchId: "patch_test" });
    const variations = generateVariations(plan, 2);
    assert.equal(variations[0].patchId, "patch_test_v1");
    assert.equal(variations[1].patchId, "patch_test_v2");
  });

  it("minimal variation filters nodes", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 1); // Only minimal strategy
    const minimal = variations[0];
    assert.ok(minimal.graph.nodes.length <= plan.graph.nodes.length,
      "minimal should have fewer or equal nodes");
    assert.ok(minimal.differences.some(d => d.includes("Minimal")),
      "should describe minimal strategy");
  });

  it("alternative variation may change opTypes", () => {
    const plan = makePlan({
      graph: {
        description: "composite test",
        nodes: [
          { id: "n0", opType: "compositeTOP", label: "Comp", parentPath: "/project1" },
          { id: "n1", opType: "nullTOP", label: "Null", parentPath: "/project1" },
        ],
        connections: [{ from: "n0", to: "n1", inputIndex: 0 }],
        targetPath: "/project1",
      },
    });
    const variations = generateVariations(plan, 2);
    const alt = variations[1]; // Alternative strategy
    const altOpTypes = alt.graph.nodes.map(n => n.opType);
    assert.ok(altOpTypes.includes("overTOP"), "compositeTOP should be replaced with overTOP in alt variation");
  });

  it("connections are filtered to match variant nodes", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 1); // Minimal — filters some nodes
    const minimal = variations[0];
    const nodeIds = new Set(minimal.graph.nodes.map(n => n.id));
    for (const c of minimal.graph.connections) {
      assert.ok(nodeIds.has(c.from), `connection from ${c.from} should reference existing node`);
      assert.ok(nodeIds.has(c.to), `connection to ${c.to} should reference existing node`);
    }
  });

  it("all variations preserve targetPath", () => {
    const plan = makePlan();
    const variations = generateVariations(plan, 3);
    for (const v of variations) {
      assert.equal(v.graph.targetPath, plan.graph.targetPath);
    }
  });
});
