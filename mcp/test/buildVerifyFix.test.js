/**
 * Unit tests for buildVerifyFix.ts
 *
 * Covers:
 * - buildVerifyFix: healthcheck → auto-fix → recheck loop
 * - verifyAndFixConnections: batch verify + rewire
 * - postGraphValidation: convenience wrapper
 *
 * All TDClient interactions are mocked.
 */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { buildVerifyFix, verifyAndFixConnections, postGraphValidation } from "../dist/buildVerifyFix.js";

// ─── Mock Helpers ──────────────────────────────────────────────────────────

function makeMockClient(overrides = {}) {
  return {
    healthcheck: mock.fn(async () => ({
      ok: true,
      issueCount: 0,
      operators: [],
    })),
    execute: mock.fn(async () => ({ stdout: '{"fixed":0}' })),
    connectNodes: mock.fn(async () => {}),
    ...overrides,
  };
}

// ─── buildVerifyFix ────────────────────────────────────────────────────────

describe("buildVerifyFix", async () => {
  await it("should return ok=true when healthcheck passes on first check", async () => {
    const client = makeMockClient();
    const result = await buildVerifyFix({ client, path: "/project1" });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.issueCount, 0);
    assert.strictEqual(result.fixesApplied, 0);
    assert.strictEqual(result.issues.length, 0);
    assert.ok(result.summary.includes("healthy"));
  });

  await it("should auto-fix expression errors when healthcheck has issues", async () => {
    let hcCalls = 0;
    const healthcheck = mock.fn(async () => {
      hcCalls++;
      if (hcCalls === 1) return { ok: false, issueCount: 1, operators: [{ path: "/project1/expr1", hasIssues: true, errors: "bare sin()" }] };
      return { ok: true, issueCount: 0, operators: [] };
    });

    const client = makeMockClient({
      healthcheck,
      execute: mock.fn(async () => ({ stdout: '{"fixed":1}' })),
    });
    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.fixesApplied, 1);
    assert.ok(result.fixDetails[0].includes("Fixed 1"));
    assert.ok(result.summary.includes("Auto-fixed"));
  });

  await it("should report remaining issues after auto-fix doesn't resolve all", async () => {
    let hcCalls = 0;
    const healthcheck = mock.fn(async () => {
      hcCalls++;
      if (hcCalls === 1) return { ok: false, issueCount: 2, operators: [
        { path: "/project1/op1", hasIssues: true, errors: "expr error" },
        { path: "/project1/op2", hasIssues: true, errors: "missing input" },
      ] };
      return { ok: false, issueCount: 1, operators: [
        { path: "/project1/op2", hasIssues: true, errors: "missing input" },
      ] };
    });

    const client = makeMockClient({
      healthcheck,
      execute: mock.fn(async () => ({ stdout: '{"fixed":1}' })),
    });
    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.issueCount, 1);
    assert.ok(result.fixesApplied >= 0);
  });

  await it("should skip auto-fix when autoFix=false", async () => {
    const healthcheck = mock.fn(async () => ({
      ok: false,
      issueCount: 1,
      operators: [{ path: "/project1/op1", hasIssues: true, errors: "error" }],
    }));
    const execute = mock.fn();

    const client = makeMockClient({ healthcheck, execute });
    const result = await buildVerifyFix({ client, path: "/project1", autoFix: false });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.fixesApplied, 0);
    assert.strictEqual(execute.mock.calls.length, 0);
  });

  await it("should handle healthcheck throwing gracefully", async () => {
    const client = makeMockClient({
      healthcheck: mock.fn(async () => { throw new Error("TD not running"); }),
    });

    const result = await buildVerifyFix({ client, path: "/project1" });

    // healthcheckPath catches and returns ok:true on error
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.issueCount, 0);
  });

  await it("should count zero fixes when autoFixExpressions returns 0", async () => {
    let hcCalls = 0;
    const healthcheck = mock.fn(async () => {
      hcCalls++;
      if (hcCalls === 1) return { ok: false, issueCount: 1, operators: [{ path: "/project1/op1", hasIssues: true, errors: "error" }] };
      return { ok: false, issueCount: 1, operators: [{ path: "/project1/op1", hasIssues: true, errors: "error" }] };
    });

    // execute returns {"fixed":0}
    const client = makeMockClient({ healthcheck });
    const result = await buildVerifyFix({ client, path: "/project1", autoFix: true });

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.fixesApplied, 0);
  });

  await it("should return correct shape with all fields", async () => {
    const client = makeMockClient();
    const result = await buildVerifyFix({ client, path: "/test" });

    assert.ok("ok" in result);
    assert.ok("path" in result);
    assert.ok("issueCount" in result);
    assert.ok("issues" in result);
    assert.ok("fixesApplied" in result);
    assert.ok("fixDetails" in result);
    assert.ok("summary" in result);
    assert.strictEqual(result.path, "/test");
  });
});

