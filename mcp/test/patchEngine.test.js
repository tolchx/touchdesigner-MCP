/**
 * Unit tests for Patch Engine (patchEngine.ts) — Pure Functions
 *
 * TDD characterization suite for the four exported pure functions:
 *   - detectComplexityTier(prompt)  → "basic" | "standard" | "pro"
 *   - scoreComplexity(prompt)       → number (0-100)
 *   - previewPatch(plan)            → PatchPreview
 *   - generateVariations(plan,count)→ PatchVariation[]
 *
 * detectComplexityTier & scoreComplexity call resolvePrompt() from
 * networkTemplates internally (better-sqlite3 is lazy-loaded, so the import
 * chain resolves cleanly without the optional native dependency).
 * previewPatch & generateVariations are 100% pure — no module calls.
 *
 * Run:  node --experimental-vm-modules mcp/test/patchEngine.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectComplexityTier,
  scoreComplexity,
  previewPatch,
  generateVariations,
} from "../dist/patchEngine.js";

// ─── Test fixtures ──────────────────────────────────────────────────────────
function makeNode(id, opType, label, extra = {}) {
  return { id, opType, label, parentPath: "/project1", x: 0, y: 0, ...extra };
}
function makeConn(from, to, inputIndex = 0) {
  return { from, to, inputIndex };
}
function makePlan({
  tier = "basic",
  nodes = [],
  connections = [],
  patchId = "test-patch",
  description = "a test plan",
} = {}) {
  return {
    patchId,
    description,
    tier,
    graph: { nodes, connections, targetPath: "/project1" },
    preContext: {},
  };
}

// ════════════════════════════════════════════════════════════════════════════
// detectComplexityTier
// ════════════════════════════════════════════════════════════════════════════
describe("detectComplexityTier", () => {
  it("returns a string tier", () => {
    assert.equal(typeof detectComplexityTier("feedback"), "string");
  });

  // ── Pro triggers ──
  it("detects 'feedback' as pro", () => {
    assert.equal(detectComplexityTier("feedback"), "pro");
  });
  it("detects 'feedback loop' as pro", () => {
    assert.equal(detectComplexityTier("feedback loop"), "pro");
  });
  it("detects 'solver' as pro", () => {
    assert.equal(detectComplexityTier("solver"), "pro");
  });
  it("detects 'particle system' as pro", () => {
    assert.equal(detectComplexityTier("particle system"), "pro");
  });
  it("detects 'particles' (plural) as pro", () => {
    assert.equal(detectComplexityTier("particles"), "pro");
  });
  it("detects 'boids' as pro", () => {
    assert.equal(detectComplexityTier("boids"), "pro");
  });
  it("detects 'flocking' as pro", () => {
    assert.equal(detectComplexityTier("flocking"), "pro");
  });
  it("detects 'gpu compute' as pro", () => {
    assert.equal(detectComplexityTier("gpu compute"), "pro");
  });
  it("detects 'fluid' as pro", () => {
    assert.equal(detectComplexityTier("fluid"), "pro");
  });
  it("detects 'instancing' as pro", () => {
    assert.equal(detectComplexityTier("instancing"), "pro");
  });
  it("detects 'reaction-diffusion' as pro", () => {
    assert.equal(detectComplexityTier("reaction-diffusion"), "pro");
  });
  it("detects 'raymarch' as pro", () => {
    assert.equal(detectComplexityTier("raymarch"), "pro");
  });
  it("detects 'pathtrace' as pro", () => {
    assert.equal(detectComplexityTier("pathtrace"), "pro");
  });
  it("detects 'sph' as pro", () => {
    assert.equal(detectComplexityTier("sph"), "pro");
  });
  it("detects 'multi-pass' as pro", () => {
    assert.equal(detectComplexityTier("multi-pass"), "pro");
  });
  it("detects 'pipeline' as pro", () => {
    assert.equal(detectComplexityTier("pipeline"), "pro");
  });

  // ── Standard triggers ──
  it("detects 'glsl' as standard", () => {
    assert.equal(detectComplexityTier("glsl"), "standard");
  });
  it("detects 'shader' as standard", () => {
    assert.equal(detectComplexityTier("shader"), "standard");
  });
  it("detects 'bloom' as standard", () => {
    assert.equal(detectComplexityTier("bloom"), "standard");
  });
  it("detects 'composite' as standard", () => {
    assert.equal(detectComplexityTier("composite"), "standard");
  });
  it("detects 'blend' as standard", () => {
    assert.equal(detectComplexityTier("blend"), "standard");
  });
  it("detects 'audio reactive' as standard", () => {
    assert.equal(detectComplexityTier("audio reactive"), "standard");
  });
  it("detects 'kaleidoscope' as standard", () => {
    assert.equal(detectComplexityTier("kaleidoscope"), "standard");
  });
  it("detects 'chroma' as standard", () => {
    assert.equal(detectComplexityTier("chroma"), "standard");
  });
  it("detects 'edge detect' as standard", () => {
    assert.equal(detectComplexityTier("edge detect"), "standard");
  });

  // ── Basic fallback ──
  it("classifies a simple operator prompt as basic", () => {
    assert.equal(detectComplexityTier("create a noise TOP"), "basic");
  });
  it("classifies a no-keyword, no-operator prompt as basic", () => {
    assert.equal(detectComplexityTier("hello world"), "basic");
  });
  it("classifies empty string as basic", () => {
    assert.equal(detectComplexityTier(""), "basic");
  });
  it("classifies unrecognized gibberish as basic", () => {
    assert.equal(detectComplexityTier("xyzzxzy"), "basic");
  });

  // ── Case insensitivity ──
  it("is case-insensitive for pro keywords (FEEDBACK)", () => {
    assert.equal(detectComplexityTier("FEEDBACK"), "pro");
  });
  it("is case-insensitive for pro keywords (Boids)", () => {
    assert.equal(detectComplexityTier("Boids"), "pro");
  });
  it("is case-insensitive for standard keywords (GLSL)", () => {
    assert.equal(detectComplexityTier("GLSL"), "standard");
  });

  // ── Precedence / edge cases ──
  it("prefers pro when both pro and standard keywords are present", () => {
    assert.equal(detectComplexityTier("a glsl feedback system"), "pro");
  });
  it("treats bare 'particle' (not 'particles'/'particle system') as basic", () => {
    // 'particle' alone is NOT a COMPLEXITY_TRIGGER — only resolves 1 op < 3
    assert.equal(detectComplexityTier("particle"), "basic");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// scoreComplexity
// ════════════════════════════════════════════════════════════════════════════
describe("scoreComplexity", () => {
  it("returns a number", () => {
    assert.equal(typeof scoreComplexity("feedback"), "number");
  });

  it("scores empty prompt as 0", () => {
    assert.equal(scoreComplexity(""), 0);
  });

  it("scores a single pro keyword with its operator bonus (feedback → 17)", () => {
    // 12 (pro keyword) + 5 (feedbackTOP resolved) = 17
    assert.equal(scoreComplexity("feedback"), 17);
  });

  it("scores a pro keyword that resolves no operator without op bonus (solver → 12)", () => {
    assert.equal(scoreComplexity("solver"), 12);
  });

  it("accumulates multiple pro keywords (boids flocking → 29)", () => {
    // 12 + 12 + 5 (1 op) = 29
    assert.equal(scoreComplexity("boids flocking"), 29);
  });

  it("scores a single medium keyword (audio → 6)", () => {
    assert.equal(scoreComplexity("audio"), 6);
  });

  it("accumulates multiple medium keywords (glsl shader → 17)", () => {
    // 6 + 6 + 5 (1 op) = 17
    assert.equal(scoreComplexity("glsl shader"), 17);
  });

  it("combines pro and medium keywords (feedback bloom → 23)", () => {
    // 12 (pro) + 6 (med) + 5 (1 op) = 23
    assert.equal(scoreComplexity("feedback bloom"), 23);
  });

  it("combines pro and medium keywords with multiple operators (boids shader → 28)", () => {
    // 12 (pro) + 6 (med) + 10 (2 ops) = 28
    assert.equal(scoreComplexity("boids shader"), 28);
  });

  it("adds operator-count bonus even with no keywords (noise → 5)", () => {
    assert.equal(scoreComplexity("noise"), 5);
  });

  it("accumulates medium keywords across multiple ops (displace transform → 22)", () => {
    // 6 + 6 + 10 (2 ops) = 22
    assert.equal(scoreComplexity("displace transform"), 22);
  });

  it("scores two medium keywords resolving no operator (edge chroma → 12)", () => {
    assert.equal(scoreComplexity("edge chroma"), 12);
  });

  it("caps the score at 100 for a prompt loaded with pro keywords", () => {
    const big =
      "feedback loop solver simulation gpu compute reaction diffusion " +
      "raymarch pathtrace fluid sph boids flocking instancing pipeline " +
      "multi-pass particle";
    assert.equal(scoreComplexity(big), 100);
  });

  it("never returns a negative score", () => {
    assert.ok(scoreComplexity("") >= 0);
    assert.ok(scoreComplexity("nothing here") >= 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// previewPatch
// ════════════════════════════════════════════════════════════════════════════
describe("previewPatch", () => {
  // ── Risk levels by tier ──
  it("flags pro tier as high risk with a feedback/simulation warning", () => {
    const plan = makePlan({
      tier: "pro",
      nodes: [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")],
      connections: [makeConn("a", "b")],
    });
    const preview = previewPatch(plan);
    assert.equal(preview.riskLevel, "high");
    assert.ok(
      preview.warnings.some((w) => w.includes("feedback/simulation")),
      "should warn about feedback/simulation"
    );
  });

  it("flags standard tier as medium risk", () => {
    const plan = makePlan({
      tier: "standard",
      nodes: [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")],
      connections: [makeConn("a", "b")],
    });
    assert.equal(previewPatch(plan).riskLevel, "medium");
  });

  it("flags basic tier (small connected graph) as low risk with no warnings", () => {
    const plan = makePlan({
      tier: "basic",
      nodes: [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")],
      connections: [makeConn("a", "b")],
    });
    const preview = previewPatch(plan);
    assert.equal(preview.riskLevel, "low");
    assert.equal(preview.warnings.length, 0);
  });

  // ── Large network ──
  it("flags >8 nodes as medium risk with a large-network warning", () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      makeNode("n" + i, "noiseTOP", "N" + i)
    );
    const conns = Array.from({ length: 8 }, (_, i) => makeConn("n" + i, "n" + i + 1));
    const preview = previewPatch(makePlan({ tier: "basic", nodes, connections: conns }));
    assert.equal(preview.riskLevel, "medium");
    assert.ok(
      preview.warnings.some((w) => w.includes("Large network")),
      "should warn about large network"
    );
    assert.ok(
      preview.warnings.some((w) => w.includes("9 nodes")),
      "warning should mention the node count"
    );
  });

  it("pro tier beats the >8-nodes large-network rule (no large-network warning)", () => {
    const nodes = Array.from({ length: 9 }, (_, i) =>
      makeNode("n" + i, "noiseTOP", "N" + i)
    );
    const conns = Array.from({ length: 8 }, (_, i) => makeConn("n" + i, "n" + i + 1));
    const preview = previewPatch(makePlan({ tier: "pro", nodes, connections: conns }));
    assert.equal(preview.riskLevel, "high");
    assert.ok(
      !preview.warnings.some((w) => w.includes("Large network")),
      "pro tier should suppress the large-network warning"
    );
  });

  // ── Risky opType patterns ──
  it("warns about feedback nodes (opType contains 'feedback')", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "feedbackTOP", "FB"), makeNode("b", "nullTOP", "Out")],
        connections: [makeConn("a", "b")],
      })
    );
    assert.ok(
      preview.warnings.some((w) => w.includes("'top' parameter")),
      "should warn about feedback 'top' parameter"
    );
  });

  it("warns about particle nodes (opType contains 'particle')", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "particlePOP", "PT"), makeNode("b", "nullTOP", "Out")],
        connections: [makeConn("a", "b")],
      })
    );
    assert.ok(
      preview.warnings.some((w) => w.includes("Particle POP")),
      "should warn about Particle POP"
    );
  });

  it("warns about glsl nodes (opType contains 'glsl')", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "glslTOP", "GS"), makeNode("b", "nullTOP", "Out")],
        connections: [makeConn("a", "b")],
      })
    );
    assert.ok(
      preview.warnings.some((w) => w.includes("GLSL")),
      "should warn about GLSL uniforms"
    );
  });

  it("emits all three warnings when feedback, particle and glsl nodes coexist", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [
          makeNode("a", "feedbackTOP", "FB"),
          makeNode("b", "particlePOP", "PT"),
          makeNode("c", "glslTOP", "GS"),
        ],
        connections: [makeConn("a", "b"), makeConn("b", "c")],
      })
    );
    assert.equal(preview.warnings.length, 3);
  });

  // ── Unconnected nodes ──
  it("warns listing unconnected nodes by their label", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [
          makeNode("a", "noiseTOP", "A"),
          makeNode("b", "blurTOP", "B"),
          makeNode("z", "nullTOP", "Lonely"),
        ],
        connections: [makeConn("a", "b")],
      })
    );
    const unconn = preview.warnings.find((w) => w.includes("no connections"));
    assert.ok(unconn, "should warn about unconnected nodes");
    assert.ok(unconn.includes("Lonely"), "warning should name the lonely node");
  });

  it("does not warn about unconnected nodes when all nodes are wired", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")],
        connections: [makeConn("a", "b")],
      })
    );
    assert.ok(
      !preview.warnings.some((w) => w.includes("no connections")),
      "should not warn when everything is connected"
    );
  });

  // ── Output shape ──
  it("maps nodesWillCreate to {opType,label,parent}", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")],
        connections: [makeConn("a", "b")],
      })
    );
    assert.equal(preview.nodesWillCreate.length, 2);
    assert.deepEqual(preview.nodesWillCreate[0], {
      opType: "noiseTOP",
      label: "A",
      parent: "/project1",
    });
  });

  it("maps connectionsWillMake from/to to node labels", () => {
    const preview = previewPatch(
      makePlan({
        tier: "basic",
        nodes: [makeNode("a", "noiseTOP", "Noise"), makeNode("b", "blurTOP", "Blur")],
        connections: [makeConn("a", "b", 0)],
      })
    );
    assert.deepEqual(preview.connectionsWillMake, [
      { from: "Noise", to: "Blur", inputIndex: 0 },
    ]);
  });

  it("reports estimatedNodeCount equal to the number of nodes", () => {
    const nodes = [makeNode("a", "noiseTOP", "A"), makeNode("b", "blurTOP", "B")];
    const preview = previewPatch(makePlan({ tier: "basic", nodes, connections: [makeConn("a", "b")] }));
    assert.equal(preview.estimatedNodeCount, 2);
  });

  it("echoes the plan patchId in the preview", () => {
    const preview = previewPatch(
      makePlan({
        patchId: "patch-xyz-123",
        tier: "basic",
        nodes: [makeNode("a", "noiseTOP", "A")],
        connections: [],
      })
    );
    assert.equal(preview.patchId, "patch-xyz-123");
  });

  it("does not crash on an empty graph and reports 0 nodes", () => {
    const preview = previewPatch(makePlan({ tier: "basic", nodes: [], connections: [] }));
    assert.equal(preview.estimatedNodeCount, 0);
    assert.equal(preview.nodesWillCreate.length, 0);
    assert.equal(preview.connectionsWillMake.length, 0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// generateVariations
// ════════════════════════════════════════════════════════════════════════════
describe("generateVariations", () => {
  const fourNodePlan = makePlan({
    tier: "basic",
    nodes: [
      makeNode("n0", "compositeTOP", "Comp"),
      makeNode("n1", "blurTOP", "Blur"),
      makeNode("n2", "levelTOP", "Level"),
      makeNode("n3", "nullTOP", "Out"),
    ],
    connections: [makeConn("n0", "n1"), makeConn("n1", "n2"), makeConn("n2", "n3")],
  });

  // ── Count behaviour ──
  it("returns 3 variations by default", () => {
    assert.equal(generateVariations(fourNodePlan).length, 3);
  });

  it("returns the requested count when count <= number of strategies", () => {
    assert.equal(generateVariations(fourNodePlan, 1).length, 1);
    assert.equal(generateVariations(fourNodePlan, 2).length, 2);
    assert.equal(generateVariations(fourNodePlan, 3).length, 3);
  });

  it("caps the count at the number of available strategies (count=5 → 3)", () => {
    assert.equal(generateVariations(fourNodePlan, 5).length, 3);
  });

  it("returns an empty array when count is 0", () => {
    assert.deepEqual(generateVariations(fourNodePlan, 0), []);
  });

  // ── Variation shape ──
  it("gives each variation a patchId, variationIndex, description, graph and differences", () => {
    const variations = generateVariations(fourNodePlan, 3);
    for (const v of variations) {
      assert.ok(typeof v.patchId === "string" && v.patchId.length > 0, "patchId present");
      assert.equal(typeof v.variationIndex, "number");
      assert.ok(typeof v.description === "string");
      assert.ok(v.graph && Array.isArray(v.graph.nodes), "graph.nodes present");
      assert.ok(Array.isArray(v.differences), "differences present");
    }
  });

  it("formats variation patchIds as `${patchId}_v${index}`", () => {
    const variations = generateVariations(fourNodePlan, 3);
    assert.equal(variations[0].patchId, "test-patch_v1");
    assert.equal(variations[1].patchId, "test-patch_v2");
    assert.equal(variations[2].patchId, "test-patch_v3");
    assert.equal(variations[0].variationIndex, 1);
    assert.equal(variations[2].variationIndex, 3);
  });

  // ── Minimal strategy ──
  it("Minimal strategy keeps even-indexed nodes plus the last node", () => {
    const minimal = generateVariations(fourNodePlan, 1)[0];
    // indices 0,2 even + index 3 (last) ; index 1 dropped
    assert.deepEqual(
      minimal.graph.nodes.map((n) => n.id),
      ["n0", "n2", "n3"]
    );
    assert.equal(minimal.description, "Simplest possible version with fewer nodes");
  });

  it("Minimal strategy reports reduced node count in differences", () => {
    const minimal = generateVariations(fourNodePlan, 1)[0];
    assert.ok(minimal.differences.some((d) => d.includes("Strategy: Minimal")));
    assert.ok(minimal.differences.some((d) => d.includes("3 nodes (vs 4 original)")));
  });

  it("Minimal strategy keeps only connections between surviving nodes", () => {
    const minimal = generateVariations(fourNodePlan, 1)[0];
    // surviving ids: n0,n2,n3. Original conns n0→n1, n1→n2, n2→n3.
    // Only n2→n3 survives (both endpoints kept).
    for (const c of minimal.graph.connections) {
      assert.ok(minimal.graph.nodes.some((n) => n.id === c.from), "from node kept");
      assert.ok(minimal.graph.nodes.some((n) => n.id === c.to), "to node kept");
    }
    assert.equal(minimal.graph.connections.length, 1);
  });

  // ── Alternative operators strategy ──
  it("Alternative operators strategy swaps known opTypes (compositeTOP→overTOP)", () => {
    const alt = generateVariations(fourNodePlan, 2)[1];
    const byId = Object.fromEntries(alt.graph.nodes.map((n) => [n.id, n]));
    assert.equal(byId.n0.opType, "overTOP");
    assert.equal(byId.n0.label, "Alt_Comp");
    assert.equal(byId.n2.opType, "lookupTOP");
    // node with no known alternative (nullTOP) is left untouched, no Alt_ prefix
    assert.equal(byId.n3.opType, "nullTOP");
    assert.equal(byId.n3.label, "Out");
  });

  // ── Third strategy: "Parallel chains" (splits nodes into A/B chains) ──
  it("Parallel chains strategy appends _A/_B suffixes to node labels", () => {
    const plan = makePlan({
      tier: "basic",
      nodes: [
        makeNode("n0", "noiseTOP", "Noise", { parameters: { freq: 1 } }),
        makeNode("n1", "blurTOP", "Blur"),
        makeNode("n2", "levelTOP", "Level"),
      ],
      connections: [makeConn("n0", "n1"), makeConn("n1", "n2")],
    });
    const third = generateVariations(plan, 3)[2];
    assert.ok(third, "third variation should exist");
    assert.equal(third.description, "Split into parallel processing chains");
    // even index → _A, odd index → _B ; only labels change, opTypes are untouched
    assert.equal(third.graph.nodes[0].label, "Noise_A");
    assert.equal(third.graph.nodes[1].label, "Blur_B");
    assert.equal(third.graph.nodes[2].label, "Level_A");
    assert.equal(third.graph.nodes[0].opType, "noiseTOP");
    // parameters are preserved, not mutated
    assert.deepEqual(third.graph.nodes[0].parameters, { freq: 1 });
  });

  // ── Edge cases ──
  it("handles an empty node list without crashing", () => {
    const variations = generateVariations(makePlan({ tier: "basic", nodes: [], connections: [] }), 3);
    assert.equal(variations.length, 3);
    assert.equal(variations[0].graph.nodes.length, 0);
    assert.ok(variations[0].differences.some((d) => d.includes("0 nodes (vs 0 original)")));
  });

  it("keeps the last node in Minimal even for a single-node plan", () => {
    const plan = makePlan({
      tier: "basic",
      nodes: [makeNode("only", "noiseTOP", "Only")],
      connections: [],
    });
    const minimal = generateVariations(plan, 1)[0];
    assert.equal(minimal.graph.nodes.length, 1);
    assert.equal(minimal.graph.nodes[0].id, "only");
  });
});
