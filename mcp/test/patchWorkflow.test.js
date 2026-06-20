/**
 * Integration tests for the full patch workflow: plan → preview → apply → variations.
 *
 * Tests the complete lifecycle:
 *   - gatherPreTurnContext (with mock search)
 *   - planPatch (with mock TDClient + planNetworkGraph)
 *   - previewPatch (already unit-tested, but verified end-to-end here)
 *   - generateVariations (already unit-tested, but verified end-to-end here)
 *   - applyPatch (with mock TDClient simulating success, failure, and rollback)
 *   - runPatchWorkflow (full dry-run and apply paths)
 *
 * TDClient is mocked — no live TouchDesigner required.
 */
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  gatherPreTurnContext,
  planPatch,
  previewPatch,
  generateVariations,
  applyPatch,
  runPatchWorkflow,
} from "../dist/patchEngine.js";

// ─── Mock helpers ───────────────────────────────────────────────────────────

/** Build a minimal mock TDClient. */
function makeMockClient(overrides = {}) {
  let callCount = 0;
  const calls = [];
  return {
    createOperator: mock.fn(async (opType, label, parentPath, x, y) => {
      calls.push({ fn: "createOperator", args: [opType, label, parentPath, x, y] });
      return { path: `${parentPath}/${label}` };
    }),
    connectNodes: mock.fn(async (from, to, inputIndex) => {
      calls.push({ fn: "connectNodes", args: [from, to, inputIndex] });
    }),
    execute: mock.fn(async (code, path) => {
      calls.push({ fn: "execute", args: [code, path] });
    }),
    healthcheck: mock.fn(async (path, detailed) => {
      calls.push({ fn: "healthcheck", args: [path, detailed] });
      return { issueCount: 0 };
    }),
    setParameters: mock.fn(async (path, updates) => {
      calls.push({ fn: "setParameters", args: [path, updates] });
    }),
    get calls() { return calls; },
    ...overrides,
  };
}

/** Build a mock PatchPlan for testing workflow functions. */
function makePlan(overrides = {}) {
  return {
    patchId: "patch_test_001",
    description: "create a noise and blur pipeline",
    tier: "basic",
    graph: {
      description: "noise → blur → output",
      nodes: [
        { id: "n0", opType: "noiseTOP", label: "Noise", parentPath: "/project1", x: 0, y: 0 },
        { id: "n1", opType: "blurTOP", label: "Blur", parentPath: "/project1", x: 200, y: 0 },
        { id: "n2", opType: "nullTOP", label: "Null", parentPath: "/project1", x: 400, y: 0 },
      ],
      connections: [
        { from: "n0", to: "n1", inputIndex: 0 },
        { from: "n1", to: "n2", inputIndex: 0 },
      ],
      targetPath: "/project1",
    },
    preContext: {
      templates: [],
      recipes: [],
      knowledgeHits: [],
      resolvedOps: [],
      bestFamily: "TOP",
      complexityScore: 10,
    },
    ...overrides,
  };
}

// ─── gatherPreTurnContext ────────────────────────────────────────────────────

describe("gatherPreTurnContext", () => {
  it("returns a valid PreTurnContext shape", async () => {
    const ctx = await gatherPreTurnContext("create a noise top");
    assert.equal(typeof ctx.bestFamily, "string");
    assert.ok(ctx.bestFamily.length > 0);
    assert.equal(typeof ctx.complexityScore, "number");
    assert.ok(ctx.complexityScore >= 0 && ctx.complexityScore <= 100);
    assert.ok(Array.isArray(ctx.templates));
    assert.ok(Array.isArray(ctx.recipes));
    assert.ok(Array.isArray(ctx.knowledgeHits));
    assert.ok(Array.isArray(ctx.resolvedOps));
  });

  it("returns resolvedOps as an array (may be empty for free-text)", async () => {
    const ctx = await gatherPreTurnContext("create a noiseTOP and blurTOP");
    assert.ok(Array.isArray(ctx.resolvedOps), "resolvedOps should be an array");
    // resolvePrompt only matches template names, not free-text operator names
  });

  it("sets complexityScore based on prompt complexity", async () => {
    const basic = await gatherPreTurnContext("create a noise");
    const pro = await gatherPreTurnContext("feedback loop with fluid simulation solver");
    assert.ok(pro.complexityScore > basic.complexityScore, "pro prompt should score higher");
  });
});

// ─── applyPatch (mock TDClient) ─────────────────────────────────────────────

