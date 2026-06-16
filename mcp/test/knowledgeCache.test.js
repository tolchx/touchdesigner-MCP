/**
 * Unit tests for Knowledge Cache — unified ops/pops knowledge base loader.
 *
 * Tests three layers:
 *   - TdFamilySchema           (zod enum validation)
 *   - buildRawMap()            (pure: index array/operators[]/legacy → op map)
 *   - buildSearchIndex()       (pure: two op maps → unified search index)
 *   - Real data integration    (ensureKnowledgeLoaded + accessors on mcp/data)
 *
 * Pure functions have no module-level state; real-data tests load the actual
 * knowledge base from disk (idempotent, runs once).
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Import from compiled dist
import {
  TdFamilySchema,
  buildRawMap,
  buildSearchIndex,
  ensureKnowledgeLoaded,
  getOpsIndex,
  getPopsIndex,
  getOpsMap,
  getPopsMap,
  getSearchIndex,
  isKnowledgeLoaded,
  getKnowledgeLoadError,
} from "../dist/knowledgeCache.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Real on-disk data dir: mcp/data (resolved relative to this test file). */
const DATA_DIR = resolve(__dirname, "../data");

/** Build a realistic ops index item. */
function makeOpsItem(overrides = {}) {
  return {
    family: "TOP",
    pageTitle: "Noise TOP",
    pageSlug: "Noise_TOP",
    url: "https://docs.derivative.ca/Noise_TOP",
    tdOpTypeGuess: "noiseTOP",
    summary: "Generates a noise texture.",
    ...overrides,
  };
}

/** Build a realistic pops index item. */
function makePopsItem(overrides = {}) {
  return {
    pageTitle: "Noise POP",
    pageSlug: "Noise_POP",
    url: "https://docs.derivative.ca/Noise_POP",
    experimental: false,
    tdOpTypeGuess: "noisePOP",
    ...overrides,
  };
}

// ─── TdFamilySchema Tests ────────────────────────────────────────────────────

