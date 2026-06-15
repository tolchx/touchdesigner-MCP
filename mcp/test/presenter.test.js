/**
 * Unit tests for Presenter — Token-Optimized Output Formatter
 *
 * Presenter is pure formatting logic (no external dependencies, no TD connection).
 * These tests verify all format functions at each detail level and response format.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatResponse,
  formatOperatorList,
  formatParameterList,
  formatErrorList,
  formatConnectionList,
  formatNetworkGraph,
  minimalJson,
  summaryMarkdown,
  detailedJson,
  detailedText,
} from "../dist/presenter.js";

// ─── Sample Data ─────────────────────────────────────────────────────────────

const sampleOperators = [
  {
    name: "noise1",
    path: "/project1/noise1",
    type: "noiseTOP",
    opType: "noiseTOP",
    family: "TOP",
    flags: { display: true, bypass: false },
  },
  {
    name: "blur1",
    path: "/project1/blur1",
    type: "blurTOP",
    opType: "blurTOP",
    family: "TOP",
    flags: { display: true, bypass: false },
  },
];

const sampleParameters = [
  {
    name: "filter",
    label: "Filter",
    val: "gaussian",
    expr: null,
    mode: "CONSTANT",
    style: "Menu",
    page: "Common",
  },
  {
    name: "radius",
    label: "Radius",
    val: 10,
    expr: null,
    mode: "CONSTANT",
    style: "Float",
    page: "Common",
  },
];

const sampleErrors = [
  {
    path: "/project1/noise1",
    severity: "error",
    message: "Missing input connection",
    source: "OP",
  },
  {
    path: "/project1/blur1",
    severity: "warning",
    message: "Cook time exceeds threshold",
    source: "Performance",
  },
];

const sampleConnections = [
  {
    fromOp: "/project1/noise1",
    fromOutput: 0,
    toOp: "/project1/blur1",
    toInput: 0,
  },
];

const sampleGraph = {
  nodes: [
    { path: "/project1/noise1", name: "noise1", type: "noiseTOP", family: "TOP" },
    { path: "/project1/blur1", name: "blur1", type: "blurTOP", family: "TOP" },
  ],
  edges: [
    { from: "/project1/noise1", to: "/project1/blur1" },
  ],
};

// ─── formatResponse ──────────────────────────────────────────────────────────

describe("formatResponse", () => {
  it("should pass through strings as-is (text format)", () => {
    const result = formatResponse("hello", { detailLevel: "summary", responseFormat: "text" });
    assert.strictEqual(result, "hello");
  });

  it("should wrap strings in JSON when format is json", () => {
    const result = formatResponse("hello", { detailLevel: "summary", responseFormat: "json" });
    assert.strictEqual(result, JSON.stringify({ message: "hello" }));
  });

  it("should dispatch to formatOperatorList when shape is operatorList", () => {
    const result = formatResponse(sampleOperators, { detailLevel: "minimal", responseFormat: "json" }, "operatorList");
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 2);
    // Minimal should only have name + path
    assert.strictEqual(Object.keys(parsed[0]).length, 2);
    assert.ok("name" in parsed[0]);
    assert.ok("path" in parsed[0]);
  });

  it("should dispatch to formatParameterList when shape is parameterList", () => {
    const result = formatResponse(sampleParameters, { detailLevel: "minimal", responseFormat: "json" }, "parameterList");
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 2);
  });

  it("should dispatch to formatErrorList when shape is errorList", () => {
    const result = formatResponse(sampleErrors, { detailLevel: "summary", responseFormat: "json" }, "errorList");
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 2);
  });

  it("should dispatch to formatConnectionList when shape is connectionList", () => {
    const result = formatResponse(sampleConnections, { detailLevel: "summary", responseFormat: "json" }, "connectionList");
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 1);
  });

  it("should dispatch to formatNetworkGraph when shape is graph", () => {
    const result = formatResponse(sampleGraph, { detailLevel: "summary", responseFormat: "json" }, "graph");
    const parsed = JSON.parse(result);
    assert.ok("nodes" in parsed);
    assert.ok("edges" in parsed);
  });
});

// ─── formatOperatorList ──────────────────────────────────────────────────────

describe("formatOperatorList", () => {
  it("should return empty JSON array for empty input (json)", () => {
    const result = formatOperatorList([], { detailLevel: "summary", responseFormat: "json" });
    assert.strictEqual(result, "[]");
  });

  it("should return empty markdown for empty input (markdown)", () => {
    const result = formatOperatorList([], { detailLevel: "summary", responseFormat: "markdown" });
    assert.strictEqual(result, "*(no operators)*");
  });

  it("should return empty text for empty input (text)", () => {
    const result = formatOperatorList([], { detailLevel: "summary", responseFormat: "text" });
    assert.strictEqual(result, "(no operators)");
  });

  it("should show only name+path in minimal detail", () => {
    const result = formatOperatorList(sampleOperators, { detailLevel: "minimal", responseFormat: "json" });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.length, 2);
    for (const item of parsed) {
      assert.strictEqual(Object.keys(item).length, 2);
      assert.ok("name" in item);
      assert.ok("path" in item);
    }
  });

  it("should include type+family in summary detail", () => {
    const result = formatOperatorList(sampleOperators, { detailLevel: "summary", responseFormat: "json" });
    const parsed = JSON.parse(result);
    for (const item of parsed) {
      assert.ok("name" in item);
      assert.ok("path" in item);
      assert.ok("type" in item);
      assert.ok("family" in item);
    }
  });

  it("should produce markdown table output", () => {
    const result = formatOperatorList(sampleOperators, { detailLevel: "minimal", responseFormat: "markdown" });
    assert.ok(result.includes("|"));
    assert.ok(result.includes("noise1"));
    assert.ok(result.includes("blur1"));
  });

  it("should produce bullet text output", () => {
    const result = formatOperatorList(sampleOperators, { detailLevel: "minimal", responseFormat: "text" });
    assert.ok(result.includes("noise1"));
    assert.ok(result.includes("blur1"));
    // Bullets use \u2022 (bullet character)
    assert.ok(result.includes("\u2022"));
  });
});

// ─── formatParameterList ─────────────────────────────────────────────────────

describe("formatParameterList", () => {
  it("should return empty JSON array for empty input", () => {
    const result = formatParameterList([], { detailLevel: "summary", responseFormat: "json" });
    assert.strictEqual(result, "[]");
  });

  it("should show only name in minimal detail", () => {
    const result = formatParameterList(sampleParameters, { detailLevel: "minimal", responseFormat: "json" });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.length, 2);
    for (const item of parsed) {
      assert.strictEqual(Object.keys(item).length, 1);
      assert.ok("name" in item);
    }
  });

  it("should include val+expr in summary detail", () => {
    const result = formatParameterList(sampleParameters, { detailLevel: "summary", responseFormat: "json" });
    const parsed = JSON.parse(result);
    for (const item of parsed) {
      assert.ok("name" in item);
      assert.ok("val" in item);
    }
  });

  it("should produce markdown for parameters", () => {
    const result = formatParameterList(sampleParameters, { detailLevel: "minimal", responseFormat: "markdown" });
    assert.ok(result.includes("filter"));
    assert.ok(result.includes("radius"));
  });
});

// ─── formatErrorList ─────────────────────────────────────────────────────────

describe("formatErrorList", () => {
  it("should return empty JSON array for empty input", () => {
    const result = formatErrorList([], { detailLevel: "summary", responseFormat: "json" });
    assert.strictEqual(result, "[]");
  });

  it("should include path+severity+message in summary", () => {
    const result = formatErrorList(sampleErrors, { detailLevel: "summary", responseFormat: "json" });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.length, 2);
    for (const item of parsed) {
      assert.ok("path" in item);
      assert.ok("severity" in item);
      assert.ok("message" in item);
    }
  });

  it("should show severity indicator in markdown", () => {
    const result = formatErrorList(sampleErrors, { detailLevel: "summary", responseFormat: "markdown" });
    assert.ok(result.includes("Missing input connection"));
    assert.ok(result.includes("Cook time exceeds threshold"));
  });

  it("should produce text with error/warning labels", () => {
    const result = formatErrorList(sampleErrors, { detailLevel: "summary", responseFormat: "text" });
    assert.ok(result.includes("error") || result.includes("ERROR"));
    assert.ok(result.includes("warning") || result.includes("WARNING"));
  });
});

// ─── formatConnectionList ────────────────────────────────────────────────────

describe("formatConnectionList", () => {
  it("should return empty JSON array for empty input", () => {
    const result = formatConnectionList([], { detailLevel: "summary", responseFormat: "json" });
    assert.strictEqual(result, "[]");
  });

  it("should include from/to in output", () => {
    const result = formatConnectionList(sampleConnections, { detailLevel: "summary", responseFormat: "json" });
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.length, 1);
    assert.ok("fromOp" in parsed[0]);
    assert.ok("toOp" in parsed[0]);
    assert.strictEqual(parsed[0].fromOp, "/project1/noise1");
    assert.strictEqual(parsed[0].toOp, "/project1/blur1");
  });

  it("should produce markdown for connections", () => {
    const result = formatConnectionList(sampleConnections, { detailLevel: "minimal", responseFormat: "markdown" });
    assert.ok(result.includes("noise1"));
    assert.ok(result.includes("blur1"));
  });
});

// ─── formatNetworkGraph ──────────────────────────────────────────────────────

describe("formatNetworkGraph", () => {
  it("should handle empty graph", () => {
    const result = formatNetworkGraph(
      { nodes: [], edges: [] },
      { detailLevel: "summary", responseFormat: "json" },
    );
    // Empty graph returns an empty object
    const parsed = JSON.parse(result);
    assert.strictEqual(Object.keys(parsed).length, 0);
  });

  it("should include nodes and edges", () => {
    const result = formatNetworkGraph(
      sampleGraph,
      { detailLevel: "summary", responseFormat: "json" },
    );
    const parsed = JSON.parse(result);
    assert.strictEqual(parsed.nodes.length, 2);
    assert.strictEqual(parsed.edges.length, 1);
    assert.strictEqual(parsed.nodes[0].name, "noise1");
    assert.strictEqual(parsed.nodes[1].name, "blur1");
    assert.strictEqual(parsed.edges[0].from, "/project1/noise1");
    assert.strictEqual(parsed.edges[0].to, "/project1/blur1");
  });

  it("should produce markdown representation", () => {
    const result = formatNetworkGraph(
      sampleGraph,
      { detailLevel: "summary", responseFormat: "markdown" },
    );
    assert.ok(result.includes("noise1"));
    assert.ok(result.includes("blur1"));
    // Markdown should include some separators
    assert.ok(result.includes("→") || result.includes("->") || result.includes("|"));
  });
});

// ─── Convenience Exports ────────────────────────────────────────────────────

describe("convenience exports", () => {
  it("minimalJson should produce minimal JSON", () => {
    const result = minimalJson([{ name: "test", path: "/a", type: "noiseTOP" }], "operatorList");
    assert.ok(typeof result === "string");
    const parsed = JSON.parse(result);
    // minimal — should have both items reduced
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 1);
    // Only name+path in minimal
    assert.strictEqual(Object.keys(parsed[0]).length, 2);
    assert.ok("name" in parsed[0]);
    assert.ok("path" in parsed[0]);
  });

  it("summaryMarkdown should produce markdown output", () => {
    const result = summaryMarkdown(sampleOperators, "operatorList");
    assert.ok(typeof result === "string");
    assert.ok(result.includes("|") || result.includes("\n"));
  });

  it("detailedJson should include all fields", () => {
    const ops = [
      {
        name: "full",
        path: "/a",
        type: "noiseTOP",
        opType: "noiseTOP",
        family: "TOP",
        flags: { display: true },
      },
    ];
    const result = detailedJson(ops, "operatorList");
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed[0].flags !== undefined);
  });

  it("detailedText should produce readable text", () => {
    const result = detailedText(sampleOperators, "operatorList");
    assert.ok(typeof result === "string");
    assert.ok(result.length > 0);
  });
});
