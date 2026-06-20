import { z } from "zod";
import { ok, err } from "../helpers.js";
import { buildClassifyPythonCode } from "./classify.js";
export function registerSafeModeTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_safe_plan — diagnose-first workflow tool
    // ---------------------------------------------------------------------------
    server.registerTool("td_safe_plan", {
        title: "Safe Plan (Diagnose First)",
        description: "Safe mode workflow: diagnose the current TD state before making changes. " +
            "Combines spatial context (*here/*this resolution) + healthcheck + error classification " +
            "in a single call. Returns the resolved paths, current issues, and a recommended plan. " +
            "ALWAYS call this tool BEFORE making any modifications to TD when the user uses *here, *this, " +
            "or refers to their current view/selection. This prevents accidental changes to the wrong operators.",
        inputSchema: {
            path: z
                .string()
                .optional()
                .describe("Specific path to diagnose. If omitted, uses *here (current network) automatically."),
            include_children: z
                .boolean()
                .optional()
                .default(true)
                .describe("Include child operators in healthcheck (default: true)"),
        },
    }, async ({ path: opPath, include_children }) => {
        try {
            const result = {
                steps: [],
                resolvedPaths: {},
                issues: null,
                classification: null,
                plan: null,
            };
            // ── Step 1: Spatial context (resolve *here / *this) ──
            let ctx = null;
            try {
                const spatial = await client.getSpatialContext();
                ctx = spatial?.context ?? null;
                result.steps.push({ step: "spatial_context", result: spatial });
            }
            catch {
                // TD may be disconnected — continue without spatial context
                result.steps.push({
                    step: "spatial_context",
                    result: { error: "Could not get spatial context" },
                });
            }
            // Resolve the target path
            let targetPath = opPath;
            if (!targetPath && ctx?.spatialMarkers) {
                targetPath = ctx.spatialMarkers["*here"];
            }
            if (!targetPath) {
                targetPath = "/";
            }
            result.resolvedPaths = {
                target: targetPath,
                here: ctx?.spatialMarkers?.["*here"] ?? null,
                this: ctx?.spatialMarkers?.["*this"] ?? null,
                parent: ctx?.spatialMarkers?.["*parent"] ?? null,
                selected: ctx?.spatialMarkers?.["*selected"] ?? [],
                focusedOperator: ctx?.focusedOperator ?? null,
                siblings: ctx?.siblings?.length ?? 0,
            };
            // ── Step 2: Healthcheck ──
            const health = await client.healthcheck(targetPath, include_children ?? true);
            result.steps.push({ step: "healthcheck", result: health });
            const hasIssues = health &&
                !health.ok &&
                health.issueCount > 0;
            result.issues = {
                hasIssues,
                issueCount: health?.issueCount ?? 0,
                operators: health?.operators ?? [],
            };
            // ── Step 3: Classify issues (using shared classifier) ──
            if (hasIssues) {
                try {
                    const healthJson = JSON.stringify(health);
                    const classifyCode = buildClassifyPythonCode(healthJson);
                    const classifyResult = await client.execute(classifyCode, "/");
                    try {
                        result.classification = JSON.parse(classifyResult.stdout || "{}");
                    }
                    catch {
                        result.classification = {};
                    }
                }
                catch {
                    result.classification = {};
                }
            }
            // ── Step 4: Generate plan ──
            result.plan = generateSafePlan(result);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
}
/**
 * Generate a recommended plan based on the diagnosis.
 */
function generateSafePlan(result) {
    const plan = {
        status: "ready",
        recommendations: [],
        warnings: [],
    };
    const issues = result.issues;
    const classification = result.classification;
    const paths = result.resolvedPaths;
    // Check if target exists
    if (!paths.target || paths.target === "/") {
        plan.warnings.push("No specific target path resolved. Consider navigating to a specific network first.");
    }
    // Check for issues
    if (issues?.hasIssues) {
        const counts = classification?.counts ?? {};
        const total = issues.issueCount;
        plan.status = "has_issues";
        plan.recommendations.push(`Found ${total} issue(s) in the network. Review before making changes.`);
        if (counts.expression_error) {
            plan.recommendations.push(`${counts.expression_error} expression error(s) detected — run td_validate with auto_fix=true to fix automatically.`);
        }
        if (counts.glsl_error) {
            plan.recommendations.push(`${counts.glsl_error} GLSL shader error(s) — check shader source code.`);
        }
        if (counts.cook_loop) {
            plan.warnings.push(`${counts.cook_loop} cook loop(s) detected — these may be pre-existing TD infrastructure issues.`);
        }
        if (counts.missing_file) {
            plan.recommendations.push(`${counts.missing_file} missing file(s) — verify file paths before proceeding.`);
        }
    }
    else {
        plan.status = "healthy";
        plan.recommendations.push("Network is healthy. Safe to proceed with modifications.");
    }
    // Context-aware recommendations
    if (paths.selected?.length > 0) {
        plan.recommendations.push(`${paths.selected.length} operator(s) selected — modifications will target: ${paths.selected.join(", ")}`);
    }
    if (paths.focusedOperator) {
        plan.recommendations.push(`Current operator: ${paths.focusedOperator.path} (${paths.focusedOperator.opType})`);
    }
    return plan;
}
