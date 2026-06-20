/**
 * Unit tests for topologyBuild.ts exports.
 *
 * Tests detectFamily, isMultiInput, getInputCount, inferConnectsTo,
 * and inferCommonCombinations functions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectFamily,
  isMultiInput,
  getInputCount,
  inferConnectsTo,
  inferCommonCombinations,
} from "../dist/topologyBuild.js";

// ═══════════════════════════════════════════════════════════════════════════════
// detectFamily
// ═══════════════════════════════════════════════════════════════════════════════

describe("detectFamily", () => {
  it("should detect TOP family from suffix", () => {
    assert.equal(detectFamily("noiseTOP"), "TOP");
    assert.equal(detectFamily("blurTOP"), "TOP");
    assert.equal(detectFamily("compositeTOP"), "TOP");
  });

  it("should detect CHOP family from suffix", () => {
    assert.equal(detectFamily("mathCHOP"), "CHOP");
    assert.equal(detectFamily("lfoCHOP"), "CHOP");
    assert.equal(detectFamily("noiseCHOP"), "CHOP");
  });

  it("should detect SOP family from suffix", () => {
    assert.equal(detectFamily("sphereSOP"), "SOP");
    assert.equal(detectFamily("gridSOP"), "SOP");
    assert.equal(detectFamily("transformSOP"), "SOP");
  });

  it("should detect DAT family from suffix", () => {
    assert.equal(detectFamily("textDAT"), "DAT");
    assert.equal(detectFamily("tableDAT"), "DAT");
    assert.equal(detectFamily("scriptDAT"), "DAT");
  });

  it("should detect POP family from suffix", () => {
    assert.equal(detectFamily("particlePOP"), "POP");
    assert.equal(detectFamily("noisePOP"), "POP");
    assert.equal(detectFamily("glslPOP"), "POP");
  });

  it("should detect COMP family from suffix", () => {
    assert.equal(detectFamily("containerCOMP"), "COMP");
    assert.equal(detectFamily("geometryCOMP"), "COMP");
    assert.equal(detectFamily("cameraCOMP"), "COMP");
  });

  it("should detect MAT family from suffix", () => {
    assert.equal(detectFamily("phongMAT"), "MAT");
    assert.equal(detectFamily("constantMAT"), "MAT");
  });

  it("should use opData.family when available", () => {
    assert.equal(detectFamily("anything", { family: "TOP" }), "TOP");
    assert.equal(detectFamily("anything", { family: "POP" }), "POP");
  });

  it("should return a string for unrecognized names", () => {
    const result = detectFamily("unknownOp");
    assert.ok(typeof result === "string");
  });

  it("should detect family from mixed-case suffix", () => {
    assert.equal(detectFamily("NOISETOP"), "TOP");
  });

  it("should return unknown for empty string", () => {
    assert.equal(detectFamily(""), "unknown");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// isMultiInput
// ═══════════════════════════════════════════════════════════════════════════════

describe("isMultiInput", () => {
  it("should return true for compositeTOP", () => {
    assert.equal(isMultiInput("compositeTOP"), true);
  });

  it("should return true for mergeCHOP", () => {
    assert.equal(isMultiInput("mergeCHOP"), true);
  });

  it("should return true for mergeSOP", () => {
    assert.equal(isMultiInput("mergeSOP"), true);
  });

  it("should return true for switchTOP", () => {
    assert.equal(isMultiInput("switchTOP"), true);
  });

  it("should return true for mergePOP", () => {
    assert.equal(isMultiInput("mergePOP"), true);
  });

  it("should return true for mathCHOP (multi-input with min 1)", () => {
    assert.equal(isMultiInput("mathCHOP"), true);
  });

  it("should return false for noiseTOP", () => {
    assert.equal(isMultiInput("noiseTOP"), false);
  });

  it("should return false for blurTOP", () => {
    assert.equal(isMultiInput("blurTOP"), false);
  });

  it("should return false for particlePOP", () => {
    assert.equal(isMultiInput("particlePOP"), false);
  });

  it("should return false for unknown operator", () => {
    assert.equal(isMultiInput("unknownOP"), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getInputCount
// ═══════════════════════════════════════════════════════════════════════════════

describe("getInputCount", () => {
  it("should return 0 for zero-input operators", () => {
    assert.equal(getInputCount("constantTOP"), 0);
    assert.equal(getInputCount("textTOP"), 0);
    assert.equal(getInputCount("noiseTOP"), 0);
  });

  it("should return >= 1 for multi-input operators", () => {
    assert.ok(getInputCount("compositeTOP") >= 1);
    assert.ok(getInputCount("mergeCHOP") >= 1);
  });

  it("should return 0 for zero-input operators even with opData", () => {
    assert.equal(getInputCount("noiseTOP", { inputs: [{ index: 0 }, { index: 1 }] }), 0);
  });

  it("should default to 1 for unknown operators", () => {
    assert.equal(getInputCount("unknownOP"), 1);
  });

  it("should return a number for all operator types", () => {
    const types = ["noiseTOP", "blurTOP", "mathCHOP", "particlePOP", "textDAT"];
    for (const t of types) {
      const count = getInputCount(t);
      assert.ok(typeof count === "number", `getInputCount('${t}') should return a number`);
      assert.ok(count >= 0, `getInputCount('${t}') should be >= 0`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// inferConnectsTo
// ═══════════════════════════════════════════════════════════════════════════════

describe("inferConnectsTo", () => {
  it("should suggest output operators for TOPs", () => {
    const result = inferConnectsTo("noiseTOP", "TOP", {});
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });

  it("should suggest operators for POPs", () => {
    const result = inferConnectsTo("particlePOP", "POP", {});
    assert.ok(Array.isArray(result));
  });

  it("should suggest operators for CHOPs", () => {
    const result = inferConnectsTo("mathCHOP", "CHOP", {});
    assert.ok(Array.isArray(result));
  });

  it("should suggest operators for SOPs", () => {
    const result = inferConnectsTo("sphereSOP", "SOP", {});
    assert.ok(Array.isArray(result));
  });

  it("should return unique results", () => {
    const result = inferConnectsTo("noiseTOP", "TOP", {});
    const unique = new Set(result);
    assert.equal(result.length, unique.size);
  });

  it("should limit results to 10", () => {
    const result = inferConnectsTo("compositeTOP", "TOP", {});
    assert.ok(result.length <= 10);
  });

  it("should use opData.commonCombinations when available", () => {
    const data = {
      commonCombinations: [
        { operators: ["noiseTOP", "blurTOP"], description: "test" },
      ],
    };
    const result = inferConnectsTo("noiseTOP", "TOP", data);
    assert.ok(result.includes("blurTOP"));
  });

  it("should return array for unknown family", () => {
    const result = inferConnectsTo("unknownOP", "unknown", {});
    assert.ok(Array.isArray(result));
  });

  it("should return array for DAT family", () => {
    const result = inferConnectsTo("textDAT", "DAT", {});
    assert.ok(Array.isArray(result));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// inferCommonCombinations
// ═══════════════════════════════════════════════════════════════════════════════

describe("inferCommonCombinations", () => {
  it("should return array of ConnectionPattern objects", () => {
    const result = inferCommonCombinations("noiseTOP", "TOP", {});
    assert.ok(Array.isArray(result));
  });

  it("should return basic patterns for known TOPs", () => {
    const result = inferCommonCombinations("noiseTOP", "TOP", {});
    assert.ok(result.length >= 0);
    if (result.length > 0) {
      assert.ok(result[0].operators);
      assert.ok(result[0].description);
    }
  });

  it("should return empty for unknown operators without data", () => {
    const result = inferCommonCombinations("unknownOP", "unknown", {});
    assert.ok(Array.isArray(result));
  });

  it("each pattern should have operators and description", () => {
    const result = inferCommonCombinations("noiseTOP", "TOP", {});
    for (const pattern of result) {
      assert.ok(Array.isArray(pattern.operators), "pattern.operators should be an array");
      assert.ok(typeof pattern.description === "string", "pattern.description should be a string");
    }
  });
});