describe("TdFamilySchema", () => {
  it("validates all canonical families", () => {
    for (const fam of ["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]) {
      const result = TdFamilySchema.safeParse(fam);
      assert.ok(
        result.success,
        `expected ${fam} to be a valid family`
      );
      assert.equal(result.success ? result.data : undefined, fam);
    }
  });

  it("rejects invalid family strings", () => {
    for (const bad of ["top", "FX", "Shader", "", "TOP ", "MATS"]) {
      const result = TdFamilySchema.safeParse(bad);
      assert.ok(
        !result.success,
        `expected '${bad}' to be rejected`
      );
    }
  });

  it("rejects non-string values", () => {
    assert.ok(!TdFamilySchema.safeParse(123).success);
    assert.ok(!TdFamilySchema.safeParse(null).success);
    assert.ok(!TdFamilySchema.safeParse(undefined).success);
    assert.ok(!TdFamilySchema.safeParse(["TOP"]).success);
  });

  it("accepts POP (recent addition)", () => {
    const result = TdFamilySchema.safeParse("POP");
    assert.ok(result.success, "POP must be a valid family");
  });
});

// ─── buildRawMap Tests ───────────────────────────────────────────────────────

describe("buildRawMap", () => {
  it("array_input_format_returns_map_keyed_by_pageSlug", () => {
    const parsed = [makeOpsItem(), makeOpsItem({ pageSlug: "Blur_TOP" })];
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 2);
    assert.ok(map["Noise_TOP"], "Noise_TOP key should exist");
    assert.ok(map["Blur_TOP"], "Blur_TOP key should exist");
    assert.equal(map["Noise_TOP"].pageSlug, "Noise_TOP");
  });

  it("operators_array_format_returns_map_keyed_by_pageSlug", () => {
    const parsed = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      source: { categories: {} },
      operators: [makeOpsItem(), makePopsItem()],
    };
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 2);
    assert.ok(map["Noise_TOP"], "Noise_TOP key should exist");
    assert.ok(map["Noise_POP"], "Noise_POP key should exist");
  });

  it("legacy_record_format_loads_existing_files_from_disk", () => {
    // path is relative to dataDir/<family>; ops operator lives under operators/TOP/
    const parsed = { Add_TOP: "operators/TOP/Add_TOP.json" };
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1);
    assert.ok(map["Add_TOP"], "Add_TOP key should exist");
    // Loaded file should contain operator doc fields
    assert.equal(map["Add_TOP"].pageSlug, "Add_TOP");
    assert.equal(map["Add_TOP"].family, "TOP");
  });

  it("legacy_record_format_silently_skips_missing_files", () => {
    const parsed = {
      Add_TOP: "operators/TOP/Add_TOP.json", // exists
      Ghost_TOP: "operators/TOP/Does_Not_Exist_TOP.json", // missing
    };
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1, "only the existing file should load");
    assert.ok(map["Add_TOP"]);
    assert.ok(!map["Ghost_TOP"], "missing file should be skipped");
  });

  it("empty_array_returns_empty_map", () => {
    const map = buildRawMap([], "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 0);
  });

  it("empty_operators_array_returns_empty_map", () => {
    const parsed = {
      generatedAt: "x",
      source: { categories: {} },
      operators: [],
    };
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 0);
  });

  it("empty_record_returns_empty_map", () => {
    const map = buildRawMap({}, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 0);
  });

  it("malformed_non_array_non_operators_input_returns_empty_map", () => {
    // A number: not an array, no .operators array → legacy branch; Object.entries(42) = []
    const map = buildRawMap(42, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 0);
  });

  it("falls_back_to_tdOpTypeGuess_when_pageSlug_and_name_missing", () => {
    // Array format key precedence: pageSlug || name || tdOpTypeGuess || ""
    const parsed = [
      { tdOpTypeGuess: "noiseTOP", pageTitle: "Noise TOP" },
    ];
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1);
    assert.ok(
      map["noiseTOP"],
      "should fall back to tdOpTypeGuess as key"
    );
    assert.ok(!("undefined" in map));
  });

  it("falls_back_to_name_when_pageSlug_missing", () => {
    const parsed = [{ name: "customOp", pageTitle: "Custom" }];
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1);
    assert.ok(map["customOp"], "should fall back to name as key");
  });

  it("uses_empty_string_key_when_all_key_fields_missing", () => {
    const parsed = [{ pageTitle: "No slug/name/guess" }];
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1);
    assert.ok("" in map, "should use empty-string key");
  });

  it("duplicate_pageSlugs_last_wins", () => {
    const parsed = [
      makeOpsItem({ pageSlug: "Dup_TOP", summary: "first" }),
      makeOpsItem({ pageSlug: "Dup_TOP", summary: "second" }),
    ];
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 1, "one key after dedup");
    assert.equal(map["Dup_TOP"].summary, "second", "last entry should win");
  });

  it("legacy_record_skips_entry_whose_file_load_throws", () => {
    // Point at an existing path but non-JSON-ish content is fine; here use a
    // directory path which readFileSync will reject → caught + skipped.
    const parsed = { bad: "operators/TOP" }; // operators/TOP is a directory
    const map = buildRawMap(parsed, "ops", DATA_DIR);
    assert.equal(Object.keys(map).length, 0, "directory read error is swallowed");
  });
});

// ─── buildSearchIndex Tests ──────────────────────────────────────────────────

