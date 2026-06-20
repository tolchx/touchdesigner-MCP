/**
 * Unit tests for Semantic Resolution Functions — resolveOperatorType, getBestFamily, etc.
 *
 * These functions were moved from networkTemplates.ts into semantic.ts as part
 * of Fix #6 (consolidate NL→TD resolution). They use TYPE_SYNONYMS and
 * FAMILY_HINTS with scoring to resolve natural-language prompts to TD operators/families.
 *
 * Tests use node:test + node:assert/strict (same as semantic.test.js).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOperatorType,
  resolveAllOperatorTypes,
  getBestFamily,
  getAllFamilies,
  TYPE_SYNONYMS,
  FAMILY_HINTS,
} from "../dist/semantic.js";

// ─── resolveOperatorType ───────────────────────────────────────────────────

describe("resolveOperatorType — single best match", () => {
  it("should resolve 'blur' to blurTOP", () => {
    const result = resolveOperatorType("add a blur effect");
    assert.equal(result, "blurTOP");
  });

  it("should resolve 'noise' to noiseTOP", () => {
    const result = resolveOperatorType("create noise texture");
    assert.equal(result, "noiseTOP");
  });

  it("should resolve 'particle system' to particlePOP", () => {
    const result = resolveOperatorType("particle system with trails");
    assert.equal(result, "particlePOP");
  });

  it("should resolve 'audio spectrum' to audiospectrumCHOP", () => {
    const result = resolveOperatorType("audio spectrum visualizer");
    assert.equal(result, "audiospectrumCHOP");
  });

  it("should resolve 'green screen' (multi-word) over single 'green'", () => {
    const result = resolveOperatorType("green screen chroma key");
    assert.equal(result, "chromakeyTOP");
  });

  it("should resolve 'feedback loop' to feedbackTOP", () => {
    const result = resolveOperatorType("create a feedback loop");
    assert.equal(result, "feedbackTOP");
  });

  it("should resolve 'kaleidoscope' to kaleidoscopeTOP", () => {
    const result = resolveOperatorType("kaleidoscope effect");
    assert.equal(result, "kaleidoscopeTOP");
  });

  it("should resolve 'edge detect' to edgeTOP", () => {
    const result = resolveOperatorType("edge detection on image");
    assert.equal(result, "edgeTOP");
  });

  it("should resolve 'sphere pop' to spherePOP", () => {
    const result = resolveOperatorType("sphere pop emitter");
    assert.equal(result, "spherePOP");
  });

  it("should resolve 'lfo' to lfoCHOP", () => {
    const result = resolveOperatorType("lfo oscillator");
    assert.equal(result, "lfoCHOP");
  });

  it("should resolve 'trail pop' to trailPOP", () => {
    const result = resolveOperatorType("trail pop trails streak");
    assert.equal(result, "trailPOP");
  });

  it("should resolve 'merge pop' to mergePOP", () => {
    const result = resolveOperatorType("merge pop combine");
    assert.equal(result, "mergePOP");
  });

  it("should return empty string for empty input", () => {
    assert.equal(resolveOperatorType(""), "");
  });

  it("should return empty string for gibberish", () => {
    assert.equal(resolveOperatorType("xyzzy quux fnord"), "");
  });

  it("should be case-insensitive", () => {
    const lower = resolveOperatorType("blur effect");
    const upper = resolveOperatorType("BLUR EFFECT");
    const mixed = resolveOperatorType("Blur Effect");
    assert.equal(lower, upper);
    assert.equal(lower, mixed);
  });

  it("should match 'glsl shader' to glslTOP", () => {
    const result = resolveOperatorType("glsl shader fragment");
    assert.equal(result, "glslTOP");
  });

  it("should resolve 'movie' to moviefileinTOP", () => {
    const result = resolveOperatorType("load movie file");
    assert.equal(result, "moviefileinTOP");
  });

  it("should resolve 'text' to textTOP", () => {
    const result = resolveOperatorType("text title overlay");
    assert.equal(result, "textTOP");
  });

  it("should resolve 'sphere' (SOP) correctly", () => {
    const result = resolveOperatorType("sphere sop geometry");
    assert.equal(result, "sphereSOP");
  });

  it("should resolve 'box pop' to boxPOP", () => {
    const result = resolveOperatorType("box pop emitter");
    assert.equal(result, "boxPOP");
  });
});

// ─── resolveAllOperatorTypes ───────────────────────────────────────────────

describe("resolveAllOperatorTypes — ranked multi-match", () => {
  it("should return multiple results for 'particle'", () => {
    const results = resolveAllOperatorTypes("particle system simulation", 10);
    assert.ok(results.length >= 1, "expected at least 1 result");
    // particlePOP should be top
    assert.equal(results[0].opType, "particlePOP");
  });

  it("should rank results by score descending", () => {
    const results = resolveAllOperatorTypes("blur smooth gaussian", 10);
    assert.ok(results.length >= 1);
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `expected score[${i - 1}] >= score[${i}]`
      );
    }
  });

  it("should respect topN parameter", () => {
    const results = resolveAllOperatorTypes("particle system simulation noise pop trail pop", 3);
    assert.ok(results.length <= 3, `expected ≤3 results, got ${results.length}`);
  });

  it("should return empty array for empty input", () => {
    assert.deepEqual(resolveAllOperatorTypes(""), []);
  });

  it("should return empty array for gibberish", () => {
    assert.deepEqual(resolveAllOperatorTypes("xyzzy"), []);
  });

  it("should find both TOP and CHOP for 'noise chop signal'", () => {
    const results = resolveAllOperatorTypes("noise chop signal", 10);
    const opTypes = results.map((r) => r.opType);
    assert.ok(opTypes.includes("noiseTOP"), "expected noiseTOP");
    assert.ok(opTypes.includes("noiseCHOP"), "expected noiseCHOP");
  });
});

// ─── getBestFamily ─────────────────────────────────────────────────────────

describe("getBestFamily — family inference with specificity", () => {
  it("should return POP for 'particle system'", () => {
    assert.equal(getBestFamily("particle system simulation"), "POP");
  });

  it("should return TOP for 'texture blur composite'", () => {
    assert.equal(getBestFamily("texture blur composite"), "TOP");
  });

  it("should return CHOP for 'audio signal lfo'", () => {
    assert.equal(getBestFamily("audio signal lfo spectrum"), "CHOP");
  });

  it("should return SOP for 'geometry mesh surface'", () => {
    assert.equal(getBestFamily("geometry mesh surface"), "SOP");
  });

  it("should return DAT for 'table script python'", () => {
    assert.equal(getBestFamily("table script python dat"), "DAT");
  });

  it("should return COMP for 'container component sub network'", () => {
    assert.equal(getBestFamily("container component sub network"), "COMP");
  });

  it("should return MAT for 'material phong shader'", () => {
    assert.equal(getBestFamily("material phong shader"), "MAT");
  });

  it("should return 'unknown' for empty input", () => {
    assert.equal(getBestFamily(""), "unknown");
  });

  it("should return 'unknown' for gibberish", () => {
    assert.equal(getBestFamily("xyzzy quux"), "unknown");
  });

  it("should prefer POP over TOP for 'pop particle'", () => {
    const result = getBestFamily("pop particle simulation");
    assert.equal(result, "POP");
  });

  it("should be case-insensitive", () => {
    const lower = getBestFamily("audio signal");
    const upper = getBestFamily("AUDIO SIGNAL");
    assert.equal(lower, upper);
  });

  it("should resolve 'feedback pop' to POP", () => {
    assert.equal(getBestFamily("feedback pop loop"), "POP");
  });

  it("should resolve 'feedback top' to TOP", () => {
    assert.equal(getBestFamily("feedback top accumulation"), "TOP");
  });

  it("should resolve 'gpu particles' to POP", () => {
    assert.equal(getBestFamily("gpu particles compute"), "POP");
  });

  it("should resolve 'glsl fragment shader top' to TOP", () => {
    assert.equal(getBestFamily("glsl top fragment shader"), "TOP");
  });
});

// ─── getAllFamilies ─────────────────────────────────────────────────────────

describe("getAllFamilies — ranked multi-family results", () => {
  it("should return multiple families for 'particles texture audio'", () => {
    const results = getAllFamilies("particles texture audio");
    assert.ok(results.length >= 2, `expected ≥2 families, got ${results.length}`);
    const families = results.map((r) => r.family);
    assert.ok(families.includes("POP"), "expected POP");
    assert.ok(families.includes("TOP"), "expected TOP");
    assert.ok(families.includes("CHOP"), "expected CHOP");
  });

  it("should rank results by score descending", () => {
    const results = getAllFamilies("particles texture audio");
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i - 1].score >= results[i].score,
        `expected score[${i - 1}] >= score[${i}]`
      );
    }
  });

  it("should include specificity field", () => {
    const results = getAllFamilies("particle system");
    assert.ok(results.length > 0);
    results.forEach((r) => {
      assert.ok(typeof r.specificity === "number", "expected specificity to be a number");
    });
  });

  it("should return empty array for empty input", () => {
    assert.deepEqual(getAllFamilies(""), []);
  });

  it("should return empty array for gibberish", () => {
    assert.deepEqual(getAllFamilies("xyzzy"), []);
  });
});

// ─── TYPE_SYNONYMS & FAMILY_HINTS data integrity ───────────────────────────

describe("TYPE_SYNONYMS — data integrity", () => {
  it("should have at least 50 operator type entries", () => {
    const count = Object.keys(TYPE_SYNONYMS).length;
    assert.ok(count >= 50, `expected ≥50 TYPE_SYNONYMS entries, got ${count}`);
  });

  it("every entry should have at least 1 alias", () => {
    for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
      assert.ok(aliases.length > 0, `${opType} should have at least 1 alias`);
    }
  });

  it("every alias should be a non-empty string", () => {
    for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
      for (const alias of aliases) {
        assert.ok(typeof alias === "string" && alias.length > 0, `${opType} has empty alias`);
      }
    }
  });

  it("should include key TOP operators", () => {
    const tops = ["noiseTOP", "blurTOP", "compositeTOP", "feedbackTOP", "glslTOP"];
    for (const t of tops) {
      assert.ok(TYPE_SYNONYMS[t], `expected ${t} in TYPE_SYNONYMS`);
    }
  });

  it("should include key POP operators", () => {
    const pops = ["particlePOP", "spherePOP", "noisePOP", "trailPOP", "renderPOP"];
    for (const p of pops) {
      assert.ok(TYPE_SYNONYMS[p], `expected ${p} in TYPE_SYNONYMS`);
    }
  });

  it("should include key CHOP operators", () => {
    const chops = ["audiofileinCHOP", "audiospectrumCHOP", "mathCHOP", "lfoCHOP"];
    for (const c of chops) {
      assert.ok(TYPE_SYNONYMS[c], `expected ${c} in TYPE_SYNONYMS`);
    }
  });
});

describe("FAMILY_HINTS — data integrity", () => {
  it("should have entries for all 7 families", () => {
    const families = FAMILY_HINTS.map((h) => h.family);
    assert.ok(families.includes("TOP"));
    assert.ok(families.includes("CHOP"));
    assert.ok(families.includes("SOP"));
    assert.ok(families.includes("DAT"));
    assert.ok(families.includes("POP"));
    assert.ok(families.includes("COMP"));
    assert.ok(families.includes("MAT"));
  });

  it("every entry should have specificity > 0", () => {
    for (const hint of FAMILY_HINTS) {
      assert.ok(hint.specificity > 0, `${hint.family} should have specificity > 0`);
    }
  });

  it("every entry should have at least 3 aliases", () => {
    for (const hint of FAMILY_HINTS) {
      assert.ok(hint.aliases.length >= 3, `${hint.family} should have ≥3 aliases, got ${hint.aliases.length}`);
    }
  });
});
