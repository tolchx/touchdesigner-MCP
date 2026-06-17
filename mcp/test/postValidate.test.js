/**
 * Unit tests for postValidate module (src/tools/postValidate.ts)
 *
 * Tests the two exported functions:
 *   - getParentPath(path) — pure path helper
 *   - postModifyValidate(client, path, parentPath?, autoFix?) — post-modification
 *     validation that runs a non-recursive healthcheck and optionally auto-fixes
 *     expression errors.
 *
 * postModifyValidate requires a TDClient (mocked below). The private
 * autoFixExpressions() helper is exercised indirectly through postModifyValidate
 * via the mock client's execute() method.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getParentPath,
  postModifyValidate,
} from "../dist/tools/postValidate.js";

// ─── Mock Helpers ──────────────────────────────────────────────────────────

/** Create a minimal mock TDClient with configurable healthcheck/execute responses. */
function createMockClient(overrides = {}) {
  return {
    healthcheck:
      overrides.healthcheck ||
      (async () => ({
        ok: true,
        issueCount: 0,
        operators: [],
        issues: [],
        path: "/",
        recurse: false,
      })),
    execute:
      overrides.execute ||
      (async () => ({
        success: true,
        stdout: '{"fixed": 0}',
        stderr: "",
        from_op: "/",
      })),
    ...overrides,
  };
}

/** A healthy healthcheck response. */
function healthy() {
  return {
    ok: true,
    issueCount: 0,
    operators: [],
    issues: [],
    path: "/project1",
    recurse: false,
  };
}

/** Build an unhealthy healthcheck response from a list of operators.
 *  issueCount is derived from the number of operators flagged hasIssues. */
function unhealthy(operators) {
  const flagged = operators.filter((o) => o.hasIssues).length;
  return {
    ok: false,
    issueCount: flagged,
    operators,
    issues: [],
    path: "/project1",
    recurse: false,
  };
}

/** Standard issue operator objects. */
const ISSUE_OPS = [
  { path: "/blur1", name: "blur1", opType: "blur", errors: "Expression error", warnings: "", hasIssues: true },
  { path: "/noise1", name: "noise1", opType: "noise", errors: "Missing input", warnings: "", hasIssues: true },
  { path: "/null1", name: "null1", opType: "null", errors: "", warnings: "", hasIssues: false },
];

// ─── getParentPath ─────────────────────────────────────────────────────────

describe("getParentPath", () => {
  it("returns the parent of a two-segment path", () => {
    assert.equal(getParentPath("/project1/noise1"), "/project1");
  });

  it("returns the parent of a multi-segment path", () => {
    assert.equal(getParentPath("/project1/geo1/null1"), "/project1/geo1");
  });

  it("returns root for root input", () => {
    assert.equal(getParentPath("/"), "/");
  });

  it("returns root for a single top-level operator", () => {
    assert.equal(getParentPath("/project1"), "/");
  });

  it("collapses a double slash to root", () => {
    // "//".split("/") -> ["","",""] -> filter(Boolean) -> [] -> length 0 -> "/"
    assert.equal(getParentPath("//"), "/");
  });

  it("handles a deep nested path", () => {
    assert.equal(getParentPath("/a/b/c/d/e"), "/a/b/c/d");
  });

  it("returns root for empty string", () => {
    assert.equal(getParentPath(""), "/");
  });

  it("returns root for a single segment with no leading slash", () => {
    assert.equal(getParentPath("no_slash"), "/");
  });

  it("returns root for a single segment with leading slash", () => {
    assert.equal(getParentPath("/a"), "/");
  });

  it("ignores a trailing slash", () => {
    assert.equal(getParentPath("/project1/noise1/"), "/project1");
  });
});

// ─── postModifyValidate ────────────────────────────────────────────────────

