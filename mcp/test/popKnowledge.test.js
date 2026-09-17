/**
 * Offline tests for POP knowledge-base parameter validation and the
 * corpus-derived POP network templates (popKnowledge.ts / popsValidate.ts /
 * applyNetwork.ts param gate). No TouchDesigner required.
 *
 * Sources under test:
 *   data/pops/knowledge/pop_operators.json — 101 POP types, real build params
 *   data/templates/pops/ (generated from popsValidate.ts corpus templates)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import {
  loadPopKnowledge,
  getPopInfo,
  listPopTypes,
  suggestParameterNames,
  formatUnknownParameterError,
  resetPopKnowledgeCache,
} from "../dist/popKnowledge.js";
import {
  validatePopParameters,
  assertValidPopParameters,
  validateParameterNamesForPath,
  resolvePopTypeForPath,
  POP_NETWORK_TEMPLATES,
  searchPopTemplates,
  getPopTemplateByName,
} from "../dist/popsValidate.js";
import { applyNetworkGraph } from "../dist/applyNetwork.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POP_OPS_PATH = resolve(__dirname, "../data/pops/knowledge/pop_operators.json");

/** Raw knowledge base for cross-checking template params against the build. */
function loadRawPopOperators() {
  return JSON.parse(fs.readFileSync(POP_OPS_PATH, "utf-8")).operators;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. popKnowledge — knowledge base access
// ═══════════════════════════════════════════════════════════════════════════

describe("popKnowledge — knowledge base", () => {
  it("loads the validated POP types (97 on TD 2025.31760)", () => {
    resetPopKnowledgeCache();
    const kb = loadPopKnowledge();
    const types = listPopTypes();
    assert.equal(types.length, 97);
    assert.ok(kb.size >= 97);
  });

  it("exposes real build parameter names for circlePOP", () => {
    const info = getPopInfo("circlePOP");
    assert.ok(info, "circlePOP must be in the knowledge base");
    assert.ok(info.liveParams.includes("radx"));
    assert.ok(info.liveParams.includes("rady"));
    assert.ok(info.liveParams.includes("divs"));
    assert.ok(info.inputs >= 1 && info.outputs >= 1);
  });

  it("resolves corpus short-name aliases (circle → circlePOP)", () => {
    const info = getPopInfo("circle");
    assert.ok(info);
    assert.equal(info.type, "circlePOP");
  });

  it("is case-insensitive", () => {
    assert.ok(getPopInfo("CIRCLEPOP"));
    assert.ok(getPopInfo("MergePop"));
  });

  it("returns undefined for unknown types", () => {
    assert.equal(getPopInfo("nopePOP"), undefined);
    assert.equal(getPopInfo(""), undefined);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. validatePopParameters — offline name validation + suggestions
// ═══════════════════════════════════════════════════════════════════════════

describe("validatePopParameters", () => {
  it("accepts real parameter names", () => {
    const v = validatePopParameters("circlePOP", ["radx", "rady", "divs"]);
    assert.equal(v.ok, true);
    assert.equal(v.unknown.length, 0);
    assert.equal(v.valid.length, 3);
    assert.equal(v.skipped, false);
    assert.equal(v.knownParamCount, 29);
  });

  it("rejects a wiki-drift name with suggestions", () => {
    // "radius" is the intuitive (wiki-ish) name; the real build name is radx/rady.
    const v = validatePopParameters("circlePOP", ["radius"]);
    assert.equal(v.ok, false);
    assert.equal(v.unknown.length, 1);
    assert.ok(
      v.unknown[0].suggestions.includes("radx") ||
        v.unknown[0].suggestions.includes("rady"),
      `expected radx/rady suggestions, got ${JSON.stringify(v.unknown[0].suggestions)}`,
    );
  });

  it("flags each unknown name and keeps valid ones", () => {
    const v = validatePopParameters("spherePOP", ["freq", "radx", "bogus"]);
    assert.equal(v.ok, false);
    assert.deepEqual(v.unknown.map((u) => u.name), ["bogus"]);
    assert.deepEqual(v.valid, ["freq", "radx"]);
  });

  it("skips (ok) unknown types instead of blocking", () => {
    const v = validatePopParameters("blurTOP", ["whatever"]);
    assert.equal(v.ok, true);
    assert.equal(v.skipped, true);
    assert.equal(v.knownParamCount, 0);
  });

  it("assertValidPopParameters throws with a clear, actionable message", () => {
    assert.throws(
      () => assertValidPopParameters("circlePOP", ["radius"]),
      (err) => {
        const msg = String(err.message);
        return (
          msg.includes("circlePOP") &&
          msg.includes("'radius'") &&
          msg.includes("did you mean") &&
          msg.includes("never set parameters blindly")
        );
      },
    );
  });

  it("suggestParameterNames ranks close names first", () => {
    const info = getPopInfo("particlePOP");
    const s = suggestParameterNames(info.liveParams, "birth", 5);
    assert.ok(s.includes("birthrate"), `expected birthrate in ${JSON.stringify(s)}`);
    assert.deepEqual(suggestParameterNames([], "x"), []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. validateParameterNamesForPath — live-first runtime validation
// ═══════════════════════════════════════════════════════════════════════════

function makeClient({ paramsResult, detailType }) {
  return {
    async getParameters() {
      if (paramsResult === "throw") throw new Error("connection refused");
      return paramsResult ?? { parameters: [] };
    },
    async getNodeDetail() {
      if (detailType === "throw") throw new Error("connection refused");
      return { success: true, data: { type: detailType ?? "circlePOP" } };
    },
  };
}

describe("validateParameterNamesForPath", () => {
  it("uses the live parameter list when available", async () => {
    const client = makeClient({
      paramsResult: {
        parameters: [
          { name: "radx" },
          { name: "rady" },
          { name: "divs" },
        ],
      },
    });
    const v = await validateParameterNamesForPath(client, "/project1/c1", [
      "radx",
      "radius",
    ]);
    assert.equal(v.source, "live");
    assert.equal(v.ok, false);
    assert.ok(v.unknown[0].suggestions.includes("radx") || v.unknown[0].suggestions.includes("rady"));
    assert.match(v.detail, /did you mean/);
  });

  it("passes when all live names match", async () => {
    const client = makeClient({
      paramsResult: { parameters: [{ name: "radx" }, { name: "rady" }] },
    });
    const v = await validateParameterNamesForPath(client, "/project1/c1", ["radx"]);
    assert.equal(v.ok, true);
    assert.deepEqual(v.valid, ["radx"]);
  });

  it("falls back to the knowledge base when the live read fails", async () => {
    const client = makeClient({ paramsResult: "throw", detailType: "circlePOP" });
    const v = await validateParameterNamesForPath(
      client,
      "/project1/c1",
      ["radx", "radius"],
      "circlePOP",
    );
    assert.equal(v.source, "knowledge-base");
    assert.equal(v.ok, false);
    assert.equal(v.knownParamCount, 29);
  });

  it("skips validation when the type is unknown and live read fails", async () => {
    const client = makeClient({ paramsResult: "throw", detailType: "blurTOP" });
    const v = await validateParameterNamesForPath(client, "/p1/b1", ["whatever"]);
    assert.equal(v.source, "skipped");
    assert.equal(v.ok, true);
  });

  it("skips when there is nothing to validate", async () => {
    const client = makeClient({});
    const v = await validateParameterNamesForPath(client, "/p1/x", []);
    assert.equal(v.source, "skipped");
    assert.equal(v.ok, true);
  });

  it("resolvePopTypeForPath resolves known POP types and null otherwise", async () => {
    assert.equal(await resolvePopTypeForPath(makeClient({}), "/p1/c1"), "circlePOP");
    assert.equal(
      await resolvePopTypeForPath(makeClient({ detailType: "blurTOP" }), "/p1/b1"),
      null,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. POP network templates — corpus-backed structure + real build params
// ═══════════════════════════════════════════════════════════════════════════

const REQUIRED_TEMPLATES = [
  { name: "pop-line-merge-copy", chain: "line > merge > copy" },
  { name: "pop-circle-merge-switch", chain: "circle > merge > switch" },
  { name: "pop-grid-attribute-instancing", chain: "grid > attribute" },
  { name: "pop-sphere-transform-trail", chain: "sphere > transform > trail" },
  { name: "pop-box-glsl-chain", chain: "box > glsl > glsl" },
  { name: "pop-sprinkle-particle-feedback", chain: "sprinkle > particle" },
];

describe("POP_NETWORK_TEMPLATES — corpus-derived templates", () => {
  it("contains the six required corpus chains", () => {
    const names = POP_NETWORK_TEMPLATES.map((t) => t.name);
    for (const req of REQUIRED_TEMPLATES) {
      assert.ok(names.includes(req.name), `missing template ${req.name}`);
      const t = getPopTemplateByName(req.name);
      assert.equal(t.corpusChain, req.chain);
      assert.ok(t.corpusCount > 0, "corpus evidence count must be positive");
    }
  });

  it("has structurally valid templates (unique ids, valid refs)", () => {
    for (const t of POP_NETWORK_TEMPLATES) {
      const ids = t.operators.map((o) => o.id);
      assert.equal(new Set(ids).size, ids.length, `${t.name}: duplicate op ids`);
      for (const c of t.connections) {
        assert.ok(ids.includes(c.from), `${t.name}: connection from ${c.from}`);
        assert.ok(ids.includes(c.to), `${t.name}: connection to ${c.to}`);
        assert.ok(Number.isInteger(c.inputIndex) && c.inputIndex >= 0);
      }
      for (const p of t.parameters) {
        assert.ok(ids.includes(p.opId), `${t.name}: param opId ${p.opId}`);
      }
      assert.ok(t.pythonBuilder.length > 100, `${t.name}: pythonBuilder too short`);
    }
  });

  it("every template parameter name is a REAL build parameter", () => {
    const ops = loadRawPopOperators();
    const byType = new Map(ops.map((o) => [o.type, new Set(o.live_params)]));
    for (const t of POP_NETWORK_TEMPLATES) {
      const typeById = new Map(t.operators.map((o) => [o.id, o.opType]));
      for (const p of t.parameters) {
        const opType = typeById.get(p.opId);
        const live = byType.get(opType);
        assert.ok(live, `${t.name}: ${opType} not in knowledge base`);
        assert.ok(
          live.has(p.paramName),
          `${t.name}: ${opType}.${p.paramName} is NOT a real build parameter ` +
            `(not in pop_operators.json live_params)`,
        );
      }
    }
  });

  it("every template op type is a real POP from the knowledge base", () => {
    for (const t of POP_NETWORK_TEMPLATES) {
      for (const o of t.operators) {
        assert.ok(getPopInfo(o.opType), `${t.name}: ${o.opType} not in KB`);
      }
    }
  });

  it("search and lookup helpers work", () => {
    assert.equal(searchPopTemplates("").length, POP_NETWORK_TEMPLATES.length);
    assert.ok(searchPopTemplates("particle").length >= 1);
    assert.ok(searchPopTemplates("glsl").some((t) => t.name === "pop-box-glsl-chain"));
    assert.equal(getPopTemplateByName("pop-line-merge-copy").corpusCount, 168);
    assert.equal(getPopTemplateByName("nope"), undefined);
  });

  it("dynamic-input ops (mergePOP) are wired with growing input indexes", () => {
    const t = getPopTemplateByName("pop-line-merge-copy");
    const mergeConns = t.connections.filter((c) => c.to === "merge");
    const idxs = mergeConns.map((c) => c.inputIndex).sort();
    assert.deepEqual(idxs, [0, 1], "merge inputs must grow 0,1,... per connection");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. applyNetworkGraph — parameter gate on the apply path
// ═══════════════════════════════════════════════════════════════════════════

class FakeApplyClient {
  constructor() {
    this.created = [];
    this.paramCalls = [];
    this.connectCalls = [];
  }
  async createOperator(opType, label, parentPath, x, y) {
    this.created.push({ opType, label, parentPath, x, y });
    return { path: `${parentPath}/${label}` };
  }
  async setParameters(path, updates) {
    this.paramCalls.push({ path, updates });
    return { success: true, updated: updates, missing: [] };
  }
  async connectNodes(sourcePath, targetPath, inputIndex) {
    this.connectCalls.push({ sourcePath, targetPath, inputIndex });
    return { success: true };
  }
  async healthcheck() {
    return { ok: true, issueCount: 0, operators: [] };
  }
}

describe("applyNetworkGraph — POP parameter gate", () => {
  it("sets parameters when names are real build names", async () => {
    const client = new FakeApplyClient();
    const graph = {
      targetPath: "/project1/popnet",
      nodes: [
        {
          id: "c1",
          opType: "circlePOP",
          label: "circle1",
          parentPath: "/project1/popnet",
          x: 0,
          y: 0,
          parameters: { radx: 0.5, rady: 0.5 },
        },
      ],
      connections: [],
    };
    const result = await applyNetworkGraph(client, graph);
    assert.equal(result.created, 1);
    assert.equal(client.paramCalls.length, 1);
    assert.deepEqual(
      client.paramCalls[0].updates.map((u) => u.name).sort(),
      ["radx", "rady"],
    );
  });

  it("refuses to set unknown parameters and reports suggestions", async () => {
    const client = new FakeApplyClient();
    const graph = {
      targetPath: "/project1/popnet",
      nodes: [
        {
          id: "c1",
          opType: "circlePOP",
          label: "circle1",
          parentPath: "/project1/popnet",
          parameters: { radius: 0.5 },
        },
      ],
      connections: [],
    };
    const result = await applyNetworkGraph(client, graph);
    assert.equal(result.created, 1, "node is still created");
    assert.equal(client.paramCalls.length, 0, "no blind parameter writes");
    assert.ok(
      result.errors.some(
        (e) => e.includes("radius") && e.includes("did you mean"),
      ),
      `expected suggestion in errors: ${JSON.stringify(result.errors)}`,
    );
  });

  it("skips validation (and still applies) for types outside the POP KB", async () => {
    const client = new FakeApplyClient();
    const graph = {
      targetPath: "/project1",
      nodes: [
        {
          id: "b1",
          opType: "blurTOP",
          label: "blur1",
          parentPath: "/project1",
          parameters: { whatever: 1 },
        },
      ],
      connections: [],
    };
    const result = await applyNetworkGraph(client, graph);
    assert.equal(client.paramCalls.length, 1, "non-POP types pass through");
    assert.equal(result.errors.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. formatUnknownParameterError — message quality
// ═══════════════════════════════════════════════════════════════════════════

describe("formatUnknownParameterError", () => {
  it("builds a clear message with suggestions and guidance", () => {
    const msg = formatUnknownParameterError(
      "circlePOP",
      [{ name: "radius", suggestions: ["radx", "rady"] }],
      29,
    );
    assert.match(msg, /Unknown parameter\(s\) for circlePOP/);
    assert.match(msg, /'radius' \(did you mean: radx, rady\?\)/);
    assert.match(msg, /29 parameters/);
  });

  it("omits the suggestion block when there are no close matches", () => {
    const msg = formatUnknownParameterError("circlePOP", [{ name: "zzzz", suggestions: [] }], 29);
    assert.ok(!msg.includes("did you mean"));
  });
});
