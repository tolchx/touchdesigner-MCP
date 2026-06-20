/**
 * Unit tests for loadBuiltinTemplates warning behavior in networkTemplates.ts.
 *
 * Since loadBuiltinTemplates() is private and runs at module import time,
 * we test the warning code path by spawning child processes that mock
 * fs via CJS require() (which gives a mutable exports object) before
 * importing the ESM networkTemplates module.
 *
 * FRAGILITY NOTE: This approach relies on an implementation detail of
 * Node.js CJS-to-ESM interop — that patching properties on the CJS
 * exports object (obtained via createRequire) is visible to ESM named
 * imports (e.g. `import { existsSync } from "node:fs"`). This works
 * because ESM named imports from CJS modules are implemented as getters
 * on the module namespace that read from the cached CJS exports object.
 * If Node.js changes this behavior, these tests will break silently.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

const moduleUrl = pathToFileURL(resolve("mcp/dist/networkTemplates.js")).href;

/**
 * Spawn a child process that mocks fs via CJS require() before importing
 * the networkTemplates ESM module. Returns stderr output.
 *
 * @param {"missing"|"invalid"|"empty_templates"|"valid"} scenario
 */
async function importWithMock(scenario) {
  // Build the mock script with scenario-specific logic.
  // For "missing": existsSync returns false for all JSON paths → triggers "No builtin templates found"
  // For "invalid"/"empty_templates": existsSync falls through to real check, readFileSync returns mock content
  // For "valid": both fall through to real functions → no warnings
  let existsSyncBody;
  if (scenario === "missing") {
    existsSyncBody = 'return false;';
  } else {
    existsSyncBody = 'return origExistsSync(p);';
  }

  let readFileSyncBody;
  if (scenario === "invalid") {
    readFileSyncBody = 'return "this is not valid json {{{";';
  } else if (scenario === "empty_templates") {
    readFileSyncBody = 'return JSON.stringify({ operators: [] });';
  } else {
    readFileSyncBody = '';
  }

  const script = `
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    const fs = require("node:fs");
    const origExistsSync = fs.existsSync;
    const origReadFileSync = fs.readFileSync;

    fs.existsSync = (p) => {
      if (String(p).includes("builtin-templates.json")) {
        ${existsSyncBody}
      }
      return origExistsSync(p);
    };

    fs.readFileSync = (p, enc) => {
      if (String(p).includes("builtin-templates.json")) {
        ${readFileSyncBody}
      }
      return origReadFileSync(p, enc);
    };

    await import(${JSON.stringify(moduleUrl)});
  `;
  const { stderr } = await exec("node", ["--input-type=module", "-e", script]);
  return stderr;
}

describe("loadBuiltinTemplates — warning logs", () => {
  it("should warn when builtin templates JSON file is not found", async () => {
    const stderr = await importWithMock("missing");
    assert.ok(
      stderr.includes("[networkTemplates] No builtin templates found"),
      `Expected 'No builtin templates found' warning in stderr:\n${stderr}`
    );
    assert.ok(
      !stderr.includes("[networkTemplates] Failed to load builtin templates"),
      `Should NOT have 'Failed to load' warning:\n${stderr}`
    );
  });

  it("should warn on invalid JSON content", async () => {
    const stderr = await importWithMock("invalid");
    assert.ok(
      stderr.includes("[networkTemplates] Failed to load builtin templates"),
      `Expected 'Failed to load' warning in stderr:\n${stderr}`
    );
    assert.ok(
      !stderr.includes("[networkTemplates] No builtin templates found"),
      `Should NOT have 'No builtin templates found' warning:\n${stderr}`
    );
  });

  it("should not warn when JSON is valid but has no templates key", async () => {
    const stderr = await importWithMock("empty_templates");
    assert.ok(
      !stderr.includes("[networkTemplates] Failed to load builtin templates"),
      `Should NOT warn on valid JSON with missing templates key:\n${stderr}`
    );
    assert.ok(
      !stderr.includes("[networkTemplates] No builtin templates found"),
      `Should NOT warn when file exists:\n${stderr}`
    );
  });

  it("should load templates successfully (no warning) when JSON is valid", async () => {
    const stderr = await importWithMock("valid");
    assert.ok(
      !stderr.includes("[networkTemplates] No builtin templates found"),
      `Should NOT warn when JSON file exists:\n${stderr}`
    );
    assert.ok(
      !stderr.includes("[networkTemplates] Failed to load builtin templates"),
      `Should NOT warn on valid JSON:\n${stderr}`
    );
  });
});
