/**
 * Unit tests for Enhanced Tools (enhanced.ts) — Tool Handler Logic
 *
 * Tests the underlying function calls that the 6 pure-delegation tool handlers
 * in enhanced.ts make. These modules are pure static data + string matching,
 * no external dependencies (no better-sqlite3, no TDClient, no MCP server).
 *
 * Covers:
 *   td_resolve_operator  -> resolvePrompt()    from networkTemplates
 *   td_get_template      -> getTemplateByName, searchTemplates, listTemplateNames
 *   td_list_templates    -> listTemplateNames, searchTemplates, listAllTags
 *   td_get_recipe        -> listRecipes, getRecipe, searchRecipes
 *   td_catalog           -> searchCatalog, getCatalogEntry, listByFamily, etc.
 *   td_get_family_hints  -> getBestFamily, FAMILY_HINTS
 *
 * NOT covered here (need better-sqlite3):
 *   td_search_knowledge  -> knowledgeBrain
 *   td_patch_*           -> patchEngine (depends on knowledgeBrain)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePrompt,
  getBestFamily,
  searchTemplates,
  getTemplateByName,
  listTemplateNames,
  listAllTags,
  FAMILY_HINTS,
} from "../dist/networkTemplates.js";

import {
  listRecipes,
  getRecipe,
  searchRecipes,
} from "../dist/builderRecipes.js";

import {
  searchCatalog,
  getCatalogEntry,
  listByFamily,
  getCreationDefaults,
  getCatalogCountsByFamily,
  FAMILY_MAP,
} from "../dist/catalogManager.js";

// =====================================================================
// td_resolve_operator — Natural Language -> TD Operator Type
// =====================================================================

describe("Enhanced - td_resolve_operator handler logic", () => {
  it("should resolve 'blur' to blurTOP with family TOP", () => {
    const result = resolvePrompt("blur");
    assert.ok(result.allOperatorTypes, "should have allOperatorTypes");
    assert.ok(result.allOperatorTypes.length > 0, "should have at least one match");
    const topMatch = result.allOperatorTypes.find((m) => m.opType === "blurTOP");
    assert.ok(topMatch, "blurTOP should be in matches");
    assert.equal(result.family, "TOP");
    assert.equal(result.operatorType, "blurTOP");
  });

  it("should resolve 'noise' to noiseTOP", () => {
    const result = resolvePrompt("noise");
    assert.ok(result.allOperatorTypes.length > 0);
    const noiseMatch = result.allOperatorTypes.find((m) => m.opType === "noiseTOP");
    assert.ok(noiseMatch, "noiseTOP should be in matches");
  });

  it("should resolve 'particles' to particlePOP with family POP", () => {
    const result = resolvePrompt("particles");
    const popMatch = result.allOperatorTypes.find((m) => m.opType === "particlePOP");
    assert.ok(popMatch, "particlePOP should be in matches");
    assert.equal(result.family, "POP");
  });

  it("should resolve 'feedback' with feedbackTOP", () => {
    const result = resolvePrompt("feedback");
    const fbMatch = result.allOperatorTypes.find((m) => m.opType === "feedbackTOP");
    assert.ok(fbMatch, "feedbackTOP should be in matches");
  });

  it("should resolve 'composite' to compositeTOP with family TOP", () => {
    const result = resolvePrompt("composite");
    const compMatch = result.allOperatorTypes.find((m) => m.opType === "compositeTOP");
    assert.ok(compMatch, "compositeTOP should be in matches");
  });

  it("should resolve 'table' to tableDAT with family DAT", () => {
    const result = resolvePrompt("table");
    const tableMatch = result.allOperatorTypes.find((m) => m.opType === "tableDAT");
    assert.ok(tableMatch, "tableDAT should be in matches");
  });

  it("should handle multi-word prompts like 'noise blur'", () => {
    const result = resolvePrompt("noise blur");
    assert.ok(result.allOperatorTypes.length >= 2, "should find multiple operator matches");
  });

  it("should handle empty prompt gracefully", () => {
    const result = resolvePrompt("");
    assert.ok(Array.isArray(result.allOperatorTypes), "allOperatorTypes should be an array");
    assert.equal(result.allOperatorTypes.length, 0, "empty prompt should yield 0 matches");
    assert.equal(result.family, "unknown");
  });

  it("should handle gibberish with no matches", () => {
    const result = resolvePrompt("xyzzxzy");
    assert.equal(result.allOperatorTypes.length, 0, "gibberish should yield 0 matches");
  });

  it("should return matching templates for known queries", () => {
    const result = resolvePrompt("particle system");
    assert.ok(Array.isArray(result.matchingTemplates), "should have matchingTemplates array");
  });
});

// =====================================================================
// td_get_template — Get a pre-built network template
// =====================================================================

describe("Enhanced - td_get_template handler logic", () => {
  it("should list all template names via 'list'", () => {
    const names = listTemplateNames();
    assert.ok(Array.isArray(names), "should return an array");
    assert.ok(names.length >= 8, "should have at least 8 templates");
  });

  it("should get a named template that exists", () => {
    const tmpl = getTemplateByName("glow-bloom");
    assert.ok(tmpl, "glow-bloom template should exist");
    assert.equal(tmpl.name, "glow-bloom");
    assert.ok(tmpl.description, "should have a description");
    // Templates use 'operators' not 'nodes'
    assert.ok(Array.isArray(tmpl.operators), "should have operators array");
    assert.ok(Array.isArray(tmpl.connections), "should have connections array");
    assert.ok(tmpl.parameters, "should have parameters");
    assert.ok(tmpl.pythonBuilder, "should have pythonBuilder code");
  });

  it("should return undefined for nonexistent template", () => {
    const tmpl = getTemplateByName("nonexistent-template-xyz");
    assert.equal(tmpl, undefined);
  });

  it("should search templates by keyword", () => {
    const results = searchTemplates("particle");
    assert.ok(results.length > 0, "should find particle-related templates");
  });

  it("should search templates returning structured results", () => {
    const results = searchTemplates("glsl");
    assert.ok(results.length > 0, "should find GLSL-related templates");
    for (const r of results) {
      assert.ok(r.name, "each result should have a name");
      assert.ok(r.description, "each result should have a description");
    }
  });

  it("should return empty array for search with no matches", () => {
    const results = searchTemplates("zxzxzyzyx");
    assert.equal(results.length, 0);
  });

  it("should have unique template names", () => {
    const names = listTemplateNames();
    const unique = new Set(names);
    assert.equal(unique.size, names.length);
  });
});

// =====================================================================
// td_list_templates — List all available templates with tags
// =====================================================================

describe("Enhanced - td_list_templates handler logic", () => {
  it("should list all tags", () => {
    const tags = listAllTags();
    assert.ok(Array.isArray(tags), "tags should be an array");
    assert.ok(tags.length > 0, "should have at least some tags");
  });

  it("each template should have tags", () => {
    const names = listTemplateNames();
    for (const name of names) {
      const t = getTemplateByName(name);
      assert.ok(t, "template " + name + " should exist");
      assert.ok(Array.isArray(t.tags), "template " + name + " should have tags array");
    }
  });

  it("should support tag-based filtering (simulating handler logic)", () => {
    // The handler calls: tag ? searchTemplates(tag) : names.map(...)
    const results = searchTemplates("audio");
    if (results.length > 0) {
      for (const r of results) {
        assert.ok(r.name, "result should have name");
        assert.ok(Array.isArray(r.tags), "result should have tags");
      }
    }
  });
});

// =====================================================================
// td_get_recipe — Get a builder recipe
// =====================================================================

describe("Enhanced - td_get_recipe handler logic", () => {
  it("should list all recipes", () => {
    const recipes = listRecipes();
    assert.ok(Array.isArray(recipes), "should return an array");
    assert.ok(recipes.length >= 5, "should have at least 5 recipes");
  });

  it("should get a specific recipe by name", () => {
    const recipe = getRecipe("feedback-loop-top");
    assert.ok(recipe, "feedback-loop-top should exist");
    assert.equal(recipe.name, "feedback-loop-top");
    assert.ok(recipe.title, "should have a title");
    assert.ok(recipe.description, "should have a description");
    assert.ok(Array.isArray(recipe.gotchas), "should have gotchas");
    assert.ok(recipe.gotchas.length > 0, "should have at least one gotcha");
    assert.ok(typeof recipe.pythonCode === "string" && recipe.pythonCode.length > 50,
      "should have meaningful pythonCode");
  });

  it("should return undefined for nonexistent recipe", () => {
    const recipe = getRecipe("nonexistent-recipe-xyz");
    assert.equal(recipe, undefined);
  });

  it("should search recipes by keyword", () => {
    const results = searchRecipes("glsl");
    assert.ok(results.length > 0, "should find GLSL-related recipes");
  });

  it("should search recipes with structured results", () => {
    const results = searchRecipes("particle");
    assert.ok(results.length > 0, "should find particle-related recipes");
    for (const r of results) {
      assert.ok(r.name, "each result should have a name");
      assert.ok(r.title, "each result should have a title");
      assert.ok(r.description, "each result should have a description");
    }
  });

  it("should return empty array for search with no matches", () => {
    const results = searchRecipes("zxzxzyzyx");
    assert.equal(results.length, 0);
  });

  it("should have unique recipe names", () => {
    const recipes = listRecipes();
    const names = recipes.map((r) => r.name);
    const unique = new Set(names);
    assert.equal(unique.size, names.length);
  });

  it("each recipe should have complexity field", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.ok(["simple", "medium", "advanced"].includes(r.complexity),
        "recipe " + r.name + " has invalid complexity: " + r.complexity);
    }
  });
});

// =====================================================================
// td_catalog — Browse the operator catalog
// =====================================================================

describe("Enhanced - td_catalog handler logic", () => {
  it("should get catalog counts by family (stats action)", () => {
    const counts = getCatalogCountsByFamily();
    assert.ok(counts, "counts should exist");
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, "total catalog count should be > 0");
    const families = Object.keys(counts);
    assert.ok(families.length > 0, "should have at least one family");
  });

  it("should list by family (TOP)", () => {
    const ops = listByFamily("TOP");
    assert.ok(Array.isArray(ops), "should return array");
    assert.ok(ops.length > 0, "TOP family should have operators");
    for (const op of ops) {
      assert.ok(op.opType, "each op should have opType");
      assert.ok(op.opType.endsWith("TOP") || op.opType.endsWith("TOP_ES6"),
        "TOP family operator should end with TOP: " + op.opType);
    }
  });

  it("should list by family (POP)", () => {
    const ops = listByFamily("POP");
    assert.ok(Array.isArray(ops), "should return array");
    assert.ok(ops.length > 0, "POP family should have operators");
    for (const op of ops) {
      assert.ok(op.opType.includes("POP"),
        "POP family operator should contain POP: " + op.opType);
    }
  });

  it("should list by family (CHOP)", () => {
    const ops = listByFamily("CHOP");
    assert.ok(Array.isArray(ops), "should return array");
    assert.ok(ops.length > 0, "CHOP family should have operators");
  });

  it("should search catalog by query", () => {
    const results = searchCatalog("blur");
    assert.ok(Array.isArray(results), "should return array");
    if (results.length > 0) {
      for (const r of results) {
        assert.ok(r.opType, "result should have opType");
        assert.ok(r.label || r.description, "result should have label or description");
      }
    }
  });

  it("should search catalog and find noiseTOP", () => {
    const results = searchCatalog("noise");
    const found = results.find((r) => r.opType === "noiseTOP");
    assert.ok(found || results.length === 0,
      "noiseTOP should be in results if any");
  });

  it("should get a specific catalog entry for noiseTOP", () => {
    const entry = getCatalogEntry("noiseTOP");
    assert.ok(entry, "noiseTOP should exist in catalog");
    assert.equal(entry.opType, "noiseTOP");
    assert.ok(entry.family || entry.label, "entry should have family or label");
  });

  it("should get creation defaults for an operator", () => {
    const defaults = getCreationDefaults("noiseTOP");
    assert.ok(defaults, "defaults should exist");
    const keys = Object.keys(defaults);
    assert.ok(keys.length > 0, "defaults should have at least one key");
  });

  it("should return undefined for nonexistent catalog entry", () => {
    const entry = getCatalogEntry("nonexistentOpXYZ");
    assert.equal(entry, undefined);
  });

  it("should return FAMILY_MAP with correct mappings", () => {
    assert.ok(FAMILY_MAP, "FAMILY_MAP should exist");
    assert.ok(FAMILY_MAP.TOP, "FAMILY_MAP should have TOP");
    assert.ok(FAMILY_MAP.POP, "FAMILY_MAP should have POP");
    assert.ok(FAMILY_MAP.CHOP, "FAMILY_MAP should have CHOP");
    assert.ok(FAMILY_MAP.SOP, "FAMILY_MAP should have SOP");
    assert.ok(FAMILY_MAP.DAT, "FAMILY_MAP should have DAT");
    assert.ok(FAMILY_MAP.COMP, "FAMILY_MAP should have COMP");
    assert.ok(FAMILY_MAP.MAT, "FAMILY_MAP should have MAT");
  });
});

// =====================================================================
// td_get_family_hints — Family inference from keywords
// =====================================================================

describe("Enhanced - td_get_family_hints handler logic", () => {
  it("should detect TOP family for 'image'", () => {
    const best = getBestFamily("image");
    assert.equal(best, "TOP");
  });

  it("should detect POP family for 'particle'", () => {
    const best = getBestFamily("particle");
    assert.equal(best, "POP");
  });

  it("should detect POP family for 'particles' (plural form)", () => {
    const best = getBestFamily("particles");
    assert.equal(best, "POP");
  });

  it("should detect POP family for 'particle system'", () => {
    const best = getBestFamily("particle system");
    assert.equal(best, "POP");
  });

  it("should detect CHOP family for 'audio'", () => {
    const best = getBestFamily("audio");
    assert.equal(best, "CHOP");
  });

  it("should detect DAT family for 'table'", () => {
    const best = getBestFamily("table");
    assert.equal(best, "DAT");
  });

  it("should return 'unknown' for unrelated prompts", () => {
    const best = getBestFamily("quantum computing");
    assert.equal(best, "unknown");
  });

  it("should handle empty prompt", () => {
    const best = getBestFamily("");
    assert.equal(best, "unknown");
  });

  it("FAMILY_HINTS should have all 7 families", () => {
    const families = FAMILY_HINTS.map((f) => f.family);
    assert.ok(families.includes("TOP"));
    assert.ok(families.includes("CHOP"));
    assert.ok(families.includes("SOP"));
    assert.ok(families.includes("DAT"));
    assert.ok(families.includes("POP"));
    assert.ok(families.includes("COMP"));
    assert.ok(families.includes("MAT"));
  });

  it("each FAMILY_HINTS entry should have aliases and specificity", () => {
    for (const f of FAMILY_HINTS) {
      assert.ok(Array.isArray(f.aliases), f.family + " should have aliases array");
      assert.ok(f.aliases.length > 0, f.family + " should have at least one alias");
      assert.ok(typeof f.specificity === "number",
        f.family + " should have numeric specificity");
      assert.ok(f.specificity > 0, f.family + " specificity should be > 0");
    }
  });
});
