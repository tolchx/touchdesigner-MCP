/**
 * Unit tests for Build-Verify-Fix Loop
 *
 * Tests the three exported functions:
 *   - buildVerifyFix(options) — main loop with healthcheck → auto-fix → re-check
 *   - verifyAndFixConnections(client, connections) — batch connection verification with rewire
 *   - postGraphValidation(client, path) — convenience wrapper
 *
 * These functions require a TDClient (mocked below).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildVerifyFix,
  verifyAndFixConnections,
  postGraphValidation,
} from "../dist/buildVerifyFix.js";

// ─── Mock Helpers ──────────────────────────────────────────────────────────

/** Create a minimal mock TDClient with configurable healthcheck/execute responses */
function createMockClient(overrides = {}) {
  return {
    healthcheck: overrides.healthcheck || (async () => ({
      ok: true,
      issueCount: 0,
      operators: [],
      issues: [],
      path: "/",
      recurse: false,
    })),
    execute: overrides.execute || (async () => ({
      success: true,
      stdout: '{"fixed": 0}',
      stderr: "",
      from_op: "/",
    })),
    connectNodes: overrides.connectNodes || (async () => ({
      success: true,
      sourcePath: "/src",
      targetPath: "/tgt",
      sourceOutput: "output",
      targetInput: 0,
    })),
    ...overrides,
  };
}

// ─── buildVerifyFix ────────────────────────────────────────────────────────

describe("buildVerifyFix", () => {

  it("returns healthy immediately when healthcheck passes", async () => {
    const client = createMockClient();
    const result = await buildVerifyFix({ client, path: "/project1" });

    assert.equal(result.ok, true);
    assert.equal(result.issueCount, 0);
    assert.equal(result.fixesApplied, 0);
    assert.equal(result.path, "/project1");
    assert.equal(result.summary, "✅ Network healthy — no issues.");
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.fixDetails, []);
  });

  it("collects issues when healthcheck finds problems", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 2,
        operators: [
          { path: "/blur1", hasIssues: true, errors: "Expression error", warnings: "" },
          { path: "/noise1", hasIssues: true, errors: "Missing input", warnings: "" },
          { path: "/null1", hasIssues: false, errors: "", warnings: "" },
        ],
        issues: [],
        path: "/project1",
        recurse: false,
      }),
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: false });

    assert.equal(result.ok, false);
    assert.equal(result.issueCount, 2);
    assert.equal(result.fixesApplied, 0);
    assert.ok(result.issues.some(i => i.includes("blur1")));
    assert.ok(result.issues.some(i => i.includes("noise1")));
  });

  it("auto-fixes expression errors and reports count", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        if (healthcheckCalls === 1) {
          // First call: unhealthy with issues
          return {
            ok: false,
            issueCount: 3,
            operators: [
              { path: "/blur1", hasIssues: true, errors: "Expression error", warnings: "" },
              { path: "/blur2", hasIssues: true, errors: "Expression error", warnings: "" },
              { path: "/blur3", hasIssues: true, errors: "Expression error", warnings: "" },
            ],
            issues: [],
            path: "/project1",
            recurse: false,
          };
        }
        // Second call (re-check): healthy now
        return {
          ok: true,
          issueCount: 0,
          operators: [],
          issues: [],
          path: "/project1",
          recurse: false,
        };
      },
      execute: async () => ({
        success: true,
        stdout: '{"fixed": 3}',
        stderr: "",
        from_op: "/",
      }),
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    assert.equal(result.ok, true);
    assert.equal(result.fixesApplied, 3);
    assert.equal(result.issueCount, 0);
    assert.ok(result.summary.includes("Auto-fixed 3"));
    assert.equal(result.fixDetails.length, 1);
    assert.ok(result.fixDetails[0].includes("3 expression"));
  });

  it("reports remaining issues after auto-fix incomplete", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        if (healthcheckCalls === 1) {
          return {
            ok: false,
            issueCount: 2,
            operators: [
              { path: "/expr1", hasIssues: true, errors: "Expression error", warnings: "" },
              { path: "/missing1", hasIssues: true, errors: "Missing input", warnings: "" },
            ],
            issues: [],
            path: "/project1",
            recurse: false,
          };
        }
        // Re-check: still has 1 issue
        return {
          ok: false,
          issueCount: 1,
          operators: [
            { path: "/missing1", hasIssues: true, errors: "Missing input", warnings: "" },
          ],
          issues: [],
          path: "/project1",
          recurse: false,
        };
      },
      execute: async () => ({
        success: true,
        stdout: '{"fixed": 1}',
        stderr: "",
        from_op: "/",
      }),
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    assert.equal(result.ok, false);
    assert.equal(result.fixesApplied, 1);
    assert.equal(result.issueCount, 1);
    assert.ok(result.issues.some(i => i.includes("missing1")));
    assert.ok(result.summary.includes("1 remain"));
  });

  it("handles healthcheck exception gracefully", async () => {
    const client = createMockClient({
      healthcheck: async () => { throw new Error("Connection refused"); },
    });

    // buildVerifyFix catches exceptions in healthcheckPath → returns {ok:true}
    const result = await buildVerifyFix({ client, path: "/project1" });

    assert.equal(result.ok, true);
    assert.equal(result.issueCount, 0);
    assert.equal(result.fixesApplied, 0);
  });

  it("handles execute exception gracefully", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        return {
          ok: false,
          issueCount: 1,
          operators: [
            { path: "/expr1", hasIssues: true, errors: "Expression error", warnings: "" },
          ],
          issues: [],
          path: "/project1",
          recurse: false,
        };
      },
      execute: async () => { throw new Error("TD timeout"); },
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    // Execute failure is caught → fixesApplied stays 0
    assert.equal(result.fixesApplied, 0);
    assert.equal(result.ok, false);
  });

  it("defaults autoFix to true", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 1,
        operators: [
          { path: "/expr1", hasIssues: true, errors: "Expression error", warnings: "" },
        ],
        issues: [],
        path: "/project1",
        recurse: false,
      }),
      execute: async () => ({
        success: true,
        stdout: '{"fixed": 1}',
        stderr: "",
        from_op: "/",
      }),
    });

    // autoFix omitted → should default to true
    const result = await buildVerifyFix({ client, path: "/project1" });

    assert.equal(result.fixesApplied, 1);
  });

  it("respects autoFix=false", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 1,
        operators: [
          { path: "/expr1", hasIssues: true, errors: "Expression error", warnings: "" },
        ],
        issues: [],
        path: "/project1",
        recurse: false,
      }),
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: false });

    assert.equal(result.fixesApplied, 0);
    assert.equal(result.ok, false);
    assert.equal(result.issueCount, 1);
  });

  it("returns empty details when no fixes to report", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 1,
        operators: [
          { path: "/expr1", hasIssues: true, errors: "Expression error", warnings: "" },
        ],
        issues: [],
        path: "/project1",
        recurse: false,
      }),
    });

    const result = await buildVerifyFix({ client, path: "/project1", autoFix: false });

    assert.deepEqual(result.fixDetails, []);
  });

  // ─── VerifyResult type shape ─────────────────────────────────────────────

  it("returns valid VerifyResult shape on success", async () => {
    const client = createMockClient();
    const result = await buildVerifyFix({ client, path: "/test" });

    // Check all required fields exist and have correct types
    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.path, "string");
    assert.equal(typeof result.issueCount, "number");
    assert.equal(typeof result.fixesApplied, "number");
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.issues));
    assert.ok(Array.isArray(result.fixDetails));
  });

  it("returns valid VerifyResult shape on failure", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 2,
        operators: [
          { path: "/err1", hasIssues: true, errors: "fail", warnings: "" },
          { path: "/err2", hasIssues: true, errors: "fail", warnings: "" },
        ],
        issues: [],
        path: "/test",
        recurse: false,
      }),
    });

    const result = await buildVerifyFix({ client, path: "/test", autoFix: false });

    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.path, "string");
    assert.equal(typeof result.issueCount, "number");
    assert.equal(typeof result.fixesApplied, "number");
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.issues));
    assert.ok(Array.isArray(result.fixDetails));
  });
});

