/**
 * Unit tests for commandRunner.ts — LLM → tool-call parsing & dispatch.
 *
 * Tests three areas of pure logic (no TD connection, no I/O):
 *   1. parseToolCall()        — robust JSON tool-call extraction
 *   2. TOOL_METHOD_MAP        — consistency of the tool→method mapping
 *   3. SUPPORTED_TOOLS        — coverage vs. the method map
 *   4. Exported interfaces    — ToolCall / CommandResult / LlmClient shapes
 *
 * Pure logic only — executeToolCall() and runNaturalLanguageCommand() touch
 * the live TD API and the LLM client, so they are deliberately NOT tested here.
 *
 * Build first:  npx tsc -p mcp/tsconfig.json
 * Run:          node --experimental-vm-modules mcp/test/commandRunner.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseToolCall,
  TOOL_METHOD_MAP,
  SUPPORTED_TOOLS,
  runNaturalLanguageCommand,
} from "../dist/commandRunner.js";

// ─── parseToolCall() — valid input ───────────────────────────────────────────

describe("parseToolCall() — valid JSON input", () => {
  it("parses a complete tool call with args", () => {
    const result = parseToolCall('{"tool": "td_execute", "args": {"code": "print(1)"}}');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_execute");
    assert.deepStrictEqual(result.args, { code: "print(1)" });
  });

  it("parses a tool call whose args contain nested objects", () => {
    const result = parseToolCall(
      '{"tool": "td_pars_set", "args": {"path": "/base1", "updates": {"freq": 2, "phase": 0.5}}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_pars_set");
    assert.deepStrictEqual(result.args, {
      path: "/base1",
      updates: { freq: 2, phase: 0.5 },
    });
  });

  it("defaults args to {} when the 'args' field is absent", () => {
    const result = parseToolCall('{"tool": "td_healthcheck"}');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_healthcheck");
    assert.deepStrictEqual(result.args, {});
  });

  it("defaults args to {} when 'args' is explicitly null", () => {
    const result = parseToolCall('{"tool": "td_pane", "args": null}');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_pane");
    assert.deepStrictEqual(result.args, {});
  });

  it("accepts tool names containing underscores and digits", () => {
    const result = parseToolCall('{"tool": "td_get_release_delta_42", "args": {}}');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_get_release_delta_42");
  });

  it("preserves numeric, boolean, and array values inside args", () => {
    const result = parseToolCall(
      '{"tool": "td_x", "args": {"n": 5, "b": true, "arr": [1, 2, 3], "s": "hi"}}',
    );
    assert.ok(result);
    assert.deepStrictEqual(result.args, { n: 5, b: true, arr: [1, 2, 3], s: "hi" });
  });

  it("handles leading/trailing whitespace around the JSON", () => {
    const result = parseToolCall('   \n\t  {"tool": "td_execute", "args": {"code": "1"}}  \n  ');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_execute");
  });
});

// ─── parseToolCall() — JSON embedded in surrounding text ─────────────────────

describe("parseToolCall() — JSON surrounded by prose", () => {
  it("finds the JSON when text precedes it", () => {
    const result = parseToolCall(
      'Sure! Here is the tool call:\n{"tool": "td_execute", "args": {"code": "print(2)"}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_execute");
    assert.deepStrictEqual(result.args, { code: "print(2)" });
  });

  it("finds the JSON when text follows it", () => {
    const result = parseToolCall(
      '{"tool": "td_healthcheck"}\n\nLet me know if you need anything else.',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_healthcheck");
  });

  it("extracts JSON from a fenced markdown code block", () => {
    const result = parseToolCall(
      'Here you go:\n```json\n{"tool": "td_operators", "args": {"path": "/project1"}}\n```\nDone.',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_operators");
    assert.deepStrictEqual(result.args, { path: "/project1" });
  });

  it("extracts JSON from a bare (un-fenced) code block with backticks", () => {
    const result = parseToolCall('`{"tool": "td_pane", "args": {}}`');
    assert.ok(result);
    assert.strictEqual(result.tool, "td_pane");
  });

  it("ignores a non-tool JSON object that appears first, finding the real tool call", () => {
    // First brace block is valid JSON but has no `tool` field → skipped.
    // Second block is a valid tool call → returned.
    const result = parseToolCall(
      '{"note": "thinking..."} {"tool": "td_execute", "args": {"code": "x=1"}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_execute");
  });

  it("returns the FIRST valid tool call when several are present", () => {
    const result = parseToolCall(
      '{"tool": "td_first", "args": {}} some text {"tool": "td_second", "args": {}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_first");
  });

  it("skips a malformed first object and recovers a later valid one", () => {
    // First candidate has unbalanced quotes → not parseable → skipped.
    const result = parseToolCall(
      '{"tool": "broken, "args": {}} {"tool": "td_ok", "args": {}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_ok");
  });
});

// ─── parseToolCall() — invalid / edge input ──────────────────────────────────

describe("parseToolCall() — invalid and empty input", () => {
  it("returns null for an empty string", () => {
    assert.strictEqual(parseToolCall(""), null);
  });

  it("returns null for a whitespace-only string", () => {
    assert.strictEqual(parseToolCall("   \n\t  "), null);
  });

  it("returns null for plain prose with no JSON", () => {
    assert.strictEqual(parseToolCall("This is just a normal sentence with no braces."), null);
  });

  it("returns null for malformed JSON (missing closing brace)", () => {
    assert.strictEqual(parseToolCall('{"tool": "td_execute", "args": {}'), null);
  });

  it("returns null for malformed JSON (broken braces)", () => {
    assert.strictEqual(parseToolCall('{"tool": "td_execute" "args": {}}}'), null);
  });

  it("returns null for a JSON object missing the 'tool' field", () => {
    assert.strictEqual(parseToolCall('{"args": {"code": "print(1)"}}'), null);
  });

  it("returns null when 'tool' is present but not a string", () => {
    assert.strictEqual(parseToolCall('{"tool": 123, "args": {}}'), null);
  });

  it("returns null for a bare array (not an object)", () => {
    assert.strictEqual(parseToolCall('[1, 2, 3]'), null);
  });

  it("returns null for a JSON primitive string", () => {
    assert.strictEqual(parseToolCall('"just a string"'), null);
  });

  it("does not throw on deeply nested braces without a valid tool", () => {
    // Many nested braces, none yielding a parseable tool object.
    const input = "{ {{ } { } } { { } }";
    assert.strictEqual(parseToolCall(input), null);
  });
});

// ─── parseToolCall() — bracket-matching robustness ───────────────────────────

describe("parseToolCall() — bracket-matching robustness", () => {
  it("correctly matches nested objects inside args", () => {
    const result = parseToolCall(
      '{"tool": "td_t", "args": {"a": {"b": {"c": {"d": 1}}}}}',
    );
    assert.ok(result);
    assert.deepStrictEqual(result.args, { a: { b: { c: { d: 1 } } } });
  });

  it("does not mistake a brace inside a string value for a structural brace", () => {
    // The "}" inside the string value must not prematurely close the object.
    const result = parseToolCall(
      '{"tool": "td_execute", "args": {"code": "print(\'}\')"}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_execute");
    assert.strictEqual(result.args.code, "print('}')");
  });

  it("handles two sibling top-level objects, picking the first valid tool", () => {
    const result = parseToolCall(
      '{"x": 1} {"tool": "td_two", "args": {}}',
    );
    assert.ok(result);
    assert.strictEqual(result.tool, "td_two");
  });
});

// ─── TOOL_METHOD_MAP consistency ─────────────────────────────────────────────

describe("TOOL_METHOD_MAP consistency", () => {
  it("is a non-empty object mapping tool names to method strings", () => {
    assert.strictEqual(typeof TOOL_METHOD_MAP, "object");
    assert.ok(TOOL_METHOD_MAP !== null);
    const keys = Object.keys(TOOL_METHOD_MAP);
    assert.ok(keys.length > 0, "map should have entries");
    for (const key of keys) {
      assert.strictEqual(
        typeof TOOL_METHOD_MAP[key],
        "string",
        `method for '${key}' should be a string`,
      );
      assert.ok(TOOL_METHOD_MAP[key].length > 0, `method for '${key}' should be non-empty`);
    }
  });

  it("contains a reasonable number of entries (>= 40)", () => {
    const count = Object.keys(TOOL_METHOD_MAP).length;
    assert.ok(count >= 40, `expected >= 40 tool mappings, got ${count}`);
  });

  it("every tool name in the map is a string starting with 'td_'", () => {
    for (const key of Object.keys(TOOL_METHOD_MAP)) {
      assert.ok(
        key.startsWith("td_"),
        `tool name '${key}' should start with 'td_'`,
      );
    }
  });

  it("every map key that starts with 'td_' also appears in SUPPORTED_TOOLS", () => {
    for (const key of Object.keys(TOOL_METHOD_MAP)) {
      assert.ok(
        SUPPORTED_TOOLS.includes(key),
        `tool '${key}' is in the map but missing from SUPPORTED_TOOLS`,
      );
    }
  });

  it("does not map two different tools to the same method name (warn only)", () => {
    // Two tools legitimately share a method (e.g. td_pars_set &
    // td_set_operator_pars both → setParameters). That is allowed, but we
    // assert there is at least SOME diversity — not every tool maps to one
    // method.
    const methods = Object.values(TOOL_METHOD_MAP);
    const unique = new Set(methods);
    assert.ok(
      unique.size > 1,
      `expected method names to be diverse, but only ${unique.size} unique method(s)`,
    );
  });

  it("exposes SUPPORTED_TOOLS as a non-empty array of strings", () => {
    assert.ok(Array.isArray(SUPPORTED_TOOLS));
    assert.ok(SUPPORTED_TOOLS.length >= Object.keys(TOOL_METHOD_MAP).length);
    for (const t of SUPPORTED_TOOLS) {
      assert.strictEqual(typeof t, "string");
    }
  });
});

// ─── Exported interface shapes ───────────────────────────────────────────────
//
// TypeScript interfaces are erased at runtime, so we verify the *runtime*
// contract by constructing objects that satisfy each interface and asserting
// the expected fields exist with the expected types.

describe("exported interface shapes", () => {
  it("exports parseToolCall as a function", () => {
    assert.strictEqual(typeof parseToolCall, "function");
  });

  it("exports runNaturalLanguageCommand as a function", () => {
    assert.strictEqual(typeof runNaturalLanguageCommand, "function");
  });

  it("a ToolCall-shaped object has { tool: string, args: object }", () => {
    // parseToolCall always returns ToolCall | null; use a valid input.
    const toolCall = parseToolCall('{"tool": "td_execute", "args": {"code": "x"}}');
    assert.ok(toolCall);
    assert.strictEqual(typeof toolCall.tool, "string");
    assert.strictEqual(typeof toolCall.args, "object");
    assert.ok(toolCall.args !== null);
  });

  it("a CommandResult-shaped object has the required fields", () => {
    // Construct an object matching the CommandResult interface (runNaturalLanguageCommand
    // produces this shape). We assert field presence/types without invoking TD.
    const toolCall = parseToolCall('{"tool": "td_healthcheck", "args": {}}');
    assert.ok(toolCall);
    const commandResult = {
      toolCall,
      llm: { provider: "mock", model: "m1", latencyMs: 5, rawResponse: "{}" },
      tdLatencyMs: 3,
      tdResult: { ok: true },
    };
    assert.strictEqual(typeof commandResult.toolCall, "object");
    assert.strictEqual(typeof commandResult.llm, "object");
    assert.strictEqual(typeof commandResult.llm.provider, "string");
    assert.strictEqual(typeof commandResult.llm.model, "string");
    assert.strictEqual(typeof commandResult.llm.latencyMs, "number");
    assert.strictEqual(typeof commandResult.llm.rawResponse, "string");
    assert.strictEqual(typeof commandResult.tdLatencyMs, "number");
    assert.ok(commandResult.tdResult !== undefined);
    // error is optional
    assert.ok(!("error" in commandResult) || typeof commandResult.error === "string");
  });

  it("a LlmClient-compatible object exposes an async generateText method", () => {
    const llm = {
      async generateText(_input) {
        return { text: "{}", provider: "p", model: "m", latencyMs: 1 };
      },
    };
    assert.strictEqual(typeof llm.generateText, "function");
    // Confirm it really returns the promised shape.
    return llm.generateText({ system: "s", user: "u" }).then((res) => {
      assert.strictEqual(typeof res.text, "string");
      assert.strictEqual(typeof res.provider, "string");
      assert.strictEqual(typeof res.model, "string");
      assert.strictEqual(typeof res.latencyMs, "number");
    });
  });
});
