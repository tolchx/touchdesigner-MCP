/**
 * Unit tests for topologyBuild.ts — operator topology data builder.
 *
 * Tests 6 pure exported functions:
 *   - detectFamily()       — family detection from operator name
 *   - getInputCount()      — input count inference
 *   - isMultiInput()       — multi-input detection
 *   - inferConnectsTo()    — connection pattern inference
 *   - inferCommonCombinations() — common pattern inference
 *   - buildTopologyForOperator() — full topology entry building
 *
 * Pure logic, no I/O. Build first: npx tsc -p mcp/tsconfig.json
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectFamily,
  getInputCount,
  isMultiInput,
  inferConnectsTo,
  inferCommonCombinations,
  buildTopologyForOperator,
} from "../dist/topologyBuild.js";

// ═══════════════════════════════════════════════════════════════════════════
// detectFamily — family detection
// ═══════════════════════════════════════════════════════════════════════════

describe("detectFamily", () => {
  it("detects TOP for noiseTOP", () => {
    assert.strictEqual(detectFamily("noiseTOP"), "TOP");
  });

  it("detects CHOP for constantCHOP", () => {
    assert.strictEqual(detectFamily("constantCHOP"), "CHOP");
  });

  it("detects SOP for sphereSOP", () => {
    assert.strictEqual(detectFamily("sphereSOP"), "SOP");
  });

  it("detects DAT for textDAT", () => {
    assert.strictEqual(detectFamily("textDAT"), "DAT");
  });

  it("detects POP for particlePOP", () => {
    assert.strictEqual(detectFamily("particlePOP"), "POP");
  });

  it("detects COMP for containerCOMP", () => {
    assert.strictEqual(detectFamily("containerCOMP"), "COMP");
  });

  it("detects MAT for glslMAT", () => {
    assert.strictEqual(detectFamily("glslMAT"), "MAT");
  });

  it("returns unknown for unrecognized types", () => {
    assert.strictEqual(detectFamily("myCustomThing"), "unknown");
  });

  it("uses opData.family override when present", () => {
    assert.strictEqual(detectFamily("noiseTOP", { family: "CHOP" }), "CHOP");
  });

  it("is case-insensitive via .toUpperCase()", () => {
    assert.strictEqual(detectFamily("NOISETOP"), "TOP");
    assert.strictEqual(detectFamily("Constantchop"), "CHOP");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getInputCount — input count inference
// ═══════════════════════════════════════════════════════════════════════════

describe("getInputCount", () => {
  it("returns 0 for ZERO_INPUT entries (generators)", () => {
    assert.strictEqual(getInputCount("noiseTOP"), 0);
    assert.strictEqual(getInputCount("constantCHOP"), 0);
    assert.strictEqual(getInputCount("gridSOP"), 0);
    assert.strictEqual(getInputCount("textDAT"), 0);
    assert.strictEqual(getInputCount("spherePOP"), 0);
  });

  it("returns positive count for MULTI_INPUT entries (Math.abs)", () => {
    assert.strictEqual(getInputCount("compositeTOP"), 1);
    assert.strictEqual(getInputCount("mergeCHOP"), 1);
    assert.strictEqual(getInputCount("mergeSOP"), 1);
    assert.strictEqual(getInputCount("switchDAT"), 1);
    assert.strictEqual(getInputCount("mergePOP"), 1);
  });

  it("returns 1 for default single-input operators", () => {
    assert.strictEqual(getInputCount("blurTOP"), 1);
    assert.strictEqual(getInputCount("transformTOP"), 1);
    assert.strictEqual(getInputCount("nullTOP"), 1);
    assert.strictEqual(getInputCount("mathCHOP"), 1);
    assert.strictEqual(getInputCount("noiseSOP"), 1);
    assert.strictEqual(getInputCount("nullPOP"), 1);
  });

  it("uses opData.inputs when available and non-empty", () => {
    const result = getInputCount("customOp", {
      inputs: [
        { description: "Primary input" },
        { description: "Secondary input" },
      ],
    });
    assert.strictEqual(result, 2);
  });

  it("ignores opData.inputs with empty '-' descriptions", () => {
    const result = getInputCount("customOp", {
      inputs: [
        { description: "Primary input" },
        { description: "-" },
      ],
    });
    // Only 1 non-empty description, but the function uses filtered length
    // Actually it returns 1 because only 1 non-'-' input
    assert.strictEqual(result, 1);
  });

  it("returns 1 for unknown operators", () => {
    assert.strictEqual(getInputCount("someUnknownType"), 1);
  });

  it("handles empty string opType", () => {
    assert.strictEqual(getInputCount(""), 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// isMultiInput — multi-input detection
// ═══════════════════════════════════════════════════════════════════════════

describe("isMultiInput", () => {
  it("returns true for compositeTOP", () => {
    assert.strictEqual(isMultiInput("compositeTOP"), true);
  });

  it("returns true for mergeCHOP", () => {
    assert.strictEqual(isMultiInput("mergeCHOP"), true);
  });

  it("returns true for overTOP", () => {
    assert.strictEqual(isMultiInput("overTOP"), true);
  });

  it("returns true for switchTOP", () => {
    assert.strictEqual(isMultiInput("switchTOP"), true);
  });

  it("returns false for noiseTOP (not in MULTI_INPUT)", () => {
    assert.strictEqual(isMultiInput("noiseTOP"), false);
  });

  it("returns false for blurTOP", () => {
    assert.strictEqual(isMultiInput("blurTOP"), false);
  });

  it("returns false for constantCHOP", () => {
    assert.strictEqual(isMultiInput("constantCHOP"), false);
  });

  it("returns false for unknown operators", () => {
    assert.strictEqual(isMultiInput("myCustomThing"), false);
  });

  it("handles empty string", () => {
    assert.strictEqual(isMultiInput(""), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inferConnectsTo — connection pattern inference
// ═══════════════════════════════════════════════════════════════════════════

describe("inferConnectsTo — TOP family", () => {
  it("noiseTOP connects to composite, level, blur, transform, displace (no nullTOP)", () => {
    const result = inferConnectsTo("noiseTOP", "TOP");
    assert.ok(result.includes("compositeTOP"));
    assert.ok(result.includes("levelTOP"));
    assert.ok(result.includes("blurTOP"));
    assert.ok(result.includes("transformTOP"));
    assert.ok(result.includes("displaceTOP"));
    // noise branch does NOT include nullTOP
    assert.ok(!result.includes("nullTOP"));
  });

  it("blurTOP connects to composite, level, transform, null", () => {
    const result = inferConnectsTo("blurTOP", "TOP");
    assert.ok(result.includes("compositeTOP"));
    assert.ok(result.includes("levelTOP"));
    assert.ok(result.includes("transformTOP"));
    assert.ok(result.includes("nullTOP"));
  });

  it("compositeTOP connects to null, blur, transform", () => {
    const result = inferConnectsTo("compositeTOP", "TOP");
    assert.ok(result.includes("nullTOP"));
    assert.ok(result.includes("blurTOP"));
    assert.ok(result.includes("transformTOP"));
  });

  it("renderTOP connects to nullTOP and moviefileoutTOP (terminal ops)", () => {
    const result = inferConnectsTo("renderTOP", "TOP");
    assert.ok(result.includes("nullTOP"));
    assert.ok(result.includes("moviefileoutTOP"));
  });

  it("constantTOP (generator) connects to composite, level, blur, transform, displace (no nullTOP)", () => {
    const result = inferConnectsTo("constantTOP", "TOP");
    assert.ok(result.includes("compositeTOP"));
    assert.ok(result.includes("nullTOP") === false); // noise/constant branch has no nullTOP
  });

  it("glslTOP connects to null, blur, composite", () => {
    const result = inferConnectsTo("glslTOP", "TOP");
    assert.ok(result.includes("nullTOP"));
    assert.ok(result.includes("blurTOP"));
    assert.ok(result.includes("compositeTOP"));
  });

  it("nullTOP (no matching name branch) returns empty connectsTo", () => {
    const result = inferConnectsTo("nullTOP", "TOP");
    assert.strictEqual(result.length, 0);
  });
});

describe("inferConnectsTo — CHOP family", () => {
  it("audiofileinCHOP connects to audiospectrum, math, lag, null", () => {
    const result = inferConnectsTo("audiofileinCHOP", "CHOP");
    assert.ok(result.includes("audiospectrumCHOP"));
    assert.ok(result.includes("mathCHOP"));
    assert.ok(result.includes("lagCHOP"));
    assert.ok(result.includes("nullCHOP"));
  });

  it("mathCHOP connects to null, merge, choptoTOP", () => {
    const result = inferConnectsTo("mathCHOP", "CHOP");
    assert.ok(result.includes("nullCHOP"));
    assert.ok(result.includes("mergeCHOP"));
    assert.ok(result.includes("choptoTOP"));
  });

  it("mergeCHOP connects to null and choptoTOP", () => {
    const result = inferConnectsTo("mergeCHOP", "CHOP");
    assert.ok(result.includes("nullCHOP"));
    assert.ok(result.includes("choptoTOP"));
  });
});

describe("inferConnectsTo — POP family", () => {
  it("particlePOP connects to noise, force, forceRadial, turbulence, drag, color, trail, null, render, lookup", () => {
    const result = inferConnectsTo("particlePOP", "POP");
    assert.ok(result.includes("noisePOP"));
    assert.ok(result.includes("forcePOP"));
    assert.ok(result.includes("forceRadialPOP"));
    assert.ok(result.includes("turbulencePOP"));
    assert.ok(result.includes("dragPOP"));
    assert.ok(result.includes("colorPOP"));
    assert.ok(result.includes("trailPOP"));
    assert.ok(result.includes("nullPOP"));
    assert.ok(result.includes("renderPOP"));
    assert.ok(result.includes("lookupPOP"));
  });

  it("noisePOP (force/noise branch) connects to nullPOP and particlePOP", () => {
    const result = inferConnectsTo("noisePOP", "POP");
    assert.ok(result.includes("nullPOP"));
    assert.ok(result.includes("particlePOP"));
  });

  it("forcePOP connects to nullPOP and particlePOP", () => {
    const result = inferConnectsTo("forcePOP", "POP");
    assert.ok(result.includes("nullPOP"));
    assert.ok(result.includes("particlePOP"));
  });

  it("nullPOP (null/out branch) connects to particlePOP and renderPOP", () => {
    const result = inferConnectsTo("nullPOP", "POP");
    assert.ok(result.includes("particlePOP"));
    assert.ok(result.includes("renderPOP"));
  });
});

describe("inferConnectsTo — SOP family", () => {
  it("gridSOP connects to noiseSOP, transformSOP, nullSOP", () => {
    const result = inferConnectsTo("gridSOP", "SOP");
    assert.ok(result.includes("noiseSOP"));
    assert.ok(result.includes("transformSOP"));
    assert.ok(result.includes("nullSOP"));
  });

  it("sphereSOP connects to noiseSOP, transformSOP, nullSOP", () => {
    const result = inferConnectsTo("sphereSOP", "SOP");
    assert.ok(result.includes("noiseSOP"));
    assert.ok(result.includes("transformSOP"));
    assert.ok(result.includes("nullSOP"));
  });
});

describe("inferConnectsTo — edge cases", () => {
  it("unknown family returns empty array", () => {
    const result = inferConnectsTo("someOp", "Mystery");
    assert.strictEqual(result.length, 0);
  });

  it("limits results to 10 entries", () => {
    const result = inferConnectsTo("particlePOP", "POP");
    assert.ok(result.length <= 10);
  });

  it("uses opData.commonCombinations when available", () => {
    const opData = {
      commonCombinations: [
        { operators: ["nullTOP", "outTOP"], description: "Output chain" },
      ],
    };
    const result = inferConnectsTo("myCustomTOP", "TOP", opData);
    // Falls into no named branch, so only gets from commonCombinations
    assert.ok(result.includes("nullTOP"));
    assert.ok(result.includes("outTOP"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// inferCommonCombinations — common pattern inference
// ═══════════════════════════════════════════════════════════════════════════

describe("inferCommonCombinations", () => {
  it("uses opData.commonCombinations with frequency 3", () => {
    const opData = {
      commonCombinations: [
        { operators: ["noiseTOP", "blurTOP", "nullTOP"], description: "Simple blur" },
      ],
    };
    const result = inferCommonCombinations("customTOP", "TOP", [], opData);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].frequency, 3);
    assert.strictEqual(result[0].description, "Simple blur");
  });

  it("infers source→level→composite→null for noiseTOP without opData", () => {
    const result = inferCommonCombinations("noiseTOP", "TOP", []);
    assert.ok(result.length >= 1);
    assert.ok(result[0].description.includes("Source"));
    assert.ok(result[0].operators.includes("noiseTOP"));
    assert.ok(result[0].operators.includes("levelTOP"));
  });

  it("infers noise→blur→composite→null for blurTOP without opData", () => {
    const result = inferCommonCombinations("blurTOP", "TOP", []);
    assert.ok(result.length >= 1);
    assert.ok(result[0].operators.includes("noiseTOP"));
    assert.ok(result[0].operators.includes("blurTOP"));
  });

  it("infers source→level→composite→null for constantTOP", () => {
    const result = inferCommonCombinations("constantTOP", "TOP", []);
    assert.ok(result.length >= 1);
    assert.ok(result[0].operators.includes("constantTOP"));
  });

  it("infers source→level→composite→null for rampTOP", () => {
    const result = inferCommonCombinations("rampTOP", "TOP", []);
    assert.ok(result.length >= 1);
  });

  it("returns empty array for non-TOP families without opData", () => {
    const result = inferCommonCombinations("gridSOP", "SOP", []);
    assert.strictEqual(result.length, 0);
  });

  it("returns empty array for unknown opType without opData", () => {
    const result = inferCommonCombinations("someRandomTOP", "TOP", []);
    // Falls in TOP but no matching name → no patterns
    assert.strictEqual(result.length, 0);
  });

  it("prefers opData patterns over inferred ones", () => {
    const opData = {
      commonCombinations: [
        { operators: ["noiseTOP", "nullTOP"], description: "Direct output" },
      ],
    };
    const result = inferCommonCombinations("noiseTOP", "TOP", [], opData);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].description, "Direct output");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildTopologyForOperator — full topology entry builder
// ═══════════════════════════════════════════════════════════════════════════

describe("buildTopologyForOperator — TOP", () => {
  it("builds topology for noiseTOP (generator, 0 inputs)", () => {
    const result = buildTopologyForOperator("noiseTOP", { family: "TOP" });
    assert.strictEqual(result.opType, "noiseTOP");
    assert.strictEqual(result.family, "TOP");
    assert.strictEqual(result.inputCount, 0);
    assert.strictEqual(result.isMultiInput, false);
    assert.strictEqual(result.inputs.length, 1);
    assert.strictEqual(result.inputs[0].index, -1);
    assert.strictEqual(result.inputs[0].name, "none");
    assert.strictEqual(result.warnings.length, 0);
  });

  it("builds topology for compositeTOP (multi-input, 1+ inputs)", () => {
    const result = buildTopologyForOperator("compositeTOP", { family: "TOP" });
    assert.strictEqual(result.family, "TOP");
    assert.strictEqual(result.isMultiInput, true);
    // inputCount is stored as -(Math.abs(1)) = -1 because multi-input notation
    assert.strictEqual(typeof result.inputCount, "number");
    assert.ok(result.connectsTo.includes("nullTOP"));
  });

  it("builds topology for blurTOP (transformer, 1 input)", () => {
    const result = buildTopologyForOperator("blurTOP", { family: "TOP" });
    assert.strictEqual(result.inputCount, 1);
    assert.ok(result.connectsTo.includes("compositeTOP"));
  });

  it("adds feedbackTOP warning", () => {
    const result = buildTopologyForOperator("feedbackTOP", { family: "TOP" });
    assert.ok(result.warnings.some((w) => w.includes("'top' parameter")));
  });

  it("adds glslTOP warning about GLSL uniforms", () => {
    const result = buildTopologyForOperator("glslTOP", { family: "TOP" });
    assert.ok(result.warnings.some((w) => w.includes("GLSL")));
  });

  it("includes pageSlug from opData", () => {
    const result = buildTopologyForOperator("noiseTOP", {
      family: "TOP",
      pageSlug: "Noise_TOP",
    });
    assert.strictEqual(result.pageSlug, "Noise_TOP");
  });
});

describe("buildTopologyForOperator — POP", () => {
  it("builds topology for particlePOP with correct warnings", () => {
    const result = buildTopologyForOperator("particlePOP", { family: "POP" });
    assert.strictEqual(result.family, "POP");
    assert.ok(result.connectsTo.includes("noisePOP"));
    assert.ok(result.connectsTo.includes("forcePOP"));
    assert.ok(result.warnings.some((w) => w.includes("Target Feedback Loop")));
  });

  it("adds feedbackPOP warning", () => {
    const result = buildTopologyForOperator("feedbackPOP", { family: "POP" });
    assert.ok(result.warnings.some((w) => w.includes("target POP")));
  });

  it("adds glslPOP warning", () => {
    const result = buildTopologyForOperator("glslPOP", { family: "POP" });
    assert.ok(result.warnings.some((w) => w.includes("GLSL")));
  });
});

describe("buildTopologyForOperator — input/output structure", () => {
  it("generator has special 'none' input entry", () => {
    const result = buildTopologyForOperator("noiseTOP", {});
    assert.strictEqual(result.inputs.length, 1);
    assert.strictEqual(result.inputs[0].name, "none");
  });

  it("multi-input operator has additional input entry", () => {
    const result = buildTopologyForOperator("compositeTOP", {});
    // compositeTOP: inputCount 1 from Math.abs, plus "additional" entry
    const inputs = result.inputs;
    assert.ok(inputs.length >= 1);
    const additional = inputs.find((i) => i.name === "additional");
    assert.ok(additional, "multi-input should have 'additional' entry");
  });

  it("single-input operator has 'Primary input'", () => {
    const result = buildTopologyForOperator("blurTOP", { family: "TOP" });
    const inputs = result.inputs;
    assert.strictEqual(inputs.length, 1);
    assert.strictEqual(inputs[0].description, "Primary input");
  });

  it("has exactly one output entry", () => {
    const result = buildTopologyForOperator("noiseTOP", {});
    assert.strictEqual(result.outputs.length, 1);
    assert.strictEqual(result.outputs[0].name, "output");
  });
});

describe("buildTopologyForOperator — edge cases", () => {
  it("handles empty opData gracefully", () => {
    const result = buildTopologyForOperator("", {});
    assert.strictEqual(result.opType, "");
    assert.strictEqual(result.family, "unknown");
  });

  it("null/undefined family falls back to detection", () => {
    const result = buildTopologyForOperator("noiseTOP", {});
    assert.strictEqual(result.family, "TOP");
  });
});
