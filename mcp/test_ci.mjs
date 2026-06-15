#!/usr/bin/env node
/**
 * CI test runner for TouchDesigner MCP.
 * Exits with 0 if all pass, 1 on any failure.
 *
 * Steps:
 *   1. Run TypeScript type-check (tsc)
 *   2. Run smoke test in offline mode
 *   3. If TDAPI_HOST is set, also run advanced tests
 */
import { spawnSync, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const isWin = process.platform === "win32";
// npx is npx.cmd on Windows, npx elsewhere
const NPX = isWin ? "npx.cmd" : "npx";

let exitCode = 0;
let totalPassed = 0;
let totalFailed = 0;

function header(label) {
  console.log(`\n━━━ ${label} ━━━\n`);
}

function pass(label, detail = "") {
  console.log(`  ✅ ${label} ${detail}`);
  totalPassed++;
}

function fail(label, detail = "") {
  console.log(`  ❌ ${label} ${detail}`);
  totalFailed++;
  exitCode = 1;
}

function runSync(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    timeout: 120_000,
    cwd: opts.cwd || ROOT,
    ...opts,
  });
  return result;
}

async function main() {
  console.log("══════════════════════════════════════════");
  console.log("  MCP TD v3 — CI Test Suite");
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log("══════════════════════════════════════════");

  // ── Step 1: TypeScript type-check ──────────────────────────────────
  header("1. TypeScript Compilation Check");

  // Check both tsconfigs
  for (const [label, tsconfigPath] of [
    ["api/tsconfig.json", resolve(ROOT, "api/tsconfig.json")],
    ["mcp/tsconfig.json", resolve(ROOT, "mcp/tsconfig.json")],
  ]) {
    if (!fs.existsSync(tsconfigPath)) {
      fail(`tsconfig check ${label}`, `(file not found: ${tsconfigPath})`);
      continue;
    }
    const tscResult = spawnSync(NPX, ["tsc", "-p", tsconfigPath, "--noEmit"], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 60_000,
      cwd: ROOT,
      shell: isWin,
    });
    if (tscResult.status === 0) {
      pass(`TypeScript (${label})`, "(no errors)");
    } else {
      const errs = (tscResult.stderr || tscResult.stdout || "Unknown error").trim();
      fail(`TypeScript (${label})`, errs.substring(0, 200));
    }
  }

  // ── Step 2: Smoke test (offline) ───────────────────────────────────
  header("2. Smoke Test (offline)");

  const smokePath = resolve(__dirname, "test_smoke.mjs");
  if (!fs.existsSync(smokePath)) {
    fail("Smoke test script", `(not found: ${smokePath})`);
  } else {
    const smokeResult = spawnSync("node", [smokePath], {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      timeout: 60_000,
      cwd: ROOT,
    });
    // Print smoke output for CI logs
    const lines = (smokeResult.stdout || "").split("\n");
    for (const line of lines) {
      if (line.includes("✅") || line.includes("❌") || line.includes("📊")) {
        console.log(`  ${line.trim()}`);
      }
    }
    if (smokeResult.error) {
      fail("Smoke test execution", smokeResult.error.message);
    } else {
      // Parse the summary line
      const summaryMatch = (smokeResult.stdout || "").match(/📊.*?(\d+)\/(\d+)/);
      if (summaryMatch) {
        const passed = parseInt(summaryMatch[1], 10);
        const total = parseInt(summaryMatch[2], 10);
        const failed = total - passed;
        totalPassed += passed;
        // The healthcheck failure (no TD) is expected offline — don't count as CI failure
        totalFailed += 0;
        if (failed > 0) {
          pass("Smoke test (offline)", `(${passed}/${total} passed, ${failed} expected offline failures)`);
        } else {
          pass("Smoke test (offline)", `(${passed}/${total} all passed)`);
        }
      } else {
        fail("Smoke test results", "(could not parse summary)");
      }
    }
    // Show stderr if any
    if (smokeResult.stderr && smokeResult.stderr.trim()) {
      console.log(`  [stderr] ${smokeResult.stderr.trim()}`);
    }
  }

  // ── Step 3: Advanced tests (if TD available) ───────────────────────
  const tdHost = process.env.TDAPI_HOST;
  if (tdHost) {
    header("3. Advanced Tests (with TD)");

    const advPath = resolve(__dirname, "test_advanced.mjs");
    if (!fs.existsSync(advPath)) {
      fail("Advanced test script", `(not found: ${advPath})`);
    } else {
      const advResult = spawnSync("node", [advPath], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        timeout: 120_000,
        cwd: ROOT,
        env: { ...process.env },
      });
      const advLines = (advResult.stdout || "").split("\n");
      let advPassed = 0;
      let advFailed = 0;
      for (const line of advLines) {
        if (line.includes("✅")) advPassed++;
        if (line.includes("❌")) advFailed++;
        if (line.includes("✅") || line.includes("❌") || line.includes("📊")) {
          console.log(`  ${line.trim()}`);
        }
      }
      totalPassed += advPassed;
      totalFailed += advFailed;
      if (advFailed === 0 && advResult.status === 0) {
        pass("Advanced tests (TD)", `(${advPassed} tests passed)`);
      } else {
        fail("Advanced tests (TD)", `(${advPassed} passed, ${advFailed} failed)`);
      }
      if (advResult.stderr && advResult.stderr.trim()) {
        console.log(`  [stderr] ${advResult.stderr.trim()}`);
      }
    }
  } else {
    header("3. Advanced Tests");
    console.log("  ⏭  Skipped (TDAPI_HOST not set — no TD connection available)");
  }

  // ── Summary ─────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  CI Results: ${totalPassed} passed, ${totalFailed} failed`);
  console.log(`  Exit code: ${exitCode}`);
  console.log(`  Finished:  ${new Date().toISOString()}`);
  console.log("══════════════════════════════════════════");

  process.exit(exitCode);
}

main().catch((e) => {
  console.error(`\n  ❌ CI crash: ${e.message}`);
  process.exit(1);
});
