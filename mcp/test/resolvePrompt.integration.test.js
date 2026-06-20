/**
 * Integration tests for resolvePrompt — combines template matching + semantic resolution
 *
 * resolvePrompt is the main entry point for the MCP server. It combines:
 *   1. resolveOperatorType (TYPE_SYNONYMS) → best operator type
 *   2. resolveAllOperatorTypes → ranked operator types
 *   3. getBestFamily (FAMILY_HINTS) → best family
 *   4. getAllFamilies → ranked families
 *   5. searchTemplates → matching network templates
 *
 * These tests verify that all 5 components work together correctly.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolvePrompt } from "../dist/networkTemplates.js";

// ─── Basic resolvePrompt ───────────────────────────────────────────────────

describe("resolvePrompt — basic integration", () => {
  it("should return all required fields", () => {
    const result = resolvePrompt("noise");
    assert.equal(typeof result.prompt, "string");
    assert.equal(typeof result.operatorType, "string");
    assert.ok(Array.isArray(result.allOperatorTypes));
    assert.equal(typeof result.family, "string");
    assert.ok(Array.isArray(result.allFamilies));
    assert.ok(Array.isArray(result.matchingTemplates));
  });

  it("should preserve the original prompt", () => {
    const result = resolvePrompt("add a blur effect to my noise");
    assert.equal(result.prompt, "add a blur effect to my noise");
  });

  it("should resolve operatorType from TYPE_SYNONYMS", () => {
    const result = resolvePrompt("noise texture");
    assert.equal(result.operatorType, "noiseTOP");
  });

  it("should resolve family from FAMILY_HINTS", () => {
    const result = resolvePrompt("particle system");
    assert.equal(result.family, "POP");
  });

  it("should return matching templates when prompt matches a tag", () => {
    const result = resolvePrompt("feedback");
    assert.ok(
      result.matchingTemplates.length >= 1,
      "expected at least 1 matching template for 'feedback'"
    );
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("generative-art-feedback"),
      "expected generative-art-feedback template"
    );
  });

  it("should return empty matchingTemplates for unrelated prompt", () => {
    const result = resolvePrompt("xyzzy quux fnord");
    assert.equal(result.matchingTemplates.length, 0);
  });
});

// ─── Template + Semantic Combination ────────────────────────────────────────

describe("resolvePrompt — template + semantic combination", () => {
  it("should match 'glsl shader' to glslTOP and find glsl-shader-pipeline template", () => {
    const result = resolvePrompt("glsl shader");
    assert.equal(result.operatorType, "glslTOP");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("glsl-shader-pipeline"),
      "expected glsl-shader-pipeline template"
    );
  });

  it("should match 'particle' to particlePOP AND find particle-system-basic template", () => {
    const result = resolvePrompt("particle");
    assert.equal(result.operatorType, "particlePOP");
    assert.equal(result.family, "POP");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("particle-system-basic"),
      "expected particle-system-basic template"
    );
  });

  it("should match 'audio spectrum' to audiospectrumCHOP with CHOP family", () => {
    const result = resolvePrompt("audio spectrum");
    assert.equal(result.operatorType, "audiospectrumCHOP");
    assert.equal(result.family, "CHOP");
  });

  it("should match 'blur' to blurTOP and find glow-bloom template (blur is a tag)", () => {
    const result = resolvePrompt("blur");
    assert.equal(result.operatorType, "blurTOP");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("glow-bloom"),
      "expected glow-bloom template (has 'blur' tag)"
    );
  });

  it("should match 'composite' to compositeTOP and find templates with 'composite' tag", () => {
    const result = resolvePrompt("composite");
    assert.equal(result.operatorType, "compositeTOP");
    assert.ok(
      result.matchingTemplates.length >= 1,
      "expected ≥1 template with 'composite' tag"
    );
  });

  it("should match 'kaleidoscope' to kaleidoscopeTOP AND find kaleidoscope template", () => {
    const result = resolvePrompt("kaleidoscope");
    assert.equal(result.operatorType, "kaleidoscopeTOP");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("kaleidoscope"),
      "expected kaleidoscope template"
    );
  });

  it("should match 'chroma key green screen' to chromakeyTOP with TOP family", () => {
    const result = resolvePrompt("chroma key green screen");
    assert.equal(result.operatorType, "chromakeyTOP");
    assert.equal(result.family, "TOP");
  });

  it("should match 'edge detect sobel' to edgeTOP with TOP family", () => {
    const result = resolvePrompt("edge detect sobel");
    assert.equal(result.operatorType, "edgeTOP");
    assert.equal(result.family, "TOP");
  });

  it("should match 'generative art noise feedback' to noiseTOP operator type", () => {
    const result = resolvePrompt("generative art noise feedback");
    assert.equal(result.operatorType, "noiseTOP");
  });

  it("should match 'lfo oscillator signal' to lfoCHOP with CHOP family", () => {
    const result = resolvePrompt("lfo oscillator signal");
    assert.equal(result.operatorType, "lfoCHOP");
    assert.equal(result.family, "CHOP");
  });

  it("should match 'trail pop trails streak' to trailPOP with POP family", () => {
    const result = resolvePrompt("trail pop trails streak");
    assert.equal(result.operatorType, "trailPOP");
    assert.equal(result.family, "POP");
  });
});

// ─── Ranking & Multi-Result Integration ─────────────────────────────────────

describe("resolvePrompt — ranking integration", () => {
  it("should rank allOperatorTypes by score descending", () => {
    const result = resolvePrompt("noise blur composite");
    const scores = result.allOperatorTypes.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(
        scores[i - 1] >= scores[i],
        `scores should descend: ${scores[i - 1]} >= ${scores[i]}`
      );
    }
  });

  it("should rank allFamilies by score descending", () => {
    const result = resolvePrompt("particles texture audio");
    const scores = result.allFamilies.map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      assert.ok(
        scores[i - 1] >= scores[i],
        `family scores should descend: ${scores[i - 1]} >= ${scores[i]}`
      );
    }
  });

  it("should find multiple operator types for 'noise'", () => {
    const result = resolvePrompt("noise blur composite");
    const opTypes = result.allOperatorTypes.map((r) => r.opType);
    assert.ok(opTypes.includes("noiseTOP"), "expected noiseTOP");
    assert.ok(opTypes.includes("blurTOP"), "expected blurTOP");
    assert.ok(result.allOperatorTypes.length >= 2, `expected ≥2 results, got ${result.allOperatorTypes.length}`);
  });

  it("should find multiple families for 'particles texture audio'", () => {
    const result = resolvePrompt("particles texture audio");
    const families = result.allFamilies.map((r) => r.family);
    assert.ok(families.includes("POP"), "expected POP");
    assert.ok(families.includes("TOP"), "expected TOP");
    assert.ok(families.includes("CHOP"), "expected CHOP");
  });

  it("should return empty allOperatorTypes for gibberish", () => {
    const result = resolvePrompt("xyzzy quux");
    assert.equal(result.allOperatorTypes.length, 0);
  });

  it("should return 'unknown' family for gibberish", () => {
    const result = resolvePrompt("xyzzy quux");
    assert.equal(result.family, "unknown");
    assert.equal(result.allFamilies.length, 0);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────

describe("resolvePrompt — edge cases", () => {
  it("should handle empty string", () => {
    const result = resolvePrompt("");
    assert.equal(result.prompt, "");
    assert.equal(result.operatorType, "");
    assert.equal(result.allOperatorTypes.length, 0);
    assert.equal(result.family, "unknown");
    assert.equal(result.allFamilies.length, 0);
    // Empty query returns all templates
    assert.ok(result.matchingTemplates.length >= 1);
  });

  it("should handle whitespace-only string", () => {
    const result = resolvePrompt("   ");
    assert.equal(result.operatorType, "");
    assert.equal(result.family, "unknown");
  });

  it("should be case-insensitive", () => {
    const lower = resolvePrompt("noise");
    const upper = resolvePrompt("NOISE");
    assert.equal(lower.operatorType, upper.operatorType);
    assert.equal(lower.family, upper.family);
    assert.equal(
      lower.matchingTemplates.length,
      upper.matchingTemplates.length
    );
  });

  it("should handle very long prompt", () => {
    const long = "particle ".repeat(100) + "noise pop field weight";
    const result = resolvePrompt(long);
    assert.equal(typeof result.operatorType, "string");
    assert.ok(typeof result.family === "string");
    assert.ok(Array.isArray(result.matchingTemplates));
  });

  it("should handle special characters in prompt", () => {
    const result = resolvePrompt("noise & blur!");
    assert.equal(result.operatorType, "noiseTOP");
  });

  it("should handle unicode characters gracefully", () => {
    const result = resolvePrompt("partículas con ruido");
    assert.equal(typeof result.operatorType, "string");
    assert.ok(Array.isArray(result.matchingTemplates));
  });
});

// ─── Template Search Integration ────────────────────────────────────────────

describe("resolvePrompt — template search integration", () => {
  it("should find templates by name match", () => {
    const result = resolvePrompt("generative-art-feedback");
    assert.ok(
      result.matchingTemplates.some((t) => t.name === "generative-art-feedback")
    );
  });

  it("should find templates by tag exact match (score 100)", () => {
    const result = resolvePrompt("feedback");
    assert.ok(result.matchingTemplates.length >= 1);
    // First result should be the one with exact tag match
    assert.ok(
      result.matchingTemplates[0].tags.some((t) => t === "feedback"),
      "first result should have exact 'feedback' tag"
    );
  });

  it("should rank template results by relevance", () => {
    const result = resolvePrompt("glsl");
    // Templates with 'glsl' in tags should rank higher
    assert.ok(result.matchingTemplates.length >= 1);
    const topTags = result.matchingTemplates[0].tags;
    assert.ok(
      topTags.some((t) => t.includes("glsl")),
      "top result should have 'glsl' in tags"
    );
  });

  it("should find particle-system-basic for 'particle' query", () => {
    const result = resolvePrompt("particle");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(
      names.includes("particle-system-basic"),
      "expected particle-system-basic template"
    );
  });

  it("should find kaleidoscope template for 'kaleidoscope' query", () => {
    const result = resolvePrompt("kaleidoscope");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(names.includes("kaleidoscope"));
  });

  it("should find chroma-key-composite for 'chromakey' query", () => {
    const result = resolvePrompt("chromakey");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(names.includes("chroma-key-composite"));
  });

  it("should find edge-detect for 'edge detection' query", () => {
    const result = resolvePrompt("edge detection");
    const names = result.matchingTemplates.map((t) => t.name);
    assert.ok(names.includes("edge-detect"));
  });

  it("should return empty templates for 'xyznonexistent'", () => {
    const result = resolvePrompt("xyznonexistent");
    assert.equal(result.matchingTemplates.length, 0);
  });

  it("matchingTemplates should include valid template structure", () => {
    const result = resolvePrompt("feedback");
    assert.ok(result.matchingTemplates.length >= 1);
    for (const t of result.matchingTemplates) {
      assert.ok(t.name, "template should have name");
      assert.ok(t.description, "template should have description");
      assert.ok(Array.isArray(t.tags), "template should have tags");
      assert.ok(
        ["simple", "medium", "advanced"].includes(t.complexity),
        "template should have valid complexity"
      );
      assert.ok(Array.isArray(t.operators), "template should have operators");
      assert.ok(
        Array.isArray(t.connections),
        "template should have connections"
      );
      assert.ok(
        Array.isArray(t.parameters),
        "template should have parameters"
      );
      assert.ok(t.pythonBuilder, "template should have pythonBuilder");
    }
  });
});

// ─── Real-World Integration Scenarios ───────────────────────────────────────

describe("resolvePrompt — real-world scenarios", () => {
  it("should resolve 'create a particle system with noise and trails'", () => {
    const result = resolvePrompt("create a particle system with noise and trails");
    assert.equal(result.operatorType, "particlePOP");
    assert.equal(result.family, "POP");
  });

  it("should resolve 'audio reactive visualizer with spectrum'", () => {
    const result = resolvePrompt("audio reactive visualizer with spectrum");
    assert.equal(result.operatorType, "audiospectrumCHOP");
    assert.equal(result.family, "CHOP");
  });

  it("should resolve 'feedback loop generative art'", () => {
    const result = resolvePrompt("feedback loop generative art");
    assert.equal(result.operatorType, "feedbackTOP");
  });

  it("should resolve 'green screen chroma key composite'", () => {
    const result = resolvePrompt("green screen chroma key composite");
    assert.equal(result.operatorType, "chromakeyTOP");
    assert.equal(result.family, "TOP");
  });

  it("should resolve 'glsl shader with time and noise inputs'", () => {
    const result = resolvePrompt("glsl shader with time and noise inputs");
    assert.equal(result.operatorType, "glslTOP");
  });

  it("should resolve 'bloom glow post-processing'", () => {
    const result = resolvePrompt("bloom glow post-processing");
    assert.equal(result.family, "TOP");
  });

  it("should resolve 'table spreadsheet data'", () => {
    const result = resolvePrompt("table spreadsheet data");
    assert.equal(result.operatorType, "tableDAT");
    assert.equal(result.family, "DAT");
  });

  it("should resolve 'sphere SOP geometry'", () => {
    const result = resolvePrompt("sphere sop geometry");
    assert.equal(result.operatorType, "sphereSOP");
    assert.equal(result.family, "SOP");
  });

  it("should resolve 'camera light 3d scene'", () => {
    const result = resolvePrompt("camera light 3d scene");
    assert.equal(result.family, "COMP");
  });

  it("should resolve 'material phong shader lighting'", () => {
    const result = resolvePrompt("material phong shader lighting");
    assert.equal(result.family, "MAT");
  });
});
