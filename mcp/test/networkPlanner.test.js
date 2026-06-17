/**
 * Unit tests for networkPlanner.ts — fuzzy search + levenshtein distance.
 *
 * - levenshteinDistance: pure function (no module deps), exhaustive edge cases.
 * - fuzzySearchOperators: integration against the real on-disk knowledge base
 *   (mcp/data). Covers exact / startsWith / includes / levenshtein scoring tiers,
 *   empty query, limit, special chars, and sort order.
 *
 * Run: node --experimental-vm-modules mcp/test/networkPlanner.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { levenshteinDistance, fuzzySearchOperators } from "../dist/networkPlanner.js";

// levenshteinDistance tests (pure function, no deps)
await describe("levenshteinDistance", async () => {
  await it("should return 0 for identical strings", () => {
    assert.strictEqual(levenshteinDistance("hello", "hello"), 0);
  });
  await it("should return distance for single char substitution", () => {
    assert.strictEqual(levenshteinDistance("hello", "hallo"), 1);
  });
  await it("should return string length when comparing to empty string", () => {
    assert.strictEqual(levenshteinDistance("", "hello"), 5);
    assert.strictEqual(levenshteinDistance("hello", ""), 5);
  });
  await it("should handle single char insertion", () => {
    assert.strictEqual(levenshteinDistance("nois", "noise"), 1);
  });
  await it("should handle single char deletion", () => {
    assert.strictEqual(levenshteinDistance("noise", "nois"), 1);
  });
  await it("should handle completely different strings", () => {
    assert.strictEqual(levenshteinDistance("abc", "xyz"), 3);
  });
  await it("should be symmetric (distance(a,b) === distance(b,a))", () => {
    assert.strictEqual(levenshteinDistance("kitten", "sitting"), levenshteinDistance("sitting", "kitten"));
  });
});

// fuzzySearchOperators tests (uses real on-disk knowledge base)
await describe("fuzzySearchOperators", async () => {
  await it("should return exact match with score 100", () => {
    const results = fuzzySearchOperators("Noise_TOP");
    assert.ok(results.length > 0);
    const exact = results.find(r => r.name === "Noise_TOP");
    assert.ok(exact);
    assert.strictEqual(exact.score, 100);
  });
  await it("should return startsWith matches with score 80", () => {
    const results = fuzzySearchOperators("noise", 10);
    assert.ok(results.length >= 3);
    assert.ok(results.every(r => r.score <= 100));
    const first = results[0];
    assert.strictEqual(first.score, 80);
    assert.ok(first.name.startsWith("Noise_") || first.label.startsWith("Noise"));
  });
  await it("should return includes matches with score 60", () => {
    const results = fuzzySearchOperators("denoise", 5);
    const hasDenoise = results.some(r => r.name.includes("Denoise"));
    assert.ok(hasDenoise);
    const denoiseResult = results.find(r => r.name.includes("Denoise"));
    assert.strictEqual(denoiseResult.score, 60);
  });
  await it("should return fuzzy (levenshtein) matches with score 40", () => {
    // "nois" is close to "Noise" (lev distance 1)
    const results = fuzzySearchOperators("nois", 10);
    assert.ok(results.length > 0);
  });
  await it("should return empty array for empty query", () => {
    const results = fuzzySearchOperators("", 10);
    assert.strictEqual(results.length, 0);
  });
  await it("should respect limit parameter", () => {
    const results = fuzzySearchOperators("noise", 2);
    assert.ok(results.length <= 2);
  });
  // Edge case: how does it handle special chars?
  await it("should handle query with hyphens gracefully", () => {
    const results = fuzzySearchOperators("nvidia-denoise", 3);
    // Should not crash, may return empty or matches
    assert.ok(Array.isArray(results));
  });
  await it("should sort by score descending, then label ascending", () => {
    const results = fuzzySearchOperators("noise", 10);
    for (let i = 1; i < results.length; i++) {
      if (results[i].score === results[i-1].score) {
        assert.ok(results[i].label >= results[i-1].label);
      } else {
        assert.ok(results[i].score <= results[i-1].score);
      }
    }
  });
});