describe("applyPatch", () => {
  it("creates all nodes and wires all connections on success", async () => {
    const client = makeMockClient();
    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.equal(result.success, true);
    assert.equal(result.rolledBack, false);
    assert.equal(result.created.length, 3, "should create 3 nodes");
    assert.equal(result.connected.length, 2, "should wire 2 connections");
    assert.equal(result.errors.length, 0, "should have no errors");
  });

  it("returns created paths matching node labels", async () => {
    const client = makeMockClient();
    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.ok(result.created.includes("/project1/Noise"));
    assert.ok(result.created.includes("/project1/Blur"));
    assert.ok(result.created.includes("/project1/Null"));
  });

  it("calls healthcheck before and after", async () => {
    const client = makeMockClient();
    const plan = makePlan();
    await applyPatch(client, plan);

    const healthcalls = client.calls.filter(c => c.fn === "healthcheck");
    assert.ok(healthcalls.length >= 2, "should call healthcheck at least twice (before + after)");
  });

  it("wraps operations in undo block", async () => {
    const client = makeMockClient();
    const plan = makePlan();
    await applyPatch(client, plan);

    const execCalls = client.calls.filter(c => c.fn === "execute");
    const startBlock = execCalls.find(c => c.args[0].includes("startBlock"));
    const endBlock = execCalls.find(c => c.args[0].includes("endBlock"));
    assert.ok(startBlock, "should call startBlock");
    assert.ok(endBlock, "should call endBlock");
  });

  it("auto-rolls back when errors increase", async () => {
    let healthcallCount = 0;
    const executeMock = mock.fn(async (code, path) => {});
    const client = makeMockClient({
      healthcheck: mock.fn(async (path, detailed) => {
        healthcallCount++;
        return { issueCount: healthcallCount === 1 ? 0 : 3 };
      }),
      execute: executeMock,
    });

    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.equal(result.rolledBack, true, "should have rolled back");
    assert.ok(result.errors.some(e => e.includes("AUTO-ROLLBACK")), "should mention auto-rollback");
    assert.equal(result.success, false, "should not be success when rolled back");

    // Check that undo was called via the mock
    const execCalls = executeMock.mock.calls;
    const undoCall = execCalls.find(c => c.arguments[0].includes("undo"));
    assert.ok(undoCall, `should call undo after rollback; execute calls: ${execCalls.map(c => c.arguments[0]).join(', ')}`);
  });

  it("includes validation result when not rolled back", async () => {
    const client = makeMockClient();
    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.ok(result.validation, "should have validation result");
    assert.equal(typeof result.validation.ok, "boolean");
    assert.equal(typeof result.validation.issueCount, "number");
    assert.equal(typeof result.validation.summary, "string");
  });

  it("skips validation when rolled back", async () => {
    let healthcallCount = 0;
    const client = makeMockClient({
      healthcheck: mock.fn(async () => {
        healthcallCount++;
        return { issueCount: healthcallCount === 1 ? 0 : 5 };
      }),
    });

    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.equal(result.rolledBack, true);
    assert.equal(result.validation, undefined, "should not have validation when rolled back");
  });

  it("handles node creation failures gracefully", async () => {
    let createcallCount = 0;
    const client = makeMockClient({
      createOperator: mock.fn(async (opType, label, parentPath) => {
        createcallCount++;
        if (createcallCount === 2) throw new Error("TD error: node creation failed");
        return { path: `${parentPath}/${label}` };
      }),
    });

    const plan = makePlan();
    const result = await applyPatch(client, plan);

    assert.equal(result.created.length, 2, "should create 2 of 3 nodes");
    assert.ok(result.errors.some(e => e.includes("Create")), "should report creation error");
  });
});

// ─── runPatchWorkflow (dry-run) ─────────────────────────────────────────────

describe("runPatchWorkflow (dry-run)", () => {
  it("returns plan + preview + variations without applying", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise top", "/project1", {
      dryRun: true,
      variationCount: 2,
    });

    assert.ok(workflow.plan, "should have a plan");
    assert.ok(workflow.preview, "should have a preview");
    assert.equal(workflow.result, undefined, "should not have a result in dry run");
    assert.equal(workflow.variations.length, 2, "should have 2 variations");
    assert.ok(workflow.nextSteps.length > 0, "should have next steps");
  });

  it("includes dry-run specific next steps", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise top", "/", {
      dryRun: true,
    });

    assert.ok(workflow.nextSteps.some(s => s.includes("dry run")), "should mention dry run");
    assert.ok(workflow.nextSteps.some(s => s.includes("td_patch_apply")), "should suggest apply");
  });

  it("preview matches plan nodes and connections", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise top", "/", {
      dryRun: true,
    });

    assert.equal(
      workflow.preview.estimatedNodeCount,
      workflow.plan.graph.nodes.length,
      "preview count should match plan"
    );
    assert.equal(
      workflow.preview.connectionsWillMake.length,
      workflow.plan.graph.connections.length,
      "preview connections should match plan"
    );
  });

  it("forces tier when option is set", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise top", "/", {
      dryRun: true,
      forceTier: "pro",
    });

    assert.equal(workflow.plan.tier, "pro", "tier should be forced to pro");
    assert.equal(workflow.preview.riskLevel, "high", "risk should be high for pro tier");
  });
});

// ─── runPatchWorkflow (apply) ───────────────────────────────────────────────

describe("runPatchWorkflow (apply)", () => {
  it("applies the plan and returns result", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise top", "/project1", {
      dryRun: false,
      variationCount: 1,
    });

    assert.ok(workflow.result, "should have a result when not dry run");
    assert.equal(workflow.result.success, true);
    assert.ok(workflow.result.created.length > 0, "should have created nodes");
    assert.ok(workflow.nextSteps.some(s => s.includes("✅") || s.includes("applied")), "should suggest success");
  });
});

// ─── Full lifecycle: plan → preview → variations ────────────────────────────

describe("full lifecycle (plan → preview → variations)", () => {
  it("produces consistent data across all phases", async () => {
    const client = makeMockClient();
    const workflow = await runPatchWorkflow(client, "create a noise and blur pipeline", "/", {
      dryRun: true,
      variationCount: 3,
    });

    // Plan
    assert.ok(workflow.plan.patchId.startsWith("patch_"), "patchId should start with patch_");
    assert.ok(workflow.plan.graph.nodes.length > 0, "plan should have nodes");

    // Preview
    assert.equal(workflow.preview.patchId, workflow.plan.patchId, "preview patchId should match plan");
    assert.equal(workflow.preview.estimatedNodeCount, workflow.plan.graph.nodes.length);

    // Variations
    assert.equal(workflow.variations.length, 3);
    for (const v of workflow.variations) {
      assert.ok(v.patchId.startsWith(workflow.plan.patchId), "variation patchId should extend plan patchId");
      assert.ok(v.graph.nodes.length > 0, "variation should have nodes");
      assert.ok(v.differences.length > 0, "variation should describe differences");
    }
  });
});
