/**
 * Unit tests for helpers.ts — MCP tool response helpers.
 *
 * Tests two exported pure functions:
 *   - ok(data)  → { content: [{ type: "text", text }] }
 *   - err(err)  → { content: [{ type: "text", text }], isError: true }
 *
 * Pure logic, no module-level state, no I/O. Imports from compiled dist.
 * Build first: npx tsc -p mcp/tsconfig.json
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ok, err } from "../dist/helpers.js";

// ─── ok() — response shape ───────────────────────────────────────────────────

describe("ok() — response shape", () => {
  it("returns an object with a content array", () => {
    const result = ok({});
    assert.ok(Array.isArray(result.content), "content should be an array");
  });

  it("content has exactly one item", () => {
    const result = ok({});
    assert.strictEqual(result.content.length, 1);
  });

  it("content item has type 'text'", () => {
    const result = ok({});
    assert.strictEqual(result.content[0].type, "text");
  });

  it("content item text is a string", () => {
    const result = ok({});
    assert.strictEqual(typeof result.content[0].text, "string");
  });

  it("does NOT set isError", () => {
    const result = ok({});
    assert.strictEqual("isError" in result, false);
    assert.strictEqual(result.isError, undefined);
  });
});

// ─── ok() — serialization ────────────────────────────────────────────────────

describe("ok() — data serialization", () => {
  it("stringifies a plain object with 2-space indentation", () => {
    const result = ok({ foo: "bar" });
    assert.strictEqual(result.content[0].text, '{\n  "foo": "bar"\n}');
  });

  it("stringifies a nested object", () => {
    const result = ok({ a: { b: { c: 1 } } });
    assert.strictEqual(
      result.content[0].text,
      '{\n  "a": {\n    "b": {\n      "c": 1\n    }\n  }\n}',
    );
  });

  it("stringifies an array", () => {
    const result = ok([1, 2, 3]);
    assert.strictEqual(result.content[0].text, "[\n  1,\n  2,\n  3\n]");
  });

  it("stringifies an empty array", () => {
    const result = ok([]);
    assert.strictEqual(result.content[0].text, "[]");
  });

  it("stringifies an empty object", () => {
    const result = ok({});
    assert.strictEqual(result.content[0].text, "{}");
  });

  it("stringifies a string", () => {
    const result = ok("hello");
    assert.strictEqual(result.content[0].text, '"hello"');
  });

  it("stringifies a number", () => {
    const result = ok(42);
    assert.strictEqual(result.content[0].text, "42");
  });

  it("stringifies a boolean", () => {
    const result = ok(true);
    assert.strictEqual(result.content[0].text, "true");
  });

  it("stringifies null", () => {
    const result = ok(null);
    assert.strictEqual(result.content[0].text, "null");
  });

  it("stringifies undefined", () => {
    const result = ok(undefined);
    assert.strictEqual(result.content[0].text, undefined);
  });

  it("round-trips JSON.parse to recover the original object", () => {
    const data = { name: "TD", count: 7, active: true, nested: { x: [1, 2] } };
    const result = ok(data);
    assert.deepEqual(JSON.parse(result.content[0].text), data);
  });

  it("handles strings with special characters", () => {
    const result = ok({ msg: 'quote" and newline\nhere' });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.msg, 'quote" and newline\nhere');
  });
});

// ─── err() — response shape ──────────────────────────────────────────────────

describe("err() — response shape", () => {
  it("returns an object with a content array", () => {
    const result = err("fail");
    assert.ok(Array.isArray(result.content), "content should be an array");
  });

  it("content has exactly one item", () => {
    const result = err("fail");
    assert.strictEqual(result.content.length, 1);
  });

  it("content item has type 'text'", () => {
    const result = err("fail");
    assert.strictEqual(result.content[0].type, "text");
  });

  it("sets isError to exactly true", () => {
    const result = err("fail");
    assert.strictEqual("isError" in result, true);
    assert.strictEqual(result.isError, true);
  });
});

// ─── err() — string error ────────────────────────────────────────────────────

describe("err() — string error", () => {
  it("uses the string directly, wrapped in { error }", () => {
    const result = err("something broke");
    assert.strictEqual(
      result.content[0].text,
      '{\n  "error": "something broke"\n}',
    );
  });

  it("handles an empty string", () => {
    const result = err("");
    assert.strictEqual(result.content[0].text, '{\n  "error": ""\n}');
  });

  it("handles a string with special JSON characters", () => {
    const result = err('quote" tab\there');
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, 'quote" tab\there');
  });
});

// ─── err() — Error instance ──────────────────────────────────────────────────

describe("err() — Error instance", () => {
  it("uses error.message", () => {
    const result = err(new Error("fail"));
    assert.strictEqual(result.content[0].text, '{\n  "error": "fail"\n}');
  });

  it("uses message from a subclassed error", () => {
    const result = err(new TypeError("not a function"));
    assert.strictEqual(
      result.content[0].text,
      '{\n  "error": "not a function"\n}',
    );
  });

  it("handles an Error with an empty message", () => {
    const result = err(new Error(""));
    assert.strictEqual(result.content[0].text, '{\n  "error": ""\n}');
  });
});

// ─── err() — unknown / non-Error types ───────────────────────────────────────

describe("err() — unknown / non-Error types", () => {
  it("stringifies a number via JSON.stringify", () => {
    const result = err(42);
    assert.strictEqual(result.content[0].text, '{\n  "error": "42"\n}');
  });

  it("stringifies a plain object via JSON.stringify", () => {
    const result = err({ code: 500, detail: "boom" });
    assert.strictEqual(
      result.content[0].text,
      '{\n  "error": "{\\"code\\":500,\\"detail\\":\\"boom\\"}"\n}',
    );
  });

  it("stringifies an array via JSON.stringify", () => {
    const result = err([1, 2, 3]);
    // JSON.stringify([1,2,3]) with no indent → "[1,2,3]", which itself is
    // embedded as a string value inside the outer JSON.
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.error, "[1,2,3]");
  });

  it("stringifies a boolean via JSON.stringify", () => {
    const result = err(false);
    assert.strictEqual(result.content[0].text, '{\n  "error": "false"\n}');
  });
});

// ─── err() — null / undefined ────────────────────────────────────────────────

describe("err() — null and undefined", () => {
  it("handles null gracefully", () => {
    const result = err(null);
    assert.strictEqual(result.content[0].text, '{\n  "error": "null"\n}');
  });

  it("handles undefined gracefully (no throw)", () => {
    // JS gotcha: JSON.stringify(undefined) returns the value `undefined`
    // (not the string "undefined"), so `message` becomes undefined, and
    // JSON.stringify({ error: undefined }) omits the key → "{}".
    // The contract here is "no crash" — the result is still a well-formed
    // MCP response with isError: true.
    const result = err(undefined);
    assert.strictEqual(result.content[0].text, "{}");
    assert.strictEqual(result.isError, true);
  });

  it("still sets isError for null input", () => {
    const result = err(null);
    assert.strictEqual(result.isError, true);
  });

  it("still sets isError for undefined input", () => {
    const result = err(undefined);
    assert.strictEqual(result.isError, true);
  });
});