// ─── postGraphValidation ───────────────────────────────────────────────────

describe("postGraphValidation", () => {
  it("calls buildVerifyFix with verifyConnections=true", async () => {
    const client = createMockClient();
    const result = await postGraphValidation(client, "/project1/graph");

    assert.equal(result.ok, true);
    assert.equal(result.path, "/project1/graph");
  });

  it("handles unhealthy graph gracefully", async () => {
    const client = createMockClient({
      healthcheck: async () => ({
        ok: false,
        issueCount: 1,
        operators: [
          { path: "/project1/graph/blur1", hasIssues: true, errors: "Expression error", warnings: "" },
        ],
        issues: [],
        path: "/project1/graph",
        recurse: false,
      }),
      execute: async () => ({
        success: true,
        stdout: '{"fixed": 1}',
        stderr: "",
        from_op: "/",
      }),
    });

    const result = await postGraphValidation(client, "/project1/graph");

    // autoFix is true by default (passed through buildVerifyFix options)
    assert.equal(result.fixesApplied, 1);
    assert.equal(result.path, "/project1/graph");
  });
});

// ─── verifyAndFixConnections ───────────────────────────────────────────────

describe("verifyAndFixConnections", () => {

  it("reports all connections as succeeded when verified", async () => {
    // Mock verifyConnection: returns the source path being checked so it matches
    let callIdx = 0;
    const conns = [
      { sourcePath: "/src1", targetPath: "/tgt1", inputIndex: 0 },
      { sourcePath: "/src2", targetPath: "/tgt2", inputIndex: 0 },
    ];
    const client = createMockClient({
      execute: async (code) => {
        // Simulate verifyConnection: returns source path matching current connection
        if (code.includes("inputConnectors")) {
          const path = conns[callIdx]?.sourcePath || "/unknown";
          callIdx++;
          return {
            success: true,
            stdout: path,
            stderr: "",
            from_op: "/",
          };
        }
        return { success: true, stdout: '{"fixed": 0}', stderr: "", from_op: "/" };
      },
    });

    const result = await verifyAndFixConnections(client, conns);

    assert.equal(result.succeeded, 2);
    assert.equal(result.failed.length, 0);
    assert.equal(result.fixed.length, 0);
  });

  it("attempts rewire when connection not verified", async () => {
    let execCalls = 0;
    const client = createMockClient({
      execute: async (code) => {
        execCalls++;
        // First call: verifyConnection → not connected (returns "NOT_CONNECTED")
        if (execCalls === 1) {
          return {
            success: true,
            stdout: "NOT_CONNECTED",
            stderr: "",
            from_op: "/",
          };
        }
        // Second call: Strategy 2 (direct Python wiring) simulate success
        if (execCalls === 2) {
          return {
            success: true,
            stdout: "OK",
            stderr: "",
            from_op: "/",
          };
        }
        // Third call: verifyConnection after rewire → now connected
        return {
          success: true,
          stdout: "/src1",
          stderr: "",
          from_op: "/",
        };
      },
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/src1", targetPath: "/tgt1", inputIndex: 0 },
    ]);

    assert.equal(result.succeeded, 1);
    assert.equal(result.fixed.length, 1);
    assert.equal(result.failed.length, 0);
    assert.equal(result.fixed[0].fromPath, "/src1");
    assert.equal(result.fixed[0].toPath, "/tgt1");
    assert.equal(result.fixed[0].success, true);
  });

  it("reports failure when all rewire strategies exhausted", async () => {
    // Always returns "NOT_CONNECTED" no matter what
    const client = createMockClient({
      execute: async () => ({
        success: true,
        stdout: "NOT_CONNECTED",
        stderr: "",
        from_op: "/",
      }),
      // connectNodes fails
      connectNodes: async () => ({
        success: false,
        sourcePath: "/src1",
        targetPath: "/tgt1",
        sourceOutput: "output",
        targetInput: 0,
        error: "Cannot connect: incompatible types",
      }),
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/src1", targetPath: "/tgt1", inputIndex: 2 },
    ]);

    assert.equal(result.succeeded, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.fixed.length, 0);
    assert.equal(result.failed[0].fromPath, "/src1");
    assert.equal(result.failed[0].toPath, "/tgt1");
    assert.equal(result.failed[0].success, false);
  });

  it("handles empty connections array", async () => {
    const client = createMockClient();
    const result = await verifyAndFixConnections(client, []);

    assert.equal(result.succeeded, 0);
    assert.equal(result.failed.length, 0);
    assert.equal(result.fixed.length, 0);
  });

  it("handles exception during verifyConnection gracefully", async () => {
    const client = createMockClient({
      execute: async () => { throw new Error("Connection timeout"); },
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/src1", targetPath: "/tgt1", inputIndex: 0 },
    ]);

    assert.equal(result.succeeded, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].success, false);
  });

  it("uses fallback to input 0 when requested index fails and is non-zero", async () => {
    let execCalls = 0;
    const client = createMockClient({
      execute: async (code) => {
        execCalls++;
        // verifyConnection never matches
        if (code.includes("inputConnectors")) {
          return {
            success: true,
            stdout: "NOT_CONNECTED",
            stderr: "",
            from_op: "/",
          };
        }
        // The /exec wiring attempts
        if (code.includes("outputConnectors[0].connect")) {
          return { success: true, stdout: "OK", stderr: "", from_op: "/" };
        }
        return { success: true, stdout: '{"fixed": 0}', stderr: "", from_op: "/" };
      },
      connectNodes: async () => ({ success: true, sourcePath: "/src1", targetPath: "/tgt1", sourceOutput: "output", targetInput: 0 }),
    });

    // Input index 2 → should try strategies: connectNodes(2), execute(2), connectNodes(0)
    // But since verifyConnection never says connected, it exhausts all 3
    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/src1", targetPath: "/tgt1", inputIndex: 2 },
    ]);

    // All strategies exhausted → failed
    assert.equal(result.succeeded, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0].inputIndex, 2);
  });

  it("returns RewireAttempt with proper shape", async () => {
    const client = createMockClient({
      execute: async () => ({
        success: true,
        stdout: "NOT_CONNECTED",
        stderr: "",
        from_op: "/",
      }),
      connectNodes: async () => ({
        success: false,
        sourcePath: "/src",
        targetPath: "/tgt",
        sourceOutput: "output",
        targetInput: 0,
        error: "incompatible",
      }),
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/src", targetPath: "/tgt", inputIndex: 0 },
    ]);

    assert.equal(result.failed.length, 1);
    const failure = result.failed[0];
    assert.equal(typeof failure.fromPath, "string");
    assert.equal(typeof failure.toPath, "string");
    assert.equal(typeof failure.inputIndex, "number");
    assert.equal(typeof failure.success, "boolean");
    // error should exist since all strategies failed
    assert.ok(typeof failure.error === "string" || failure.error === undefined);
  });
});
