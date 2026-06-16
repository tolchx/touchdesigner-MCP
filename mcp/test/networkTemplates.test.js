/**
 * Unit tests for Network Templates — Static Templates + Synonym Resolution
 *
 * networkTemplates is pure static data + string matching (no external deps).
 * These tests verify the 8 built-in templates, 200+ type synonyms, and
 * resolution/search functions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_TEMPLATES,
  TYPE_SYNONYMS,
  FAMILY_HINTS,
  ALL_NETWORK_TEMPLATES,
  resolveOperatorType,
  resolveAllOperatorTypes,
  getBestFamily,
  getAllFamilies,
  getTemplateByName,
  searchTemplates,
  listTemplateNames,
  listAllTags,
  resolvePrompt,
} from "../dist/networkTemplates.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: NETWORK_TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

describe("NETWORK_TEMPLATES — Static Data", () => {
  it("should have exactly 8 built-in templates", () => {
    assert.equal(NETWORK_TEMPLATES.length, 8);
  });

  it("should have ALL_NETWORK_TEMPLATES include all built-in templates", () => {
    // ALL_NETWORK_TEMPLATES = built-in + pop chain templates from JSON
    assert.ok(ALL_NETWORK_TEMPLATES.length >= NETWORK_TEMPLATES.length);
  });

  it("should have unique names across all templates", () => {
    const names = NETWORK_TEMPLATES.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("each template should have all required fields", () => {
    const requiredFields = [
      "name",
      "description",
      "tags",
      "complexity",
      "operators",
      "connections",
      "parameters",
      "pythonBuilder",
    ];
    for (const t of NETWORK_TEMPLATES) {
      for (const field of requiredFields) {
        assert.ok(
          t[field] !== undefined && t[field] !== null,
          `Template '${t.name}' missing field '${field}'`
        );
      }
    }
  });

  it("each template should have valid complexity", () => {
    const valid = new Set(["simple", "medium", "advanced"]);
    for (const t of NETWORK_TEMPLATES) {
      assert.ok(
        valid.has(t.complexity),
        `Template '${t.name}' has invalid complexity '${t.complexity}'`
      );
    }
  });

  it("each template should have at least one operator", () => {
    for (const t of NETWORK_TEMPLATES) {
      assert.ok(
        t.operators.length >= 1,
        `Template '${t.name}' has no operators`
      );
    }
  });

  it("each operator should have required fields", () => {
    for (const t of NETWORK_TEMPLATES) {
      for (const op of t.operators) {
        assert.ok(op.id, `Template '${t.name}' has operator without id`);
        assert.ok(
          op.opType,
          `Template '${t.name}' has operator without opType`
        );
        assert.ok(
          op.label,
          `Template '${t.name}' has operator without label`
        );
        assert.ok(
          op.purpose,
          `Template '${t.name}' has operator without purpose`
        );
      }
    }
  });

  it("each template should have operator IDs that are unique within the template", () => {
    for (const t of NETWORK_TEMPLATES) {
      const ids = t.operators.map((op) => op.id);
      assert.equal(
        new Set(ids).size,
        ids.length,
        `Template '${t.name}' has duplicate operator IDs`
      );
    }
  });

  it("each connection should reference valid operator IDs", () => {
    for (const t of NETWORK_TEMPLATES) {
      const opIds = new Set(t.operators.map((op) => op.id));
      for (const conn of t.connections) {
        assert.ok(
          opIds.has(conn.from),
          `Template '${t.name}': connection 'from' '${conn.from}' not found in operators`
        );
        assert.ok(
          opIds.has(conn.to),
          `Template '${t.name}': connection 'to' '${conn.to}' not found in operators`
        );
        assert.ok(
          Number.isInteger(conn.inputIndex) && conn.inputIndex >= 0,
          `Template '${t.name}': connection has invalid inputIndex '${conn.inputIndex}'`
        );
      }
    }
  });

  it("each parameter should reference a valid operator ID", () => {
    for (const t of NETWORK_TEMPLATES) {
      const opIds = new Set(t.operators.map((op) => op.id));
      for (const param of t.parameters) {
        assert.ok(
          opIds.has(param.opId),
          `Template '${t.name}': parameter opId '${param.opId}' not found in operators`
        );
        assert.ok(
          param.paramName,
          `Template '${t.name}': parameter without paramName`
        );
      }
    }
  });

  it("each template should have a non-empty pythonBuilder", () => {
    for (const t of NETWORK_TEMPLATES) {
      assert.ok(
        t.pythonBuilder.length > 50,
        `Template '${t.name}' has suspiciously short pythonBuilder`
      );
    }
  });

  it("should have at least one template per complexity level", () => {
    const levels = new Set(NETWORK_TEMPLATES.map((t) => t.complexity));
    assert.ok(levels.has("simple"), "No simple templates");
    assert.ok(levels.has("medium"), "No medium templates");
    assert.ok(levels.has("advanced"), "No advanced templates");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: TYPE_SYNONYMS
// ═══════════════════════════════════════════════════════════════════════════════

describe("TYPE_SYNONYMS — Static Data", () => {
  it("should have entries for natural language type resolution", () => {
    const entries = Object.keys(TYPE_SYNONYMS);
    assert.ok(entries.length >= 50, `Has ${entries.length} entries — expected at least 50`);
    console.log(`TYPE_SYNONYMS has ${entries.length} entries`);
  });

  it("each entry should have at least one alias", () => {
    for (const [opType, aliases] of Object.entries(TYPE_SYNONYMS)) {
      assert.ok(
        aliases.length >= 1,
        `Entry '${opType}' has no aliases`
      );
    }
  });

  it("should include operators from all 7 families", () => {
    const entries = Object.keys(TYPE_SYNONYMS);
    const families = ["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"];
    for (const family of families) {
      const hasFamily = entries.some((e) => e.toUpperCase().endsWith(family));
      assert.ok(
        hasFamily,
        `No TYPE_SYNONYMS for family '${family}'`
      );
    }
  });

  it("should have noiseTOP entry", () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TYPE_SYNONYMS, "noiseTOP"),
      "Missing noiseTOP entry"
    );
    assert.ok(
      TYPE_SYNONYMS.noiseTOP.some((a) => a.toLowerCase().includes("noise")),
      "noiseTOP aliases don't include 'noise'"
    );
  });

  it("should have particlePOP entry", () => {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TYPE_SYNONYMS, "particlePOP"),
      "Missing particlePOP entry"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: FAMILY_HINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("FAMILY_HINTS — Static Data", () => {
  it("should have hints for all 7 families", () => {
    const families = new Set(FAMILY_HINTS.map((h) => h.family));
    const expected = ["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"];
    for (const f of expected) {
      assert.ok(
        families.has(f),
        `Missing FAMILY_HINTS entry for '${f}'`
      );
    }
  });

  it("each hint should have a specificity number", () => {
    for (const hint of FAMILY_HINTS) {
      assert.ok(
        typeof hint.specificity === "number" && hint.specificity > 0,
        `Family '${hint.family}' has invalid specificity`
      );
    }
  });

  it("each hint should have at least one alias", () => {
    for (const hint of FAMILY_HINTS) {
      assert.ok(
        hint.aliases.length >= 1,
        `Family '${hint.family}' has no aliases`
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resolution: resolveOperatorType
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveOperatorType", () => {
  it("should resolve 'noise' to noiseTOP", () => {
    const result = resolveOperatorType("noise");
    assert.equal(result, "noiseTOP");
  });

  it("should resolve 'blur' to blurTOP", () => {
    const result = resolveOperatorType("blur");
    assert.equal(result, "blurTOP");
  });

  it("should resolve 'feedback' to feedbackTOP", () => {
    const result = resolveOperatorType("feedback");
    assert.equal(result, "feedbackTOP");
  });

  it("should resolve 'particle' to particlePOP", () => {
    const result = resolveOperatorType("particle");
    assert.equal(result, "particlePOP");
  });

  it("should resolve 'composite' to compositeTOP", () => {
    const result = resolveOperatorType("composite");
    assert.equal(result, "compositeTOP");
  });

  it("should resolve 'trail' to trailPOP", () => {
    const result = resolveOperatorType("trail");
    assert.equal(result, "trailPOP");
  });

  it("should resolve 'glsl' to glslTOP", () => {
    const result = resolveOperatorType("glsl");
    assert.equal(result, "glslTOP");
  });

  it("should return empty string for unknown prompt", () => {
    const result = resolveOperatorType("xyznonexistentxyz");
    assert.equal(result, "");
  });

  it("should return empty string for empty input", () => {
    assert.equal(resolveOperatorType(""), "");
    assert.equal(resolveOperatorType("   "), "");
  });

  it("should be case-insensitive", () => {
    assert.equal(resolveOperatorType("NOISE"), "noiseTOP");
    assert.equal(resolveOperatorType("Noise"), "noiseTOP");
  });

  it("should resolve multi-word aliases", () => {
    // "motion blur" is a multi-word alias for blurTOP
    const result = resolveOperatorType("motion blur");
    assert.equal(result, "blurTOP");
  });

  it("should resolve 'feedback loop' to feedbackTOP", () => {
    const result = resolveOperatorType("feedback loop");
    assert.equal(result, "feedbackTOP");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resolution: resolveAllOperatorTypes
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveAllOperatorTypes", () => {
  it("should return multiple operators for 'noise blur'", () => {
    const result = resolveAllOperatorTypes("noise blur", 10);
    assert.ok(result.length >= 2);
    // Should include both noiseTOP and blurTOP
    const types = result.map((r) => r.opType);
    assert.ok(types.includes("noiseTOP"));
    assert.ok(types.includes("blurTOP"));
  });

  it("should limit results to topN", () => {
    const result = resolveAllOperatorTypes("noise blur composite feedback", 3);
    assert.ok(result.length <= 3);
  });

  it("should return empty array for empty input", () => {
    assert.deepEqual(resolveAllOperatorTypes(""), []);
  });

  it("should sort by score descending", () => {
    const result = resolveAllOperatorTypes("noise", 10);
    for (let i = 1; i < result.length; i++) {
      assert.ok(
        result[i].score <= result[i - 1].score,
        `Result at index ${i} (${result[i].opType}, score ${result[i].score}) > previous (${result[i - 1].opType}, score ${result[i - 1].score})`
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resolution: getBestFamily
// ═══════════════════════════════════════════════════════════════════════════════

describe("getBestFamily", () => {
  it("should return 'POP' for 'particle system'", () => {
    assert.equal(getBestFamily("particle system"), "POP");
  });

  it("should return 'TOP' for 'texture image'", () => {
    assert.equal(getBestFamily("texture image"), "TOP");
  });

  it("should return 'CHOP' for 'audio signal'", () => {
    assert.equal(getBestFamily("audio signal"), "CHOP");
  });

  it("should return 'SOP' for 'geometry mesh'", () => {
    assert.equal(getBestFamily("geometry mesh"), "SOP");
  });

  it("should return 'DAT' for 'table script'", () => {
    assert.equal(getBestFamily("table script"), "DAT");
  });

  it("should return 'COMP' for 'container ui'", () => {
    assert.equal(getBestFamily("container panel"), "COMP");
  });

  it("should return 'MAT' for 'phong material'", () => {
    assert.equal(getBestFamily("phong material"), "MAT");
  });

  it("should return 'unknown' for unrelated text", () => {
    assert.equal(getBestFamily("coffee bicycle"), "unknown");
  });

  it("should return 'unknown' for empty input", () => {
    assert.equal(getBestFamily(""), "unknown");
    assert.equal(getBestFamily("   "), "unknown");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Resolution: getAllFamilies
// ═══════════════════════════════════════════════════════════════════════════════

describe("getAllFamilies", () => {
  it("should return multiple families for 'audio reactive particles'", () => {
    const result = getAllFamilies("audio reactive particles");
    const families = result.map((f) => f.family);
    assert.ok(families.includes("CHOP"), "Should include CHOP for 'audio'");
    assert.ok(families.includes("POP"), "Should include POP for 'particles'");
  });

  it("should return empty array for empty input", () => {
    assert.deepEqual(getAllFamilies(""), []);
  });

  it("should sort by score descending, then specificity", () => {
    const result = getAllFamilies("particle noise texture");
    for (let i = 1; i < result.length; i++) {
      if (result[i].score === result[i - 1].score) {
        assert.ok(
          result[i].specificity <= result[i - 1].specificity,
          "Tied scores should be sorted by specificity descending"
        );
      } else {
        assert.ok(
          result[i].score <= result[i - 1].score,
          "Should be sorted by score descending"
        );
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Template Lookup & Search
// ═══════════════════════════════════════════════════════════════════════════════

describe("getTemplateByName", () => {
  it("should find an existing template", () => {
    const t = getTemplateByName("generative-art-feedback");
    assert.ok(t);
    assert.equal(t.name, "generative-art-feedback");
  });

  it("should return undefined for missing template", () => {
    assert.equal(getTemplateByName("nonexistent-template"), undefined);
  });

  it("should return undefined for empty string", () => {
    assert.equal(getTemplateByName(""), undefined);
  });
});

describe("searchTemplates", () => {
  it("should find templates by tag match", () => {
    const results = searchTemplates("feedback");
    assert.ok(results.length >= 1);
    const names = results.map((r) => r.name);
    assert.ok(
      names.includes("generative-art-feedback"),
      "Should find generative-art-feedback"
    );
  });

  it("should return all templates for empty query", () => {
    const results = searchTemplates("");
    assert.equal(results.length, NETWORK_TEMPLATES.length);
  });

  it("should return empty for irrelevant query", () => {
    const results = searchTemplates("xyznonexistent");
    assert.equal(results.length, 0);
  });

  it("should sort by relevance (exact tag match first)", () => {
    const results = searchTemplates("glsl");
    assert.ok(results.length >= 1);
    // First result should have 'glsl' in its tags
    assert.ok(
      results[0].tags.some((t) => t.toLowerCase().includes("glsl")),
      `First result '${results[0].name}' should contain 'glsl' in tags`
    );
  });

  it("should find 'particle-system-basic' when searching for 'particle'", () => {
    const results = searchTemplates("particle");
    const names = results.map((r) => r.name);
    assert.ok(
      names.includes("particle-system-basic"),
      "Should find particle-system-basic"
    );
  });
});

describe("listTemplateNames", () => {
  it("should return all template names", () => {
    const names = listTemplateNames();
    assert.equal(names.length, NETWORK_TEMPLATES.length);
    assert.ok(names.includes("generative-art-feedback"));
    assert.ok(names.includes("audio-reactive-spectrum"));
    assert.ok(names.includes("particle-system-basic"));
    assert.ok(names.includes("glow-bloom"));
  });
});

describe("listAllTags", () => {
  it("should return unique sorted tags from all templates", () => {
    const tags = listAllTags();
    assert.ok(tags.length > 0);
    // Should be sorted
    for (let i = 1; i < tags.length; i++) {
      assert.ok(tags[i] >= tags[i - 1], "Tags should be sorted alphabetically");
    }
  });

  it("should include common tags", () => {
    const tags = listAllTags();
    assert.ok(tags.includes("feedback"));
    assert.ok(tags.includes("audio"));
    assert.ok(tags.includes("particles"));
    assert.ok(tags.includes("glsl"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Integration: resolvePrompt
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolvePrompt — Integration", () => {
  it("should resolve 'noise' completely", () => {
    const result = resolvePrompt("noise");
    assert.equal(result.prompt, "noise");
    assert.equal(result.operatorType, "noiseTOP");
    assert.ok(result.allOperatorTypes.length >= 1);
    assert.ok(Array.isArray(result.matchingTemplates));
  });

  it("should resolve 'particle system with noise'", () => {
    const result = resolvePrompt("particle system with noise");
    assert.equal(result.operatorType, "particlePOP");
    assert.equal(result.family, "POP");
  });

  it("should resolve 'table' with correct family", () => {
    const result = resolvePrompt("table");
    assert.equal(result.operatorType, "tableDAT");
    assert.equal(result.family, "DAT");
  });
});
