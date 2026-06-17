/**
 * Unit tests for classify.ts — TD healthcheck issue classifier.
 *
 * Tests three exported pure functions:
 *   - classifyIssue(issue)          → ClassifiedIssue
 *   - classifyAllIssues(ops[])      → ClassificationResult
 *   - buildClassifyPythonCode(json) → string
 *
 * Pure logic, no module-level state, no I/O. Imports from compiled dist.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyIssue,
  classifyAllIssues,
  buildClassifyPythonCode,
} from "../dist/tools/classify.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Mirror of the source's escaping logic, used to predict the exact string
 * embedded into the generated Python code.
 *
 *   .replace(/\\/g, "\\\\")   — double backslashes
 *   .replace(/'/g, "\\'")     — escape single quotes
 *   .replace(/\$/g, "\\$")    — escape dollar signs
 */
function escapeLike(healthJson) {
  return healthJson
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$");
}

// ─── classifyIssue — expression_error patterns ───────────────────────────────

describe("classifyIssue — expression_error patterns", () => {
  const cases = [
    ["AttributeError: 'obj' has foo", "AttributeError"],
    ["NameError: name 'x' is not defined", "NameError"],
    ["SyntaxError: invalid syntax on line 2", "SyntaxError"],
    ["TypeError: unsupported operand type", "TypeError"],
    ["the variable boom is not defined here", "not defined"],
    ["object has no attribute 'foo'", "has no attribute"],
  ];
  for (const [text, label] of cases) {
    it(`classifies '${label}' as expression_error`, () => {
      const r = classifyIssue({ path: "/op1", errors: text });
      assert.equal(r.category, "expression_error");
      assert.equal(r.path, "/op1");
      assert.equal(r.error, text);
      assert.equal(r.warning, null);
      assert.ok(Array.isArray(r.suggested_actions));
      assert.ok(r.suggested_actions.length > 0);
    });
  }
});

// ─── classifyIssue — cook_loop patterns ──────────────────────────────────────

describe("classifyIssue — cook_loop patterns", () => {
  it("classifies literal 'Cook dependency loop' as cook_loop", () => {
    const r = classifyIssue({ path: "/c", errors: "Cook dependency loop detected on /x" });
    assert.equal(r.category, "cook_loop");
  });

  it("classifies cook.*loop regex ('cooking loop') as cook_loop", () => {
    // "cook.*loop" is a regex pattern, not a literal — "cooking loop" matches.
    const r = classifyIssue({ path: "/c", errors: "a cooking loop was found" });
    assert.equal(r.category, "cook_loop");
  });

  it("classifies 'cook loop' (regex with single space) as cook_loop", () => {
    const r = classifyIssue({ path: "/c", errors: "possible cook loop" });
    assert.equal(r.category, "cook_loop");
  });
});

// ─── classifyIssue — missing_file patterns ───────────────────────────────────

describe("classifyIssue — missing_file patterns", () => {
  const cases = [
    ["File not found: /a/b/c.png", "File not found"],
    ["the file not found here", "file not found"],
    ["No such file or directory: x.tox", "No such file"],
    ["FileNotFoundError: missing.txt", "FileNotFoundError"],
  ];
  for (const [text, label] of cases) {
    it(`classifies '${label}' as missing_file`, () => {
      const r = classifyIssue({ path: "/f", errors: text });
      assert.equal(r.category, "missing_file");
    });
  }
});

// ─── classifyIssue — glsl_error patterns ─────────────────────────────────────

describe("classifyIssue — glsl_error patterns", () => {
  it("classifies literal 'Compile failed' as glsl_error", () => {
    const r = classifyIssue({ path: "/g", errors: "GLSL Compile failed" });
    assert.equal(r.category, "glsl_error");
  });

  it("classifies compile.*error regex ('compiler error') as glsl_error", () => {
    const r = classifyIssue({ path: "/g", errors: "shader compiler error on line 5" });
    assert.equal(r.category, "glsl_error");
  });

  it("classifies GLSL.*error regex ('GLSL shader error') as glsl_error", () => {
    const r = classifyIssue({ path: "/g", errors: "GLSL shader error on line 3" });
    assert.equal(r.category, "glsl_error");
  });

  it("classifies shader.*error regex ('shader build error') as glsl_error", () => {
    const r = classifyIssue({ path: "/g", errors: "shader build error" });
    assert.equal(r.category, "glsl_error");
  });
});

// ─── classifyIssue — fallback & edge cases ───────────────────────────────────

