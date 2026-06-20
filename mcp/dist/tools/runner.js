import { z } from "zod";
import { ok, err } from "../helpers.js";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
// ── Constants ──────────────────────────────────────────────────────────
const RUNNER_TIMEOUT_MS = 60_000;
// ── Helpers ────────────────────────────────────────────────────────────
/**
 * Resolve the tests directory relative to the project root.
 */
function testsDir() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // We're in mcp/src/tools/, go up to mcp/ then tests/
    return path.resolve(__dirname, "../../tests");
}
/**
 * List available .mjs test files (without extension) for error hints.
 */
function listAvailableTests() {
    const dir = testsDir();
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.endsWith(".mjs"))
            .map((f) => f.replace(/\.mjs$/, ""));
    }
    catch {
        return [];
    }
}
// ── Registered tool ────────────────────────────────────────────────────
export function registerRunnerTool(server, client) {
    // -----------------------------------------------------------------------
    // td_run_test — ejecutar tests legacy
    // -----------------------------------------------------------------------
    server.registerTool("td_run_test", {
        title: "Run Legacy Test",
        description: "Execute a legacy TouchDesigner MCP test script from the mcp/tests/ directory. " +
            "Runs `node mcp/tests/<name>.mjs` with optional arguments and returns stdout, stderr, " +
            "and the exit code. Timeout is 60 seconds. Use this to validate systems, " +
            "run CI checks, or debug test failures.",
        inputSchema: {
            name: z
                .string()
                .describe("Test file name (without .mjs extension), e.g. 'legacy_test_30systems'"),
            args: z
                .string()
                .optional()
                .describe("Optional command-line arguments passed to the test script"),
        },
    }, async ({ name, args }) => {
        try {
            // Sanitise name to prevent path traversal
            const sanitised = name.replace(/\.\.\//g, "").replace(/\.mjs$/i, "");
            const testFile = path.join(testsDir(), `${sanitised}.mjs`);
            // Check file exists
            if (!fs.existsSync(testFile)) {
                const available = listAvailableTests();
                return ok({
                    success: false,
                    exitCode: -1,
                    stdout: "",
                    stderr: `Test '${sanitised}' not found.`,
                    available,
                });
            }
            const cmd = `node "${testFile}"${args ? " " + args : ""}`;
            let stdout = "";
            let stderr = "";
            let exitCode = -1;
            try {
                const output = execSync(cmd, {
                    timeout: RUNNER_TIMEOUT_MS,
                    encoding: "utf8",
                    maxBuffer: 10 * 1024 * 1024, // 10 MB
                    windowsHide: true,
                });
                stdout = output;
                exitCode = 0;
            }
            catch (e) {
                stdout = e.stdout ?? "";
                stderr = e.stderr ?? "";
                exitCode = e.status ?? -1;
                // If timeout was the cause, report it
                if (e.killed ||
                    (e.message && e.message.includes("timed out"))) {
                    stderr +=
                        "\n[TIMEOUT] Test exceeded 60 seconds and was killed.";
                }
            }
            return ok({
                success: exitCode === 0,
                exitCode,
                stdout,
                stderr,
                name: sanitised,
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
