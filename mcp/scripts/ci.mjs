#!/usr/bin/env node
/**
 * ci.mjs — the CI gate: BOTH test legs plus a coverage floor.
 *
 *   leg Node/TS ....... c8 (V8 coverage) over `node --test test/*.test.js`
 *                       thresholds enforced by c8 itself (--check-coverage)
 *   leg Python ........ coverage.py over `python -m unittest discover tests`,
 *                       floor enforced by `coverage report --fail-under`
 *                       (product code only: tests do not measure themselves)
 *
 * Floors were set 2026-09-24 from what is MEASURED today (not invented):
 * rounded down just enough to stay green now and fail on any regression:
 *   Node ... 63% lines / 81% branches / 75% functions   (measured: 63.17 / 81.65 / 75.25)
 *   Python . 44% statements over product code only      (measured: 44)
 *
 * Exit 0 only if every step passes AND both floors hold. Any failure or a
 * floor miss prints FAIL lines with the measured numbers and exits 1.
 *
 * Thresholds live in ONE place: this file's THRESHOLDS (Node) and
 * .coveragerc fail_under (Python). Keep them in sync when raising.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");
const MCP = resolve(__dirname, "..");

// Node leg thresholds — keep in sync with the Python floor in .coveragerc.
const THRESHOLDS = { lines: 63, branches: 81, functions: 75 };

const isWin = process.platform === "win32";
const results = []; // { leg, step, ok, detail }
let failed = false;

function run(name, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? REPO,
    encoding: "utf8",
    shell: isWin,
    timeout: opts.timeout ?? 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  return { r, out };
}

function step(leg, label, ok, detail = "") {
  results.push({ leg, label, ok, detail });
  if (!ok) failed = true;
}

// ── Leg Node/TS ────────────────────────────────────────────────────────────
const ts = run("ts", "npx", ["tsc", "-p", "api/tsconfig.json", "--noEmit"], { timeout: 180_000 });
step("node", "typecheck api/tsconfig", ts.r.status === 0, ts.r.status === 0 ? "" : (ts.out || "").slice(-400));

const ts2 = run("ts", "npx", ["tsc", "-p", "mcp/tsconfig.json", "--noEmit"], { timeout: 180_000 });
step("node", "typecheck mcp/tsconfig", ts2.r.status === 0, ts2.r.status === 0 ? "" : (ts2.out || "").slice(-400));

const node = run("node", "npx",
  ["c8", "--check-coverage",
   "--lines", String(THRESHOLDS.lines),
   "--branches", String(THRESHOLDS.branches),
   "--functions", String(THRESHOLDS.functions),
   "--reporter=text", "--reporter=text-summary",
   "node", "--test", "test/*.test.js"],
  { cwd: MCP, timeout: 900_000 });

// c8 exit != 0 means failing tests OR a missed floor.
const nodeFailMatch = (node.out.match(/^# fail (\d+)$/m) ?? [])[1];
const nodePassMatch = (node.out.match(/^# pass (\d+)$/m) ?? [])[1];
const nodeLinesMatch = (node.out.match(/^(?:All files|all files)\s+\|[^|]*\|[^|]*\|[^|]*\|\s*([\d.]+)/m) ?? [])[1];
step("node", "node --test (c8) — tests",
  Number(nodeFailMatch ?? 1) === 0 && nodePassMatch !== undefined,
  nodeFailMatch === undefined ? "no summary parsed" : `pass ${nodePassMatch} / fail ${nodeFailMatch}`);
step("node", `coverage floor lines>=${THRESHOLDS.lines} branches>=${THRESHOLDS.branches} functions>=${THRESHOLDS.functions}`,
  node.r.status === 0,
  nodeLinesMatch ? `lines ${nodeLinesMatch}%` : "floor line not parsed");

// ── Leg Python ─────────────────────────────────────────────────────────────
// Parallel data files from a previous run would poison the total.
spawnSync("cmd", ["/c", "if exist .coverage del /q .coverage"], { cwd: REPO, shell: false });
spawnSync("cmd", ["/c", "del /q /s .coverage.* 2>nul"], { cwd: REPO, shell: false });

const py = run("py", "python",
  ["-m", "coverage", "run", "--parallel-mode", "--rcfile=.coveragerc",
   "-m", "unittest", "discover", "tests"],
  { cwd: REPO, timeout: 900_000 });
const pyRan = (py.out.match(/Ran (\d+) tests?/m) ?? [])[1];
const pyOk = py.r.status === 0 && /(^|\n)OK(\r|\n|$)/.test(py.out);
step("py", "python -m unittest discover tests",
  pyOk, pyRan ? `Ran ${pyRan} tests` : "no summary parsed");

const pyCombine = run("py", "python",
  ["-m", "coverage", "combine", "--rcfile=.coveragerc"], { cwd: REPO, timeout: 120_000 });
// combine exits 2 when there is nothing to combine — fine only if run failed.
const pyReport = run("py", "python",
  ["-m", "coverage", "report", "--rcfile=.coveragerc"], { cwd: REPO, timeout: 120_000 });
const pyTotal = (pyReport.out.match(/TOTAL\s+\d+\s+\d+\s+(\d+)%/) ?? [])[1];
// The report itself enforces the floor via fail_under in .coveragerc.
const pyFloorOk = pyReport.r.status === 0 && Number(pyTotal ?? 0) >= 44;
step("py", "coverage floor (product code, .coveragerc fail_under=44)",
  pyFloorOk, pyTotal ? `product coverage ${pyTotal}%` : "TOTAL line not parsed");

// ── Legible 5-line summary: one line per leg + floor + verdict ─────────────
console.log("");
console.log("════ COVERAGE CI ════");
for (const r of results) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  [${r.leg}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`  ${failed ? "FAIL" : "PASS"}  thresholds: Node lines>=${THRESHOLDS.lines} branches>=${THRESHOLDS.branches} functions>=${THRESHOLDS.functions} · Python product>=44 (coverage.py)`);
console.log(`  verdict: ${failed ? "FAIL" : "PASS"}`);
process.exit(failed ? 1 : 0);
