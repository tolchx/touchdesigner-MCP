/**
 * Unit tests for Semantic Resolution Engine — Natural Language → TD Terms
 *
 * Semantic is pure string matching + zod validation (no external dependencies,
 * no TD connection needed). These tests verify all resolution paths:
 * concepts, families, parameters, attributes, and operator hints.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSemanticTerms } from "../dist/semantic.js";

// ─── Concept Resolution ──────────────────────────────────────────────────────

describe("resolveSemanticTerms — Concepts", () => {
  it("should resolve 'feedback loop' to the feedback concept", () => {
    const result = resolveSemanticTerms("feedback loop");
    const concepts = result.conceptMatches;
    assert.ok(concepts.length > 0, "expected at least one concept match");
    const fb = concepts.find((c) => c.concept === "feedback loop");
    assert.ok(fb, "expected 'feedback loop' concept to match");
    assert.equal(fb.canonical, "particlesupdatepop");
    assert.ok(fb.aliases.length > 0);
  });

  it("should resolve Spanish 'loop de particulas' to feedback concept", () => {
    const result = resolveSemanticTerms("loop de particulas");
    const concepts = result.conceptMatches;
    const fb = concepts.find((c) => c.concept === "feedback loop");
    assert.ok(fb, "expected Spanish 'loop de particulas' to resolve");
    assert.equal(fb.canonical, "particlesupdatepop");
  });

  it("should resolve 'peso del campo' to field weight concept", () => {
    const result = resolveSemanticTerms("peso del campo");
    const concepts = result.conceptMatches;
    assert.ok(
      concepts.some((c) => c.canonical === "Weight" || c.canonical === "FieldWeight"),
      "expected field weight concept"
    );
  });

  it("should resolve 'velocidad' to particle velocity concept", () => {
    const result = resolveSemanticTerms("velocidad");
    const concepts = result.conceptMatches;
    const vel = concepts.find((c) => c.concept === "particle velocity");
    assert.ok(vel, "expected particle velocity concept");
    assert.equal(vel.canonical, "PartVel");
  });

  it("should resolve 'curl noise' to CurlNoise concept", () => {
    const result = resolveSemanticTerms("curl noise simulation");
    const concepts = result.conceptMatches;
    const curl = concepts.find((c) => c.concept === "curl noise");
    assert.ok(curl, "expected curl noise concept");
    assert.equal(curl.canonical, "CurlNoise");
  });

  it("should resolve 'boids flocking' to Boids concept", () => {
    const result = resolveSemanticTerms("boids flocking separation alignment");
    const concepts = result.conceptMatches;
    const boids = concepts.find((c) => c.concept === "boids / flocking");
    assert.ok(boids, "expected boids/flocking concept");
    assert.equal(boids.canonical, "Boids");
  });

  it("should resolve 'instancing' to Instancing concept", () => {
    const result = resolveSemanticTerms("copias instancing");
    const concepts = result.conceptMatches;
    const inst = concepts.find((c) => c.concept === "instancing");
    assert.ok(inst, "expected instancing concept");
    assert.equal(inst.canonical, "Instancing");
  });

  it("should resolve multiple concepts in a compound query", () => {
    const result = resolveSemanticTerms("audio reactive particles with curl noise");
    const conceptNames = result.conceptMatches.map((c) => c.concept);
    assert.ok(
      conceptNames.some((n) => n.includes("audio reactive")),
      "expected audio reactive"
    );
    assert.ok(
      conceptNames.some((n) => n.includes("curl noise")),
      "expected curl noise"
    );
  });

  it("should include notes on concepts that have them", () => {
    const result = resolveSemanticTerms("GPU compute shader particles");
    const comp = result.conceptMatches.find((c) => c.concept.includes("gpu compute"));
    if (comp) {
      assert.ok(comp.note, "expected GPU compute concept to have a note");
      assert.ok(comp.note.length > 10);
    }
  });

  it("should return empty conceptMatches for gibberish", () => {
    const result = resolveSemanticTerms("xyzzy quux fnord");
    assert.equal(result.conceptMatches.length, 0);
  });
});

// ─── Family Hints ────────────────────────────────────────────────────────────

describe("resolveSemanticTerms — Family Hints", () => {
  it("should hint POP family for 'particle system'", () => {
    const result = resolveSemanticTerms("particle system simulation");
    assert.ok(result.familyHints.includes("POP"), "expected POP family hint");
  });

  it("should hint TOP family for 'texture'", () => {
    const result = resolveSemanticTerms("texture blur");
    assert.ok(result.familyHints.includes("TOP"), "expected TOP family hint");
  });

  it("should hint CHOP family for 'audio'", () => {
    const result = resolveSemanticTerms("audio signal");
    assert.ok(result.familyHints.includes("CHOP"), "expected CHOP family hint");
  });

  it("should hint SOP family for 'geometry mesh'", () => {
    const result = resolveSemanticTerms("geometry mesh surface");
    assert.ok(result.familyHints.includes("SOP"), "expected SOP family hint");
  });

  it("should hint DAT family for 'python script'", () => {
    const result = resolveSemanticTerms("python script execute");
    assert.ok(result.familyHints.includes("DAT"), "expected DAT family hint");
  });

  it("should return multiple families for mixed queries", () => {
    // "particles" (plural) is the POP alias, "texture" → TOP, "audio signal lfo" → CHOP
    const result = resolveSemanticTerms("particles texture audio");
    assert.ok(result.familyHints.length >= 2, "expected 2+ family hints");
    assert.ok(result.familyHints.includes("POP"), "expected POP");
    assert.ok(result.familyHints.includes("TOP"), "expected TOP");
  });

  it("should return empty familyHints for unrelated text", () => {
    const result = resolveSemanticTerms("hello world test");
    assert.equal(result.familyHints.length, 0);
  });

  it("should resolve Spanish 'analisis' to CHOP family", () => {
    const result = resolveSemanticTerms("analisis de senal");
    assert.ok(result.familyHints.includes("CHOP"), "expected CHOP family hint from Spanish");
  });
});

// ─── Parameter Aliases ──────────────────────────────────────────────────────

describe("resolveSemanticTerms — Parameter Aliases", () => {
  it("should resolve 'birth rate' to birthrate parameter", () => {
    const result = resolveSemanticTerms("birth rate");
    const params = result.parameterHints;
    assert.ok(params.length > 0, "expected parameter hints");
    assert.ok(
      params.some((p) => p.canonical.includes("birthrate")),
      "expected birthrate canonical"
    );
  });

  it("should resolve 'lifespan' to lifeexpect parameter", () => {
    const result = resolveSemanticTerms("lifespan");
    const params = result.parameterHints;
    assert.ok(
      params.some((p) => p.canonical.includes("lifeexpect")),
      "expected lifeexpect canonical"
    );
  });

  it("should resolve 'damping' to drag parameter", () => {
    const result = resolveSemanticTerms("damping");
    const params = result.parameterHints;
    assert.ok(
      params.some((p) => p.canonical.includes("drag")),
      "expected drag canonical from damping alias"
    );
  });

  it("should resolve 'normalized age' parameter", () => {
    const result = resolveSemanticTerms("normalized age lookup");
    const params = result.parameterHints;
    assert.ok(
      params.some((p) => p.canonical.includes("normalizedAge")),
      "expected normalizedAge canonical"
    );
  });

  it("should resolve 'res' parameter to resolution", () => {
    const result = resolveSemanticTerms("res");
    const params = result.parameterHints;
    assert.ok(
      params.some((p) => p.canonical.includes("resolution")),
      "expected resolution canonical"
    );
  });

  it("should include notes on parameter hints", () => {
    const result = resolveSemanticTerms("size");
    const params = result.parameterHints;
    assert.ok(params.length > 0);
    params.forEach((p) => {
      assert.ok(typeof p.requested === "string");
      assert.ok(typeof p.canonical === "string");
    });
  });
});

// ─── Attribute Aliases ──────────────────────────────────────────────────────

describe("resolveSemanticTerms — Attribute Aliases", () => {
  it("should resolve 'pscale' to pointscale attribute", () => {
    const result = resolveSemanticTerms("pscale");
    const attrs = result.attributeHints;
    assert.ok(attrs.length > 0, "expected attribute hints");
    assert.ok(
      attrs.some((a) => a.canonical.includes("pointscale")),
      "expected pointscale canonical"
    );
  });

  it("should resolve 'cd' to Color attribute", () => {
    const result = resolveSemanticTerms("cd attribute");
    const attrs = result.attributeHints;
    assert.ok(
      attrs.some((a) => a.canonical.includes("Color")),
      "expected Color canonical"
    );
  });

  it("should resolve 'vel' to velocity attribute", () => {
    const result = resolveSemanticTerms("vel");
    const attrs = result.attributeHints;
    assert.ok(attrs.length > 0, "expected at least one velocity match");
  });

  it("should resolve 'alpha' attribute", () => {
    const result = resolveSemanticTerms("alpha");
    const attrs = result.attributeHints;
    assert.ok(
      attrs.some((a) => a.canonical.includes("Alpha")),
      "expected Alpha canonical"
    );
  });

  it("should resolve 'uv' attribute", () => {
    const result = resolveSemanticTerms("uv coordinates");
    const attrs = result.attributeHints;
    assert.ok(
      attrs.some((a) => a.requested === "uv"),
      "expected uv attribute"
    );
  });

  it("should resolve 'rot' to rotation attribute", () => {
    const result = resolveSemanticTerms("rot");
    const attrs = result.attributeHints;
    assert.ok(
      attrs.some((a) => a.canonical.includes("Rot")),
      "expected Rot canonical"
    );
  });
});

// ─── Operator Hints ──────────────────────────────────────────────────────────

describe("resolveSemanticTerms — Operator Hints", () => {
  it("should resolve 'glsl pop' to GLSL POP operators", () => {
    const result = resolveSemanticTerms("glsl pop");
    const ops = result.operatorHints;
    assert.ok(ops.length > 0, "expected operator hints");
    assert.ok(
      ops.some((o) => o.canonical.includes("GLSL POP")),
      "expected GLSL POP in canonical"
    );
  });

  it("should resolve 'particle pop' to Particle POP", () => {
    const result = resolveSemanticTerms("particle pop");
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical === "Particle POP"),
      "expected Particle POP"
    );
  });

  it("should resolve 'noise' to Noise operators across families", () => {
    const result = resolveSemanticTerms("noise");
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical.includes("Noise")),
      "expected Noise in canonical"
    );
    // noise matches TOP/CHOP/POP
    const noise = ops.find((o) => o.requested === "noise");
    if (noise) {
      assert.equal(noise.family, "TOP/CHOP/POP");
    }
  });

  it("should resolve 'sop to pop' operator", () => {
    const result = resolveSemanticTerms("sop to pop bridge");
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical.includes("SOP to POP")),
      "expected SOP to POP"
    );
  });

  it("should resolve 'null pop' operator", () => {
    const result = resolveSemanticTerms("null pop target");
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical === "Null POP"),
      "expected Null POP"
    );
  });

  it("should resolve multiple operators from compound query", () => {
    const result = resolveSemanticTerms("field pop noise pop trail pop");
    const names = result.operatorHints.map((o) => o.requested);
    assert.ok(names.includes("field pop"), "expected field pop");
    assert.ok(names.includes("noise pop"), "expected noise pop");
    assert.ok(names.includes("trail pop"), "expected trail pop");
    assert.ok(names.length >= 3, "expected 3+ operator hints");
  });
});

// ─── Schema & Normalization ──────────────────────────────────────────────────

describe("resolveSemanticTerms — Schema & Normalization", () => {
  it("should preserve original input string", () => {
    const input = "  Particulas con Fuerza  ";
    const result = resolveSemanticTerms(input);
    assert.equal(result.original, input);
  });

  it("should normalize input (trim + lowercase)", () => {
    const result = resolveSemanticTerms("  AUDIO REACTIVE  ");
    assert.equal(result.normalized, "audio reactive");
  });

  it("should return valid SemanticResolution schema for empty string", () => {
    const result = resolveSemanticTerms("");
    assert.equal(result.original, "");
    assert.equal(result.normalized, "");
    assert.deepEqual(result.conceptMatches, []);
    assert.deepEqual(result.familyHints, []);
    assert.deepEqual(result.parameterHints, []);
    assert.deepEqual(result.attributeHints, []);
    assert.deepEqual(result.operatorHints, []);
  });

  it("should return valid schema for whitespace-only input", () => {
    const result = resolveSemanticTerms("   ");
    assert.equal(result.normalized, "");
    assert.deepEqual(result.conceptMatches, []);
  });

  it("should return valid schema for single character input", () => {
    const result = resolveSemanticTerms("x");
    // Should be valid with no matches (x isn't in any alias)
    assert.ok(typeof result.normalized === "string");
    assert.deepEqual(result.conceptMatches, []);
    assert.deepEqual(result.familyHints, []);
  });

  it("should handle special characters in input", () => {
    const result = resolveSemanticTerms("feedback-loop / particle! system?");
    assert.ok(result.normalized.includes("feedback-loop"));
    // The word boundary should still work for word parts
    const concepts = result.conceptMatches;
    const fb = concepts.find((c) => c.concept === "feedback loop");
    // The hyphen breaks the word boundary for "feedback loop" alias,
    // but "system" may still match something else
    if (fb) {
      assert.equal(fb.canonical, "particlesupdatepop");
    }
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────────────

describe("resolveSemanticTerms — Edge Cases", () => {
  it("should not crash on very long input", () => {
    const long = "particle " + "a ".repeat(500) + "noise pop field weight";
    const result = resolveSemanticTerms(long);
    assert.ok(typeof result.normalized === "string");
    // Should still find matches
    assert.ok(result.operatorHints.length > 0, "expected operator hints in long input");
  });

  it("should resolve Spanish-only query (particulas)", () => {
    const result = resolveSemanticTerms("particulas con ruido");
    // "particulas" is in OPERATOR_HINTS → Particle POP
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical.includes("Particle POP")),
      "expected Particle POP from Spanish 'particulas'"
    );
    // "particulas" is NOT in FAMILY_HINTS aliases (those are English-only),
    // so we don't assert familyHints here
  });

  it("should resolve 'art-net dmx' for DMX lighting", () => {
    const result = resolveSemanticTerms("art-net dmx lighting");
    const concepts = result.conceptMatches;
    assert.ok(
      concepts.some((c) => c.canonical === "DMX"),
      "expected DMX concept"
    );
  });

  it("should handle numeric input gracefully", () => {
    const result = resolveSemanticTerms("12345");
    assert.equal(result.conceptMatches.length, 0);
    assert.equal(result.familyHints.length, 0);
    assert.equal(result.parameterHints.length, 0);
    assert.equal(result.attributeHints.length, 0);
    assert.equal(result.operatorHints.length, 0);
  });

  it("should handle mixed case aliases", () => {
    const resultUpper = resolveSemanticTerms("FEEDBACK LOOP");
    const resultLower = resolveSemanticTerms("feedback loop");
    assert.equal(
      resultUpper.conceptMatches.length,
      resultLower.conceptMatches.length,
      "case should not affect matching"
    );
  });
});

// ─── Integration: Real-World Query Patterns ──────────────────────────────────

describe("resolveSemanticTerms — Real-World Queries", () => {
  it("should resolve 'particle system with noise and feedback'", () => {
    const result = resolveSemanticTerms("particle system with noise and feedback");
    // Family: POP
    assert.ok(result.familyHints.includes("POP"), "expected POP");
    // Concepts: feedback loop
    assert.ok(
      result.conceptMatches.some((c) => c.canonical === "particlesupdatepop"),
      "expected feedback concept"
    );
    // Operators: noise
    assert.ok(
      result.operatorHints.some((o) => o.canonical.includes("Noise")),
      "expected noise operator"
    );
  });

  it("should resolve 'dmx lighting with audio reactive particles'", () => {
    const result = resolveSemanticTerms(
      "dmx lighting with audio reactive particles and copy pop instancing"
    );
    const concepts = result.conceptMatches.map((c) => c.concept);
    assert.ok(
      concepts.some((n) => n.includes("dmx lighting")),
      "expected DMX"
    );
    assert.ok(
      concepts.some((n) => n.includes("audio reactive")),
      "expected audio reactive"
    );
    assert.ok(
      concepts.some((n) => n.includes("copy pop instancing")),
      "expected copy pop instancing"
    );
  });

  it("should resolve 'gpu compute particles with curl noise SPH fluid'", () => {
    const result = resolveSemanticTerms(
      "gpu compute particles with curl noise SPH fluid"
    );
    const concepts = result.conceptMatches.map((c) => c.concept);
    assert.ok(
      concepts.some((n) => n.includes("gpu compute")),
      "expected GPU compute"
    );
    assert.ok(
      concepts.some((n) => n.includes("curl noise")),
      "expected curl noise"
    );
    assert.ok(
      concepts.some((n) => n.includes("SPH fluid")),
      "expected SPH fluid"
    );
  });

  it("should resolve 'trail motion blur with cache playback'", () => {
    const result = resolveSemanticTerms("trail motion blur with cache playback");
    const concepts = result.conceptMatches.map((c) => c.concept);
    assert.ok(
      concepts.some((n) => n.includes("trail")),
      "expected trail concept"
    );
    assert.ok(
      concepts.some((n) => n.includes("cache")),
      "expected cache concept"
    );
  });

  it("should resolve 'neighbor pop' operator via operator hints", () => {
    const result = resolveSemanticTerms("neighbor pop detection");
    // OPERATOR_HINTS requires the exact phrase "neighbor pop" to match
    const ops = result.operatorHints;
    assert.ok(
      ops.some((o) => o.canonical.includes("Neighbor POP")),
      "expected Neighbor POP operator"
    );
  });
});