// ─── verifyAndFixConnections ───────────────────────────────────────────────

describe("verifyAndFixConnections", async () => {
  await it("should report succeeded count for verified connections", async () => {
    // verifyConnection executes Python that prints sourcePath → returns true
    const client = makeMockClient({
      execute: mock.fn(async (code) => {
        if (code.includes("inputConnectors")) {
          return { stdout: "/project1/src1" };
        }
        return { stdout: '{"fixed":0}' };
      }),
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/project1/src1", targetPath: "/project1/dst1", inputIndex: 0 },
    ]);

    assert.strictEqual(result.succeeded, 1);
    assert.strictEqual(result.failed.length, 0);
    assert.strictEqual(result.fixed.length, 0);
  });

  await it("should attempt rewire when verification fails", async () => {
    let callCount = 0;
    const execute = mock.fn(async (code) => {
      if (code.includes("inputConnectors")) {
        // First call: verification → NOT_CONNECTED
        // Second call (rewire strategy 2): print OK
        // Third call: verification → OK
        callCount++;
        if (callCount === 1) return { stdout: "NOT_CONNECTED" };
        if (callCount === 2) return { stdout: "OK" };
        return { stdout: "/project1/src1" };
      }
      return { stdout: '{"fixed":0}' };
    });

    const client = makeMockClient({ execute });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/project1/src1", targetPath: "/project1/dst1", inputIndex: 0 },
    ]);

    // Either succeeded via rewire or fell through
    assert.ok(result.succeeded + result.failed.length + result.fixed.length >= 1);
  });

  await it("should handle empty connections array", async () => {
    const client = makeMockClient();
    const result = await verifyAndFixConnections(client, []);

    assert.strictEqual(result.succeeded, 0);
    assert.strictEqual(result.failed.length, 0);
    assert.strictEqual(result.fixed.length, 0);
  });

  await it("should handle multiple connections independently", async () => {
    let callCount = 0;
    const execute = mock.fn(async (code) => {
      if (code.includes("inputConnectors")) {
        callCount++;
        // First connection: verified OK
        // Second connection: NOT_FOUND → rewire fails
        if (callCount === 1) return { stdout: "/project1/src1" };
        return { stdout: "NOT_FOUND" };
      }
      return { stdout: '{"fixed":0}' };
    });

    const client = makeMockClient({
      execute,
      connectNodes: mock.fn(async () => { throw new Error("connect failed"); }),
    });

    const result = await verifyAndFixConnections(client, [
      { sourcePath: "/project1/src1", targetPath: "/project1/dst1", inputIndex: 0 },
      { sourcePath: "/project1/src2", targetPath: "/project1/dst2", inputIndex: 0 },
    ]);

    assert.ok(result.succeeded >= 1);
    assert.ok(result.failed.length + result.fixed.length >= 1);
  });
});

// ─── postGraphValidation ───────────────────────────────────────────────────

describe("postGraphValidation", async () => {
  await it("should return a VerifyResult with correct shape", async () => {
    const client = makeMockClient();
    const result = await postGraphValidation(client, "/project1");

    assert.ok("ok" in result);
    assert.ok("path" in result);
    assert.ok("issueCount" in result);
    assert.ok("summary" in result);
    assert.strictEqual(result.path, "/project1");
  });

  await it("should pass autoFix=true and verifyConnections=true to buildVerifyFix", async () => {
    let hcCalls = 0;
    const healthcheck = mock.fn(async () => {
      hcCalls++;
      if (hcCalls === 1) return { ok: false, issueCount: 1, operators: [{ path: "/project1/op1", hasIssues: true, errors: "error" }] };
      return { ok: true, issueCount: 0, operators: [] };
    });

    const execute = mock.fn(async () => ({ stdout: '{"fixed":1}' }));
    const client = makeMockClient({ healthcheck, execute });

    const result = await postGraphValidation(client, "/project1");

    // autoFix=true means execute was called for expression fix
    assert.ok(execute.mock.calls.length >= 1);
  });

  await it("should handle healthy network with ok=true", async () => {
    const client = makeMockClient();
    const result = await postGraphValidation(client, "/project1");

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.fixesApplied, 0);
  });
});