describe("buildSearchIndex", () => {
  it("empty_maps_produce_empty_index", () => {
    const idx = buildSearchIndex({}, {});
    assert.ok(idx instanceof Map);
    assert.equal(idx.size, 0);
  });

  it("single_ops_map_creates_index_entries", () => {
    // Use distinct fields so several index keys are generated.
    const opsMap = {
      SomeKey: {
        pageSlug: "MySlug",
        pageTitle: "My Title",
        tdOpTypeGuess: "myguess",
        name: "myname",
      },
    };
    const idx = buildSearchIndex(opsMap, {});
    // pageSlug, tdOpTypeGuess, pageTitle (x2), key, name → 6 distinct keys
    assert.ok(idx.has("myslug"), "pageSlug entry");
    assert.ok(idx.has("myguess"), "tdOpTypeGuess entry");
    assert.ok(idx.has("my_title"), "pageTitle underscore entry");
    assert.ok(idx.has("my title"), "pageTitle original entry");
    assert.ok(idx.has("somekey"), "key entry");
    assert.ok(idx.has("myname"), "name entry");
    assert.ok(idx.size >= 6, `expected at least 6 entries, got ${idx.size}`);
  });

  it("merges_entries_from_both_ops_and_pops_maps", () => {
    const opsMap = {
      Blur_TOP: makeOpsItem({
        pageSlug: "Blur_TOP",
        tdOpTypeGuess: "blurTOP",
        pageTitle: "Blur TOP",
      }),
    };
    const popsMap = { Noise_POP: makePopsItem() };
    const idx = buildSearchIndex(opsMap, popsMap);
    // ops entries present
    assert.ok(idx.has("blurtop"), "ops tdOpTypeGuess present");
    assert.ok(idx.has("blur_top"), "ops pageSlug present");
    // pops entries present
    assert.ok(idx.has("noisepop"), "pops tdOpTypeGuess present");
    assert.ok(idx.has("noise_pop"), "pops pageSlug present");
  });
  it("infers_family_TOP_from_key_suffix", () => {
    const idx = buildSearchIndex({ blurTOP: { pageSlug: "blur" } }, {});
    const entry = idx.get("blur");
    assert.equal(entry.family, "TOP");
  });

  it("infers_family_POP_from_key_suffix", () => {
    const idx = buildSearchIndex({}, { particlePOP: { pageSlug: "particle" } });
    const entry = idx.get("particle");
    assert.equal(entry.family, "POP");
  });

  it("infers_family_for_each_suffix_CHOP_SOP_DAT_COMP", () => {
    const cases = [
      ["mathCHOP", "math", "CHOP"],
      ["sphereSOP", "sphere", "SOP"],
      ["tableDAT", "table", "DAT"],
      ["containerCOMP", "container", "COMP"],
    ];
    for (const [key, slug, expected] of cases) {
      const idx = buildSearchIndex({ [key]: { pageSlug: slug } }, {});
      assert.equal(
        idx.get(slug).family,
        expected,
        `${key} should infer ${expected}`
      );
    }
  });

  it("infers_unknown_family_when_no_suffix_match_and_no_op_family", () => {
    const idx = buildSearchIndex({ weird: { pageSlug: "w" } }, {});
    assert.equal(idx.get("w").family, "unknown");
  });

  it("op_family_field_takes_precedence_over_suffix_inference", () => {
    // key ends with TOP but op declares family CHOP
    const idx = buildSearchIndex({ blurTOP: { pageSlug: "blur", family: "CHOP" } }, {});
    assert.equal(idx.get("blur").family, "CHOP");
  });

  it("index_key_for_pageSlug_is_lowercased", () => {
    const idx = buildSearchIndex({ k: { pageSlug: "MySlug" } }, {});
    assert.ok(idx.has("myslug"), "pageSlug should be lowercased in index");
    assert.ok(!idx.has("MySlug"), "original-case pageSlug should not be a key");
  });

  it("index_key_for_tdOpTypeGuess_is_lowercased", () => {
    const idx = buildSearchIndex({ k: { tdOpTypeGuess: "blurTOP" } }, {});
    assert.ok(idx.has("blurtop"), "tdOpTypeGuess should be lowercased");
  });

  it("index_keys_for_pageTitle_original_and_underscore_variants", () => {
    const idx = buildSearchIndex({ k: { pageTitle: "Add TOP" } }, {});
    assert.ok(idx.has("add top"), "original lowercased pageTitle present");
    assert.ok(idx.has("add_top"), "underscore-normalized pageTitle present");
  });

  it("index_key_for_map_key_is_lowercased", () => {
    const idx = buildSearchIndex({ MyMapKey: { pageTitle: "P" } }, {});
    assert.ok(idx.has("mymapkey"), "map key should be lowercased in index");
  });

  it("index_key_for_op_name_is_lowercased", () => {
    const idx = buildSearchIndex({ k: { name: "SomeName" } }, {});
    assert.ok(idx.has("somename"), "op.name should be lowercased in index");
  });

  it("deduplication_same_slug_in_both_maps_pops_wins", () => {
    // allMaps = [opsMap, popsMap]; pops processed last → overwrites.
    const opsMap = { shared: { pageSlug: "shared", pageTitle: "Ops", family: "TOP" } };
    const popsMap = { shared: { pageSlug: "shared", pageTitle: "Pops", family: "POP" } };
    const idx = buildSearchIndex(opsMap, popsMap);
    const entry = idx.get("shared");
    assert.equal(entry.family, "POP", "pops entry should win (processed last)");
  });

  it("entry_shape_has_name_label_family_operator", () => {
    const idx = buildSearchIndex({ Noise_TOP: makeOpsItem() }, {});
    const entry = idx.get("noise_top");
    assert.ok(entry, "entry should exist");
    assert.equal(typeof entry.name, "string");
    assert.equal(typeof entry.label, "string");
    assert.equal(typeof entry.family, "string");
    assert.equal(typeof entry.operator, "object");
    assert.equal(entry.operator.pageSlug, "Noise_TOP");
  });

  it("label_falls_back_to_pageTitle_when_no_label_field", () => {
    const idx = buildSearchIndex({ k: { pageSlug: "s", pageTitle: "My Title" } }, {});
    assert.equal(idx.get("s").label, "My Title");
  });

  it("label_falls_back_to_key_when_no_label_or_pageTitle", () => {
    const idx = buildSearchIndex({ SomeKey: { tdOpTypeGuess: "g" } }, {});
    // entry reachable via key lowercase
    assert.equal(idx.get("somekey").label, "SomeKey");
  });

  it("name_falls_back_to_key_when_no_pageSlug", () => {
    const idx = buildSearchIndex({ SomeKey: { pageTitle: "P" } }, {});
    assert.equal(idx.get("somekey").name, "SomeKey");
  });
});