describe("classifyIssue — fallback & edge cases", () => {
  it("falls back to needs_manual for unrelated text", () => {
    const r = classifyIssue({ path: "/x", errors: "operator timed out" });
    assert.equal(r.category, "needs_manual");
  });

  it("matches case-insensitively (lowercase 'attributeerror')", () => {
    const r = classifyIssue({ path: "/x", errors: "attributeerror happened" });
    assert.equal(r.category, "expression_error");
  });

  it("matches case-insensitively (mixed-case 'nameERROR')", () => {
    const r = classifyIssue({ path: "/x", errors: "a nameERROR boom" });
    assert.equal(r.category, "expression_error");
  });

  it("matches a pattern present only in the warnings field", () => {
    const r = classifyIssue({ path: "/x", warnings: "AttributeError in expr" });
    assert.equal(r.category, "expression_error");
    assert.equal(r.error, null);
    assert.equal(r.warning, "AttributeError in expr");
  });

  it("empty errors and warnings → needs_manual with null fields", () => {
    const r = classifyIssue({ path: "/x", errors: "", warnings: "" });
    assert.equal(r.category, "needs_manual");
    assert.equal(r.error, null);
    assert.equal(r.warning, null);
  });

  it("undefined errors and warnings → needs_manual with null fields", () => {
    const r = classifyIssue({ path: "/x" });
    assert.equal(r.category, "needs_manual");
    assert.equal(r.error, null);
    assert.equal(r.warning, null);
  });

  it("null errors → needs_manual with null error", () => {
    const r = classifyIssue({ path: "/x", errors: null });
    assert.equal(r.category, "needs_manual");
    assert.equal(r.error, null);
    assert.equal(r.warning, null);
  });

  it("returns a non-empty suggested_actions array for needs_manual", () => {
    const r = classifyIssue({ path: "/x", errors: "weird unknown thing" });
    assert.ok(Array.isArray(r.suggested_actions));
    assert.ok(r.suggested_actions.length >= 1);
    assert.ok(
      r.suggested_actions.some((a) => /manual/i.test(a)),
      "needs_manual actions should mention manual inspection"
    );
  });

  it("returns cook_loop-specific suggested_actions", () => {
    const r = classifyIssue({ path: "/x", errors: "Cook dependency loop" });
    assert.ok(
      r.suggested_actions.some((a) => /circular dependency/i.test(a)),
      "cook_loop actions should mention circular dependency"
    );
  });

  it("preserves the path field exactly", () => {
    const r = classifyIssue({ path: "/project1/container/op", errors: "TypeError" });
    assert.equal(r.path, "/project1/container/op");
  });

  it("preserves both error and warning fields when provided", () => {
    const r = classifyIssue({
      path: "/x",
      errors: "TypeError boom",
      warnings: "low memory",
    });
    assert.equal(r.error, "TypeError boom");
    assert.equal(r.warning, "low memory");
  });

  it("first matching category wins (expression_error checked before missing_file)", () => {
    // Text matches BOTH TypeError (expression_error) and 'file not found' (missing_file).
    // expression_error must win because it is checked first.
    const r = classifyIssue({ path: "/x", errors: "TypeError: file not found" });
    assert.equal(r.category, "expression_error");
  });
});

// ─── classifyAllIssues ───────────────────────────────────────────────────────

describe("classifyAllIssues", () => {
  it("empty array → total 0, empty counts, empty summary, empty issues", () => {
    const r = classifyAllIssues([]);
    assert.equal(r.total, 0);
    assert.deepEqual(r.counts, {});
    assert.deepEqual(r.summary, {});
    assert.deepEqual(r.issues, []);
  });

  it("single issue → total 1", () => {
    const r = classifyAllIssues([{ path: "/a", errors: "TypeError" }]);
    assert.equal(r.total, 1);
  });

  it("single issue → counts has the category with value 1", () => {
    const r = classifyAllIssues([{ path: "/a", errors: "TypeError" }]);
    assert.equal(r.counts["expression_error"], 1);
  });

  it("single issue → summary has the category key with one entry", () => {
    const r = classifyAllIssues([{ path: "/a", errors: "TypeError" }]);
    assert.ok(Array.isArray(r.summary["expression_error"]));
    assert.equal(r.summary["expression_error"].length, 1);
  });

  it("multiple issues, same category → aggregated count", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "TypeError" },
      { path: "/b", errors: "NameError" },
      { path: "/c", errors: "SyntaxError" },
    ]);
    assert.equal(r.total, 3);
    assert.equal(r.counts["expression_error"], 3);
    assert.equal(r.summary["expression_error"].length, 3);
    assert.equal(Object.keys(r.counts).length, 1);
  });

  it("multiple different categories → separate counts", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "TypeError" },
      { path: "/b", errors: "Cook dependency loop" },
      { path: "/c", errors: "File not found" },
    ]);
    assert.equal(r.counts["expression_error"], 1);
    assert.equal(r.counts["cook_loop"], 1);
    assert.equal(r.counts["missing_file"], 1);
    assert.equal(Object.keys(r.counts).length, 3);
  });

  it("multiple different categories → separate summary entries", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "TypeError" },
      { path: "/b", errors: "Compile failed" },
    ]);
    assert.equal(r.summary["expression_error"].length, 1);
    assert.equal(r.summary["glsl_error"].length, 1);
    assert.equal(Object.keys(r.summary).length, 2);
  });

  it("issues array preserves path/error/warning/category fields", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "TypeError boom", warnings: "low mem" },
    ]);
    assert.equal(r.issues[0].path, "/a");
    assert.equal(r.issues[0].error, "TypeError boom");
    assert.equal(r.issues[0].warning, "low mem");
    assert.equal(r.issues[0].category, "expression_error");
    assert.ok(Array.isArray(r.issues[0].suggested_actions));
  });

  it("issues array length equals total", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "x is not defined" },
      { path: "/b", warnings: "GLSL shader error" },
    ]);
    assert.equal(r.issues.length, r.total);
    assert.equal(r.issues.length, 2);
  });

  it("summary entries reference the same objects as the issues array", () => {
    const r = classifyAllIssues([{ path: "/a", errors: "TypeError" }]);
    assert.strictEqual(r.summary["expression_error"][0], r.issues[0]);
  });

  it("mixed matched + needs_manual → correct counts", () => {
    const r = classifyAllIssues([
      { path: "/a", errors: "TypeError" },
      { path: "/b", errors: "operator timed out" },
      { path: "/c", errors: "File not found" },
    ]);
    assert.equal(r.counts["expression_error"], 1);
    assert.equal(r.counts["needs_manual"], 1);
    assert.equal(r.counts["missing_file"], 1);
    assert.equal(r.total, 3);
  });
});

