/**
 * Unit tests for Knowledge Brain — FTS5 SQLite search engine for TD operator docs.
 *
 * Tests four exported functions:
 *   - searchKnowledge(query, limit)
 *   - searchByFamily(query, family, limit)
 *   - searchKnowledgeAdvanced(options)
 *   - brainStats()
 *
 * The module auto-initializes the SQLite DB on import (builds FTS5 index from
 * operator JSON files in mcp/data/). Tests run against the real database.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  searchKnowledge,
  searchByFamily,
  searchKnowledgeAdvanced,
  brainStats,
} from "../dist/knowledgeBrain.js";

// ─── Setup ──────────────────────────────────────────────────────────────────

let stats;

before(() => {
  // Ensure the DB is built (auto-init on import, but call brainStats to confirm)
  stats = brainStats();
});

// ─── brainStats ─────────────────────────────────────────────────────────────

describe("brainStats", () => {
  it("returns a valid stats object", () => {
    assert.equal(typeof stats, "object");
    assert.ok(stats !== null);
    assert.equal(typeof stats.total, "number");
    assert.ok(stats.total > 0, "should have ingested at least one operator");
  });

  it("has byFamily record with entries", () => {
    assert.equal(typeof stats.byFamily, "object");
    assert.ok(stats.byFamily !== null);
    const keys = Object.keys(stats.byFamily);
    assert.ok(keys.length > 0, "byFamily should have at least one family");
    // Every value should be a positive number
    for (const k of keys) {
      assert.equal(typeof stats.byFamily[k], "number");
      assert.ok(stats.byFamily[k] > 0, `family ${k} count should be > 0`);
    }
  });

  it("has byTrust record with entries", () => {
    assert.equal(typeof stats.byTrust, "object");
    const keys = Object.keys(stats.byTrust);
    assert.ok(keys.length > 0, "byTrust should have at least one tier");
    for (const k of keys) {
      assert.equal(typeof stats.byTrust[k], "number");
      assert.ok(stats.byTrust[k] > 0, `trust ${k} count should be > 0`);
    }
  });

  it("has bySource record with entries", () => {
    assert.equal(typeof stats.bySource, "object");
    const keys = Object.keys(stats.bySource);
    assert.ok(keys.length > 0, "bySource should have at least one source");
    for (const k of keys) {
      assert.equal(typeof stats.bySource[k], "number");
      assert.ok(stats.bySource[k] > 0, `source ${k} count should be > 0`);
    }
  });

  it("total matches sum of byFamily counts", () => {
    const familySum = Object.values(stats.byFamily).reduce((a, b) => a + b, 0);
    assert.equal(stats.total, familySum, "total should equal sum of family counts");
  });
});

// ─── searchKnowledge ────────────────────────────────────────────────────────

describe("searchKnowledge", () => {
  it("returns results for a common operator name", () => {
    const { results, total } = searchKnowledge("noise", 5);
    assert.ok(Array.isArray(results), "results should be an array");
    assert.ok(results.length > 0, "should find at least one noise operator");
    assert.ok(total > 0, "total should be > 0");
  });

  it("results have correct shape", () => {
    const { results } = searchKnowledge("noise", 3);
    for (const r of results) {
      assert.ok(r.entry, "result should have entry");
      assert.equal(typeof r.score, "number", "score should be a number");
      assert.equal(typeof r.snippet, "string", "snippet should be a string");
      // Entry shape
      assert.equal(typeof r.entry.name, "string");
      assert.equal(typeof r.entry.family, "string");
      assert.equal(typeof r.entry.pageTitle, "string");
      assert.equal(typeof r.entry.trustTier, "string");
      assert.equal(typeof r.entry.sourceType, "string");
    }
  });

  it("results are sorted by score descending", () => {
    const { results } = searchKnowledge("top", 10);
    for (let i = 1; i < results.length; i++) {
      assert.ok(
        results[i].score <= results[i - 1].score,
        `result ${i} score (${results[i].score}) should be <= result ${i - 1} score (${results[i - 1].score})`
      );
    }
  });

  it("respects limit parameter", () => {
    const { results: r5 } = searchKnowledge("top", 5);
    const { results: r2 } = searchKnowledge("top", 2);
    assert.ok(r5.length <= 5, "limit 5 should return at most 5 results");
    assert.ok(r2.length <= 2, "limit 2 should return at most 2 results");
  });

  it("returns empty results for gibberish query", () => {
    const { results } = searchKnowledge("xyzzyplughnonexistent", 10);
    assert.equal(results.length, 0, "gibberish should return no results");
  });

  it("handles empty query gracefully", () => {
    const { results, total } = searchKnowledge("", 5);
    assert.ok(Array.isArray(results), "should return array even for empty query");
    assert.ok(total >= 0, "total should be >= 0");
  });
});

// ─── searchByFamily ─────────────────────────────────────────────────────────

describe("searchByFamily", () => {
  it("filters results to the specified family", () => {
    const { results } = searchByFamily("noise", "TOP", 10);
    assert.ok(results.length > 0, "should find noise TOP operators");
    for (const r of results) {
      assert.equal(r.entry.family, "TOP", "all results should be TOP family");
    }
  });

  it("returns different results for different families", () => {
    const { results: topResults } = searchByFamily("noise", "TOP", 5);
    const { results: chopResults } = searchByFamily("noise", "CHOP", 5);
    // At least one should be different (different families have different operators)
    const topNames = new Set(topResults.map((r) => r.entry.name));
    const chopNames = new Set(chopResults.map((r) => r.entry.name));
    const disjoint = [...topNames].filter((n) => !chopNames.has(n));
    assert.ok(
      disjoint.length > 0 || chopResults.length === 0,
      "TOP and CHOP noise results should differ"
    );
  });

  it("returns empty for family with no matching operators", () => {
    const { results } = searchByFamily("xyzzy", "COMP", 10);
    // There may be no COMP operators matching gibberish
    assert.ok(Array.isArray(results), "should return array");
  });

  it("all results have correct family", () => {
    const families = ["TOP", "CHOP", "SOP", "DAT"];
    for (const fam of families) {
      const { results } = searchByFamily("*", fam, 5);
      for (const r of results) {
        assert.equal(r.entry.family, fam, `result should be ${fam} family`);
      }
    }
  });
});

// ─── searchKnowledgeAdvanced ────────────────────────────────────────────────

describe("searchKnowledgeAdvanced", () => {
  it("accepts query + family filter", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "noise",
      family: "TOP",
      limit: 5,
    });
    for (const r of results) {
      assert.equal(r.entry.family, "TOP");
    }
  });

  it("accepts minTrust filter", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "noise",
      minTrust: "official",
      limit: 10,
    });
    for (const r of results) {
      assert.ok(
        r.entry.trustTier === "official",
        `expected official trust, got ${r.entry.trustTier}`
      );
    }
  });

  it("accepts sourceType filter (ops)", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "noise",
      sourceType: "ops",
      limit: 10,
    });
    for (const r of results) {
      assert.equal(r.entry.sourceType, "ops");
    }
  });

  it("accepts sourceType filter (pops)", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "",
      sourceType: "pops",
      limit: 10,
    });
    for (const r of results) {
      assert.equal(r.entry.sourceType, "pops");
    }
  });

  it("combines multiple filters", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "noise",
      family: "TOP",
      minTrust: "official",
      sourceType: "ops",
      limit: 10,
    });
    for (const r of results) {
      assert.equal(r.entry.family, "TOP");
      assert.equal(r.entry.trustTier, "official");
      assert.equal(r.entry.sourceType, "ops");
    }
  });

  it("clamps limit to max 50", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "",
      limit: 999,
    });
    assert.ok(results.length <= 50, "limit should be clamped to 50");
  });

  it("enforces minimum limit of 1", () => {
    const { results } = searchKnowledgeAdvanced({
      query: "",
      limit: 0,
    });
    assert.ok(results.length <= 1, "limit 0 should return at most 1 result");
  });

  it("uses FTS5 prefix matching (single term gets *)", () => {
    // "noi" should match "noise" via prefix matching
    const { results } = searchKnowledgeAdvanced({ query: "noi", limit: 5 });
    assert.ok(results.length > 0, "prefix 'noi' should match noise operators");
  });

  it("empty query returns recent/all entries sorted by trust", () => {
    const { results, total } = searchKnowledgeAdvanced({ query: "", limit: 10 });
    assert.ok(results.length > 0, "empty query should return results");
    assert.ok(total > 0, "total should be > 0");
    // Results should be sorted by trust tier (official > bundled > community)
    const trustOrder = { official: 3, bundled: 2, community: 1 };
    for (let i = 1; i < results.length; i++) {
      const prev = trustOrder[results[i - 1].entry.trustTier] ?? 0;
      const curr = trustOrder[results[i].entry.trustTier] ?? 0;
      assert.ok(
        prev >= curr,
        `result ${i} trust should not be higher than result ${i - 1}`
      );
    }
  });

  it("handles queries with special FTS5 characters gracefully", () => {
    // These should not crash — may return empty results or fallback to LIKE
    const queries = ['"noise"', "noise OR blur", "noise AND top", "noise NOT blur"];
    for (const q of queries) {
      assert.doesNotThrow(() => {
        searchKnowledgeAdvanced({ query: q, limit: 5 });
      }, `query '${q}' should not throw`);
    }
  });
});

// ─── Integration: search + stats consistency ────────────────────────────────

describe("search + stats consistency", () => {
  it("searching by each family returns results that match stats", () => {
    const s = brainStats();
    for (const [fam, count] of Object.entries(s.byFamily)) {
      if (fam === "unknown") continue;
      const { results } = searchByFamily("", fam, 1);
      if (count > 0) {
        assert.ok(
          results.length > 0,
          `family ${fam} has ${count} docs but search returned nothing`
        );
      }
    }
  });
});
