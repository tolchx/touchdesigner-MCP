/**
 * POP Validation Tests
 *
 * Unit tests for popValidation.ts:
 * - POP_RULES static data consistency
 * - ATTRIBUTE_RULES static data consistency
 * - INVALID_CROSS_FAMILY / VALID_BRIDGES data consistency
 * - buildPopScanCode code generation
 * - buildCrossFamilyCheckCode code generation
 *
 * No TD connection needed — pure data + string generation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  POP_RULES,
  ATTRIBUTE_RULES,
  INVALID_CROSS_FAMILY,
  VALID_BRIDGES,
  buildPopScanCode,
  buildCrossFamilyCheckCode,
} from "../dist/tools/popValidation.js";

// ─── POP_RULES ────────────────────────────────────────────────────────────

describe("POP_RULES", () => {
  it("should have at least particlePOP, feedbackPOP, noisePOP rules", () => {
    assert.ok(POP_RULES.particlePOP);
    assert.ok(POP_RULES.feedbackPOP);
    assert.ok(POP_RULES.noisePOP);
  });

  it("every rule entry should have name, severity, description, fix", () => {
    for (const [opType, rules] of Object.entries(POP_RULES)) {
      for (const rule of rules) {
        assert.ok(rule.name, `${opType} rule missing name`);
        assert.ok(rule.severity, `${opType} rule missing severity`);
        assert.ok(rule.description, `${opType} rule missing description`);
        assert.ok(rule.fix, `${opType} rule missing fix`);
      }
    }
  });

  it("every rule severity should be 'error' or 'warning'", () => {
    for (const [opType, rules] of Object.entries(POP_RULES)) {
      for (const rule of rules) {
        assert.ok(
          rule.severity === "error" || rule.severity === "warning",
          `${opType}.${rule.name} has invalid severity: ${rule.severity}`
        );
      }
    }
  });

  it("particlePOP should have 'feedback_target' rule", () => {
    const rules = POP_RULES.particlePOP;
    const hasFeedback = rules.some((r) => r.name === "feedback_target");
    assert.ok(hasFeedback, "particlePOP missing feedback_target rule");
  });

  it("particlePOP should have 'birthrate_sanity' warning", () => {
    const rules = POP_RULES.particlePOP;
    const hasBirthrate = rules.some(
      (r) => r.name === "birthrate_sanity" && r.severity === "warning"
    );
    assert.ok(hasBirthrate, "particlePOP missing birthrate_sanity warning");
  });

  it("particlePOP should have 'input_required' error", () => {
    const rules = POP_RULES.particlePOP;
    const hasInput = rules.some(
      (r) => r.name === "input_required" && r.severity === "error"
    );
    assert.ok(hasInput, "particlePOP missing input_required error");
  });

  it("feedbackPOP should have 'not_self_connecting' warning", () => {
    const rules = POP_RULES.feedbackPOP;
    const has = rules.some(
      (r) => r.name === "not_self_connecting" && r.severity === "warning"
    );
    assert.ok(has, "feedbackPOP missing not_self_connecting warning");
  });

  it("copyPOP should have 'two_inputs' error", () => {
    const rules = POP_RULES.copyPOP;
    const has = rules.some(
      (r) => r.name === "two_inputs" && r.severity === "error"
    );
    assert.ok(has, "copyPOP missing two_inputs error");
  });

  it("blendPOP should have 'two_inputs' error", () => {
    const rules = POP_RULES.blendPOP;
    const has = rules.some(
      (r) => r.name === "two_inputs" && r.severity === "error"
    );
    assert.ok(has, "blendPOP missing two_inputs error");
  });

  it("neighborPOP should have 'performance_limit' warning", () => {
    const rules = POP_RULES.neighborPOP;
    const has = rules.some(
      (r) => r.name === "performance_limit" && r.severity === "warning"
    );
    assert.ok(has, "neighborPOP missing performance_limit warning");
  });

  it("glslPOP should have 'attribute_alignment' warning", () => {
    const rules = POP_RULES.glslPOP;
    const has = rules.some(
      (r) => r.name === "attribute_alignment" && r.severity === "warning"
    );
    assert.ok(has, "glslPOP missing attribute_alignment warning");
  });

  it("should cover at least 10 POP types", () => {
    const types = Object.keys(POP_RULES);
    assert.ok(types.length >= 10, `Expected at least 10 types, got ${types.length}`);
  });
});

// ─── ATTRIBUTE_RULES ──────────────────────────────────────────────────────

describe("ATTRIBUTE_RULES", () => {
  it("should have P as required attribute for all POPs", () => {
    for (const [opType, attrs] of Object.entries(ATTRIBUTE_RULES)) {
      assert.ok(
        attrs.includes("P"),
        `${opType} missing 'P' from required attributes`
      );
    }
  });

  it("should have Vel for turbulencePOP and dragPOP", () => {
    assert.ok(ATTRIBUTE_RULES.turbulencePOP?.includes("Vel"));
    assert.ok(ATTRIBUTE_RULES.dragPOP?.includes("Vel"));
  });

  it("should have pscale for spritePOP and copyPOP", () => {
    assert.ok(ATTRIBUTE_RULES.spritePOP?.includes("pscale"));
    assert.ok(ATTRIBUTE_RULES.copyPOP?.includes("pscale"));
  });

  it("every list should have at least 'P'", () => {
    for (const [opType, attrs] of Object.entries(ATTRIBUTE_RULES)) {
      assert.ok(attrs.length >= 1, `${opType} has empty attribute list`);
    }
  });
});

// ─── INVALID_CROSS_FAMILY / VALID_BRIDGES ─────────────────────────────────

describe("INVALID_CROSS_FAMILY", () => {
  it("POP should be invalid with SOP, TOP, CHOP, DAT", () => {
    assert.ok(INVALID_CROSS_FAMILY.POP?.includes("SOP"));
    assert.ok(INVALID_CROSS_FAMILY.POP?.includes("TOP"));
    assert.ok(INVALID_CROSS_FAMILY.POP?.includes("CHOP"));
    assert.ok(INVALID_CROSS_FAMILY.POP?.includes("DAT"));
  });

  it("SOP should be invalid with POP", () => {
    assert.ok(INVALID_CROSS_FAMILY.SOP?.includes("POP"));
  });

  it("TOP should be invalid with POP", () => {
    assert.ok(INVALID_CROSS_FAMILY.TOP?.includes("POP"));
  });

  it("CHOP should be invalid with POP", () => {
    assert.ok(INVALID_CROSS_FAMILY.CHOP?.includes("POP"));
  });

  it("DAT should be invalid with POP", () => {
    assert.ok(INVALID_CROSS_FAMILY.DAT?.includes("POP"));
  });
});

describe("VALID_BRIDGES", () => {
  it("should have reciprocal bridges for POP↔SOP", () => {
    assert.ok(VALID_BRIDGES.POP_to_SOP);
    assert.ok(VALID_BRIDGES.SOP_to_POP);
  });

  it("should have reciprocal bridges for POP↔TOP", () => {
    assert.ok(VALID_BRIDGES.POP_to_TOP);
    assert.ok(VALID_BRIDGES.TOP_to_POP);
  });

  it("should have reciprocal bridges for POP↔CHOP", () => {
    assert.ok(VALID_BRIDGES.POP_to_CHOP);
    assert.ok(VALID_BRIDGES.CHOP_to_POP);
  });

  it("should have bridges for POP↔DAT (even if not directly supported)", () => {
    assert.ok(VALID_BRIDGES.POP_to_DAT);
    assert.ok(VALID_BRIDGES.DAT_to_POP);
  });

  it("every invalid cross-family pair should have a bridge", () => {
    for (const [src, targets] of Object.entries(INVALID_CROSS_FAMILY)) {
      for (const tgt of targets) {
        const key = `${src}_to_${tgt}`;
        assert.ok(
          VALID_BRIDGES[key],
          `Missing VALID_BRIDGES entry for ${src}→${tgt} (key: ${key})`
        );
      }
    }
  });
});

// ─── buildPopScanCode ─────────────────────────────────────────────────────

describe("buildPopScanCode", () => {
  it("should generate a string containing 'def scan_pop_network'", () => {
    const code = buildPopScanCode("/project1");
    assert.ok(code.includes("def scan_pop_network"));
  });

  it("should generate a string containing 'print(json.dumps(result))'", () => {
    const code = buildPopScanCode("/project1");
    assert.ok(code.includes("print(json.dumps"));
  });

  it("should include key POP parameter names", () => {
    const code = buildPopScanCode("/project1");
    assert.ok(code.includes("birthrate"));
    assert.ok(code.includes("lifeexpect"));
    assert.ok(code.includes("maxparticles"));
    assert.ok(code.includes("particlesupdatepop"));
  });

  it("should escape single quotes in the path", () => {
    const code = buildPopScanCode("/project's/test");
    // buildPopScanCode escapes ' to \' via replace(/'/g, "\\'")
    // In the generated Python: op('/project\\'s/test') — one backslash before quote
    // In JS string: "\\'s" = backslash + quote + s
    assert.ok(code.includes("\\'s"));
  });

  it("should work with root path '/'", () => {
    const code = buildPopScanCode("/");
    assert.ok(code.includes("def scan_pop_network"));
    assert.ok(code.includes("walk(target)"));
  });

  it("should generate valid Python-like code structure", () => {
    const code = buildPopScanCode("/project1");
    assert.ok(code.includes("import json"));
    assert.ok(code.includes("walk(target)"));
    assert.ok(code.includes("OPType"));
    assert.ok(code.includes("inputConnectors"));
    assert.ok(code.includes("depth > 30"));
  });

  it("should include depth limit to avoid infinite loops", () => {
    const code = buildPopScanCode("/project1");
    assert.ok(code.includes("depth > 30"));
  });
});

// ─── buildCrossFamilyCheckCode ────────────────────────────────────────────

describe("buildCrossFamilyCheckCode", () => {
  it("should generate a string containing 'def check_cross_family'", () => {
    const code = buildCrossFamilyCheckCode("/project1");
    assert.ok(code.includes("def check_cross_family"));
  });

  it("should generate a string containing 'print(json.dumps(result))'", () => {
    const code = buildCrossFamilyCheckCode("/project1");
    assert.ok(code.includes("print(json.dumps"));
  });

  it("should include OPType suffix detection logic", () => {
    const code = buildCrossFamilyCheckCode("/project1");
    assert.ok(code.includes("POP"));
    assert.ok(code.includes("TOP"));
    assert.ok(code.includes("SOP"));
    assert.ok(code.includes("CHOP"));
    assert.ok(code.includes("DAT"));
  });

  it("should escape single quotes in the path", () => {
    const code = buildCrossFamilyCheckCode("/project's/test");
    // buildCrossFamilyCheckCode escapes ' to \' via replace(/'/g, "\\'")
    // In the generated Python: op('${safePath}') where safePath has \' before s
    assert.ok(code.includes("\\'s"));
  });

  it("should work with root path '/'", () => {
    const code = buildCrossFamilyCheckCode("/");
    assert.ok(code.includes("def check_cross_family"));
  });

  it("should return violations structure", () => {
    const code = buildCrossFamilyCheckCode("/project1");
    assert.ok(code.includes("violations"));
    assert.ok(code.includes("isInvalid"));
    assert.ok(code.includes("inputIndex"));
  });

  it("should include depth limit and 'endswith' pattern detection", () => {
    const code = buildCrossFamilyCheckCode("/project1");
    assert.ok(code.includes("depth > 30"));
    assert.ok(code.includes("endswith"));
  });
});
