/**
 * Unit tests for Builder Recipes — 5 Multi-Op Network Construction Recipes
 *
 * builderRecipes is pure static data + string matching (no external deps).
 * These tests verify the 5 built-in recipes, their structure, gotchas, and
 * search/retrieval functions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  listRecipes,
  getRecipe,
  searchRecipes,
  listRecipeNames,
  recipeTags,
} from "../dist/builderRecipes.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Static Data: Recipe List
// ═══════════════════════════════════════════════════════════════════════════════

describe("Recipes — Static Data", () => {
  it("should have exactly 5 built-in recipes", () => {
    const recipes = listRecipes();
    assert.strictEqual(recipes.length, 5);
  });

  it("each recipe should have all required fields", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.ok(typeof r.name === "string" && r.name.length > 0, `name missing for recipe`);
      assert.ok(typeof r.title === "string" && r.title.length > 0, `title missing for ${r.name}`);
      assert.ok(typeof r.description === "string" && r.description.length > 0, `description missing for ${r.name}`);
      assert.ok(Array.isArray(r.tags), `tags not array for ${r.name}`);
      assert.ok(r.complexity === "simple" || r.complexity === "medium" || r.complexity === "advanced", `invalid complexity for ${r.name}`);
      assert.ok(Array.isArray(r.nodes) && r.nodes.length > 0, `nodes missing/empty for ${r.name}`);
      assert.ok(Array.isArray(r.connections) && r.connections.length > 0, `connections missing/empty for ${r.name}`);
      assert.ok(typeof r.pythonCode === "string" && r.pythonCode.length > 100, `pythonCode too short for ${r.name}`);
      assert.ok(Array.isArray(r.gotchas) && r.gotchas.length > 0, `gotchas missing/empty for ${r.name}`);
    }
  });

  it("should have unique names across all recipes", () => {
    const recipes = listRecipes();
    const names = recipes.map((r) => r.name);
    const unique = new Set(names);
    assert.strictEqual(unique.size, names.length);
  });

  it("each recipe name should be kebab-case", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.match(r.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, `name '${r.name}' is not kebab-case`);
    }
  });

  it("should have at least one recipe per available complexity level", () => {
    const recipes = listRecipes();
    const levels = new Set(recipes.map((r) => r.complexity));
    assert.ok(levels.has("medium"), "no medium recipe");
    assert.ok(levels.has("advanced"), "no advanced recipe");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Recipe Node Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Recipes — Node Validation", () => {
  it("each recipe should have valid node descriptions", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      for (const node of r.nodes) {
        assert.ok(typeof node === "string" && node.length > 0, `invalid node '${node}' in ${r.name}`);
      }
    }
  });

  it("each recipe should have valid connection descriptions", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      for (const conn of r.connections) {
        assert.ok(typeof conn === "string" && conn.length > 0, `invalid connection '${conn}' in ${r.name}`);
        assert.ok(conn.includes("→"), `connection '${conn}' in ${r.name} missing arrow (→)`);
      }
    }
  });

  it("each recipe should have meaningful gotchas (≥3 per recipe)", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.ok(r.gotchas.length >= 3, `recipe '${r.name}' has only ${r.gotchas.length} gotchas`);
      for (const g of r.gotchas) {
        assert.ok(g.startsWith("GOTCHA:"), `gotcha '${g.slice(0, 30)}...' in ${r.name} missing 'GOTCHA:' prefix`);
        assert.ok(g.length > 20, `gotcha too short in ${r.name}`);
      }
    }
  });

  it("each recipe pythonCode should contain the recipe title", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.ok(r.pythonCode.includes(r.title), `pythonCode for ${r.name} missing title '${r.title}'`);
    }
  });

  it("each recipe pythonCode should define a build function", () => {
    const recipes = listRecipes();
    for (const r of recipes) {
      assert.match(r.pythonCode, /def build_/, `pythonCode for ${r.name} missing build function`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// listRecipes
// ═══════════════════════════════════════════════════════════════════════════════

describe("listRecipes", () => {
  it("should return all 5 recipes", () => {
    const recipes = listRecipes();
    assert.strictEqual(recipes.length, 5);
  });

  it("should include feedback-loop-top", () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes("feedback-loop-top"));
  });

  it("should include particle-system-pop", () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes("particle-system-pop"));
  });

  it("should include glsl-top-shader", () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes("glsl-top-shader"));
  });

  it("should include audio-reactive-spectrum", () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes("audio-reactive-spectrum"));
  });

  it("should include render-scene-3d", () => {
    const names = listRecipes().map((r) => r.name);
    assert.ok(names.includes("render-scene-3d"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// getRecipe
// ═══════════════════════════════════════════════════════════════════════════════

describe("getRecipe", () => {
  it("should find an existing recipe by name", () => {
    const r = getRecipe("feedback-loop-top");
    assert.ok(r !== undefined);
    assert.strictEqual(r.name, "feedback-loop-top");
    assert.strictEqual(r.title, "Feedback Loop TOP");
  });

  it("should find 'particle-system-pop' recipe", () => {
    const r = getRecipe("particle-system-pop");
    assert.ok(r !== undefined);
    assert.strictEqual(r.tags.includes("POP"), true);
  });

  it("should return undefined for missing recipe", () => {
    const r = getRecipe("nonexistent-recipe");
    assert.strictEqual(r, undefined);
  });

  it("should return undefined for empty string", () => {
    const r = getRecipe("");
    assert.strictEqual(r, undefined);
  });

  it("should be case-sensitive (kebab names)", () => {
    const r = getRecipe("Feedback-Loop-Top");
    assert.strictEqual(r, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// searchRecipes
// ═══════════════════════════════════════════════════════════════════════════════

describe("searchRecipes", () => {
  it("should find recipes by exact tag match", () => {
    const results = searchRecipes("particles");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === "particle-system-pop"));
  });

  it("should find recipes by tag (audio)", () => {
    const results = searchRecipes("audio");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === "audio-reactive-spectrum"));
  });

  it("should find recipes by description keyword", () => {
    const results = searchRecipes("feedback");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === "feedback-loop-top"));
  });

  it("should return all recipes for empty query", () => {
    const results = searchRecipes("");
    assert.strictEqual(results.length, 5);
  });

  it("should return all recipes for whitespace query", () => {
    const results = searchRecipes("   ");
    assert.strictEqual(results.length, 5);
  });

  it("should return empty for irrelevant query", () => {
    const results = searchRecipes("xyzzy_nonexistent_123");
    assert.strictEqual(results.length, 0);
  });

  it("should sort results by relevance", () => {
    const results = searchRecipes("GLSL");
    assert.ok(results.length >= 1);
    // glsl-top-shader should be first (name match = highest score)
    assert.strictEqual(results[0].name, "glsl-top-shader");
  });

  it("should find 'glsl' case-insensitively", () => {
    const results = searchRecipes("glsl");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === "glsl-top-shader"));
  });

  it("should find 'render' matching render-scene-3d", () => {
    const results = searchRecipes("render");
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === "render-scene-3d"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// listRecipeNames
// ═══════════════════════════════════════════════════════════════════════════════

describe("listRecipeNames", () => {
  it("should return all 5 recipe names", () => {
    const names = listRecipeNames();
    assert.strictEqual(names.length, 5);
  });

  it("should include key recipe names", () => {
    const names = listRecipeNames();
    assert.ok(names.includes("feedback-loop-top"));
    assert.ok(names.includes("particle-system-pop"));
    assert.ok(names.includes("glsl-top-shader"));
    assert.ok(names.includes("audio-reactive-spectrum"));
    assert.ok(names.includes("render-scene-3d"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// recipeTags
// ═══════════════════════════════════════════════════════════════════════════════

describe("recipeTags", () => {
  it("should return a non-empty tag map", () => {
    const tags = recipeTags();
    assert.ok(Object.keys(tags).length > 0);
  });

  it("should include 'TOP' tag", () => {
    const tags = recipeTags();
    assert.ok(tags["TOP"] !== undefined, "TOP tag missing");
    assert.ok(tags["TOP"] >= 2, "TOP tag should appear in at least 2 recipes");
  });

  it("should include 'POP' tag", () => {
    const tags = recipeTags();
    assert.ok(tags["POP"] !== undefined, "POP tag missing");
    assert.strictEqual(tags["POP"], 1);
  });

  it("should include 'audioreactive' tag frequencies", () => {
    const tags = recipeTags();
    // 'audio' tag appears in audio-reactive-spectrum
    assert.ok(tags["audio"] !== undefined, "audio tag missing");
  });

  it("should have unique tag keys (no duplicates)", () => {
    const tags = recipeTags();
    const keys = Object.keys(tags);
    const unique = new Set(keys);
    assert.strictEqual(unique.size, keys.length);
  });
});