// ─── buildClassifyPythonCode ─────────────────────────────────────────────────

describe("buildClassifyPythonCode", () => {
  it("returns a non-empty string", () => {
    const code = buildClassifyPythonCode('{"operators":[]}');
    assert.equal(typeof code, "string");
    assert.ok(code.length > 0);
  });

  it("contains an import of json", () => {
    const code = buildClassifyPythonCode("{}");
    assert.ok(code.includes("import json"));
  });

  it("imports both json and re (on one line)", () => {
    const code = buildClassifyPythonCode("{}");
    assert.match(code, /import\s+json,\s*re/);
  });

  it("embeds the escaped JSON input verbatim", () => {
    const input = '{"operators":[{"path":"/a"}]}';
    const code = buildClassifyPythonCode(input);
    assert.ok(
      code.includes(escapeLike(input)),
      "escaped JSON must appear verbatim in the generated code"
    );
  });

  it("contains all four CATEGORY_PATTERNS tuples", () => {
    const code = buildClassifyPythonCode("{}");
    assert.ok(code.includes("('expression_error'"));
    assert.ok(code.includes("('cook_loop'"));
    assert.ok(code.includes("('missing_file'"));
    assert.ok(code.includes("('glsl_error'"));
  });

  it("contains a specific raw pattern (r'AttributeError')", () => {
    const code = buildClassifyPythonCode("{}");
    assert.ok(code.includes("r'AttributeError'"));
  });

  it("contains print(json.dumps(...))", () => {
    const code = buildClassifyPythonCode("{}");
    assert.ok(code.includes("print(json.dumps("));
  });

  it("escapes single quotes in the input", () => {
    // Input JSON value contains an apostrophe: it's broken
    const input = '{"msg":"it\'s broken"}';
    const code = buildClassifyPythonCode(input);
    // The single quote must be backslash-escaped in the embedded JSON.
    assert.ok(code.includes("it\\'s broken"));
  });

  it("does not corrupt plain JSON structure (no special chars)", () => {
    const input = '{"operators":[{"path":"/proj/op1"}]}';
    const code = buildClassifyPythonCode(input);
    assert.ok(
      code.includes(input),
      "plain JSON with no special chars should appear unchanged"
    );
  });

  it("handles empty JSON input", () => {
    const code = buildClassifyPythonCode("");
    assert.equal(typeof code, "string");
    assert.ok(code.length > 0, "template body should still be present");
    assert.ok(code.includes("health_json = ''"), "empty input → empty health_json string");
  });

  it("escapes backslashes in the input", () => {
    // JSON.stringify of {p:"a\b"} yields a JSON text containing a doubled backslash.
    const input = JSON.stringify({ p: "a\\b" });
    assert.notEqual(escapeLike(input), input, "sanity: escaping should change backslash input");
    const code = buildClassifyPythonCode(input);
    assert.ok(code.includes(escapeLike(input)));
  });

  it("escapes dollar signs in the input", () => {
    const input = '{"cost":"$5"}';
    assert.notEqual(escapeLike(input), input, "sanity: escaping should change dollar input");
    const code = buildClassifyPythonCode(input);
    assert.ok(code.includes(escapeLike(input)));
    assert.ok(code.includes("\\$5"), "dollar should be escaped to \\$");
  });
});