// ─── Real Data Integration Tests ─────────────────────────────────────────────

describe("knowledge cache (real data)", () => {
  before(() => {
    // Pre-warm the module-level cache. Idempotent.
    ensureKnowledgeLoaded();
  });

  it("ensureKnowledgeLoaded_is_idempotent", () => {
    assert.doesNotThrow(() => {
      ensureKnowledgeLoaded();
      ensureKnowledgeLoaded();
    });
  });

  it("getOpsIndex_returns_valid_shape_with_operators_array", () => {
    const idx = getOpsIndex();
    assert.equal(typeof idx, "object");
    assert.ok(idx, "ops index should not be null");
    assert.ok(Array.isArray(idx.operators), "operators must be an array");
    assert.equal(typeof idx.generatedAt, "string");
    assert.ok(idx.source && typeof idx.source === "object");
  });

  it("getOpsIndex_operators_is_non_empty", () => {
    const idx = getOpsIndex();
    assert.ok(
      idx.operators.length > 0,
      "real ops index should contain operators"
    );
  });

  it("getPopsIndex_returns_valid_shape_with_operators_array", () => {
    const idx = getPopsIndex();
    assert.equal(typeof idx, "object");
    assert.ok(idx, "pops index should not be null");
    assert.ok(Array.isArray(idx.operators), "operators must be an array");
    assert.equal(typeof idx.generatedAt, "string");
    assert.ok(idx.source && typeof idx.source === "object");
  });

  it("getOpsMap_returns_non_empty_record", () => {
    const map = getOpsMap();
    assert.equal(typeof map, "object");
    assert.ok(map !== null);
    const keys = Object.keys(map);
    assert.ok(keys.length > 0, "real ops map should be non-empty");
    // Each value should be an operator object with at least pageTitle
    const first = map[keys[0]];
    assert.ok(first && typeof first === "object");
  });

  it("getPopsMap_returns_non_empty_record", () => {
    const map = getPopsMap();
    assert.equal(typeof map, "object");
    assert.ok(map !== null);
    const keys = Object.keys(map);
    assert.ok(keys.length > 0, "real pops map should be non-empty");
  });

  it("getSearchIndex_returns_non_empty_map", () => {
    const idx = getSearchIndex();
    assert.ok(idx instanceof Map, "search index must be a Map");
    assert.ok(idx.size > 0, "real search index should be non-empty");
  });

  it("isKnowledgeLoaded_returns_true_after_ensureKnowledgeLoaded", () => {
    assert.equal(isKnowledgeLoaded(), true);
  });

  it("getKnowledgeLoadError_returns_null_when_loaded_successfully", () => {
    // The real data dir exists and parses; load error should be null.
    assert.equal(getKnowledgeLoadError(), null);
  });

  it("search_index_entries_resolve_to_real_operators", () => {
    const idx = getSearchIndex();
    // Find at least one real operator slug present in the search index
    let found = false;
    for (const [, entry] of idx) {
      if (entry && entry.operator && entry.operator.pageSlug) {
        found = true;
        assert.equal(typeof entry.family, "string");
        assert.notEqual(entry.family, "unknown");
        break;
      }
    }
    assert.ok(found, "at least one search entry should resolve to a real operator");
  });
});