describe("postModifyValidate", () => {
  it("returns healthy immediately when healthcheck passes", async () => {
    const client = createMockClient();
    const result = await postModifyValidate(client, "/project1/noise1");

    assert.equal(result.ok, true);
    assert.equal(result.issueCount, 0);
    assert.deepEqual(result.issues, []);
    assert.equal(result.fixesApplied, 0);
    assert.ok(result.summary.startsWith("✅"));
  });

  it("emits the healthy summary text on success", async () => {
    const client = createMockClient();
    const result = await postModifyValidate(client, "/project1/noise1");

    assert.equal(
      result.summary,
      "✅ Network healthy — no issues detected after modification."
    );
  });

  it("returns issues when healthcheck finds problems and autoFix applies zero fixes", async () => {
    // autoFix defaults to true, but the mock execute returns fixed:0,
    // so no re-check happens and the raw issues are returned.
    const client = createMockClient({
      healthcheck: async () => unhealthy(ISSUE_OPS),
    });

    const result = await postModifyValidate(client, "/project1");

    assert.equal(result.ok, false);
    assert.equal(result.issueCount, 2);
    assert.equal(result.fixesApplied, 0);
    assert.equal(result.issues.length, 2);
    assert.ok(result.summary.startsWith("⚠️"));
  });

  it("only reports operators with hasIssues=true", async () => {
    const client = createMockClient({
      healthcheck: async () => unhealthy(ISSUE_OPS),
    });

    const result = await postModifyValidate(client, "/project1", undefined, false);

    // null1 has hasIssues:false and must be excluded
    assert.equal(result.issues.length, 2);
    const paths = result.issues.map((i) => i.path).sort();
    assert.deepEqual(paths, ["/blur1", "/noise1"]);
  });

  it("maps operator fields into the issue objects", async () => {
    const client = createMockClient({
      healthcheck: async () => unhealthy(ISSUE_OPS),
    });

    const result = await postModifyValidate(client, "/project1", undefined, false);
    const blur = result.issues.find((i) => i.path === "/blur1");

    assert.equal(blur.name, "blur1");
    assert.equal(blur.opType, "blur");
    assert.equal(blur.errors, "Expression error");
    assert.equal(blur.warnings, "");
  });

  it("auto-fixes expression errors and reports healthy when re-check is clean", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        if (healthcheckCalls === 1) {
          return unhealthy([
            { path: "/expr1", name: "expr1", opType: "math", errors: "Expression error", warnings: "", hasIssues: true },
          ]);
        }
        return healthy();
      },
      execute: async () => ({ success: true, stdout: '{"fixed": 1}', stderr: "", from_op: "/" }),
    });

    const result = await postModifyValidate(client, "/project1", undefined, true);

    assert.equal(result.ok, true);
    assert.equal(result.fixesApplied, 1);
    assert.equal(result.issueCount, 0);
    assert.deepEqual(result.issues, []);
    assert.ok(result.summary.includes("Auto-fixed 1"));
  });

  it("re-checks healthcheck exactly once when fixes are applied", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        if (healthcheckCalls === 1) {
          return unhealthy([
            { path: "/expr1", name: "expr1", opType: "math", errors: "Expression error", warnings: "", hasIssues: true },
          ]);
        }
        return healthy();
      },
      execute: async () => ({ success: true, stdout: '{"fixed": 1}', stderr: "", from_op: "/" }),
    });

    await postModifyValidate(client, "/project1", undefined, true);

    assert.equal(healthcheckCalls, 2);
  });

  it("reports remaining issues when re-check is still unhealthy after fix", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        if (healthcheckCalls === 1) {
          return unhealthy([
            { path: "/expr1", name: "expr1", opType: "math", errors: "Expression error", warnings: "", hasIssues: true },
            { path: "/missing1", name: "missing1", opType: "null", errors: "Missing input", warnings: "", hasIssues: true },
          ]);
        }
        // After fixing expr1, missing1 still remains
        return unhealthy([
          { path: "/missing1", name: "missing1", opType: "null", errors: "Missing input", warnings: "", hasIssues: true },
        ]);
      },
      execute: async () => ({ success: true, stdout: '{"fixed": 1}', stderr: "", from_op: "/" }),
    });

    const result = await postModifyValidate(client, "/project1", undefined, true);

    assert.equal(result.ok, false);
    assert.equal(result.fixesApplied, 1);
    assert.equal(result.issueCount, 1);
    assert.equal(result.issues[0].path, "/missing1");
    assert.ok(result.summary.includes("1 issue(s) remain"));
  });

  it("does not re-check when autoFix applies zero fixes", async () => {
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async () => {
        healthcheckCalls++;
        return unhealthy([
          { path: "/missing1", name: "missing1", opType: "null", errors: "Missing input", warnings: "", hasIssues: true },
        ]);
      },
      execute: async () => ({ success: true, stdout: '{"fixed": 0}', stderr: "", from_op: "/" }),
    });

    await postModifyValidate(client, "/project1", undefined, true);

    assert.equal(healthcheckCalls, 1);
  });

  it("does not call execute when autoFix=false", async () => {
    let executeCalls = 0;
    const client = createMockClient({
      healthcheck: async () => unhealthy(ISSUE_OPS),
      execute: async () => {
        executeCalls++;
        return { success: true, stdout: '{"fixed": 9}', stderr: "", from_op: "/" };
      },
    });

    const result = await postModifyValidate(client, "/project1", undefined, false);

    assert.equal(executeCalls, 0);
    assert.equal(result.fixesApplied, 0);
    assert.equal(result.ok, false);
  });

  it("catches healthcheck exception and returns a graceful error with issueCount -1", async () => {
    const client = createMockClient({
      healthcheck: async () => {
        throw new Error("Connection refused");
      },
    });

    const result = await postModifyValidate(client, "/project1");

    assert.equal(result.ok, false);
    assert.equal(result.issueCount, -1);
    assert.equal(result.fixesApplied, 0);
    assert.deepEqual(result.issues, []);
    assert.ok(result.summary.includes("Post-validation skipped"));
    assert.ok(result.summary.includes("Connection refused"));
  });

  it("returns without fix when execute throws (autoFix failure is swallowed)", async () => {
    const client = createMockClient({
      healthcheck: async () =>
        unhealthy([
          { path: "/expr1", name: "expr1", opType: "math", errors: "Expression error", warnings: "", hasIssues: true },
        ]),
      execute: async () => {
        throw new Error("TD timeout");
      },
    });

    const result = await postModifyValidate(client, "/project1", undefined, true);

    // autoFixExpressions catches the throw -> returns 0 -> issues returned unfixed
    assert.equal(result.fixesApplied, 0);
    assert.equal(result.ok, false);
    assert.equal(result.issueCount, 1);
    assert.ok(result.summary.startsWith("⚠️"));
  });

  it("healthchecks the parentPath when provided", async () => {
    const healthArgs = [];
    const client = createMockClient({
      healthcheck: async (p, r) => {
        healthArgs.push({ p, r });
        return healthy();
      },
    });

    await postModifyValidate(client, "/project1/geo1/null1", "/project1/geo1");

    assert.equal(healthArgs.length, 1);
    assert.equal(healthArgs[0].p, "/project1/geo1"); // used parentPath, not the modified path
    assert.equal(healthArgs[0].r, false); // non-recursive
  });

  it("healthchecks the modified path when parentPath is omitted", async () => {
    const healthArgs = [];
    const client = createMockClient({
      healthcheck: async (p, r) => {
        healthArgs.push({ p, r });
        return healthy();
      },
    });

    await postModifyValidate(client, "/project1/geo1/null1");

    assert.equal(healthArgs.length, 1);
    assert.equal(healthArgs[0].p, "/project1/geo1/null1");
    assert.equal(healthArgs[0].r, false);
  });

  it("uses parentPath for both initial and re-check healthcheck during autoFix", async () => {
    const healthArgs = [];
    let healthcheckCalls = 0;
    const client = createMockClient({
      healthcheck: async (p, r) => {
        healthcheckCalls++;
        healthArgs.push({ p, r });
        if (healthcheckCalls === 1) {
          return unhealthy([
            { path: "/expr1", name: "expr1", opType: "math", errors: "Expression error", warnings: "", hasIssues: true },
          ]);
        }
        return healthy();
      },
      execute: async () => ({ success: true, stdout: '{"fixed": 1}', stderr: "", from_op: "/" }),
    });

    const result = await postModifyValidate(client, "/project1/geo1/null1", "/project1/geo1", true);

    // Both the initial check and the post-fix re-check must target the parent path.
    assert.equal(healthArgs.length, 2);
    assert.equal(healthArgs[0].p, "/project1/geo1");
    assert.equal(healthArgs[1].p, "/project1/geo1");
    assert.equal(result.ok, true);
    assert.equal(result.fixesApplied, 1);
  });

  it("reports a large issue count correctly", async () => {
    const ops = [];
    for (let i = 0; i < 50; i++) {
      ops.push({
        path: `/op${i}`,
        name: `op${i}`,
        opType: "math",
        errors: "Expression error",
        warnings: "",
        hasIssues: true,
      });
    }

    const client = createMockClient({
      healthcheck: async () => unhealthy(ops),
    });

    const result = await postModifyValidate(client, "/project1", undefined, false);

    assert.equal(result.ok, false);
    assert.equal(result.issueCount, 50);
    assert.equal(result.issues.length, 50);
    assert.ok(result.summary.includes("50 issue(s)"));
  });

  it("returns a valid PostValidationResult shape on success", async () => {
    const client = createMockClient();
    const result = await postModifyValidate(client, "/project1");

    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.issueCount, "number");
    assert.equal(typeof result.fixesApplied, "number");
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.issues));
  });

  it("returns a valid PostValidationResult shape on failure", async () => {
    const client = createMockClient({
      healthcheck: async () => unhealthy(ISSUE_OPS),
    });

    const result = await postModifyValidate(client, "/project1", undefined, false);

    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.issueCount, "number");
    assert.equal(typeof result.fixesApplied, "number");
    assert.equal(typeof result.summary, "string");
    assert.ok(Array.isArray(result.issues));
    // issue objects carry the documented fields
    for (const issue of result.issues) {
      assert.equal(typeof issue.path, "string");
      assert.equal(typeof issue.name, "string");
      assert.equal(typeof issue.opType, "string");
      assert.equal(typeof issue.errors, "string");
      assert.equal(typeof issue.warnings, "string");
    }
  });
});
