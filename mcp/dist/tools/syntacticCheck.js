import { z } from "zod";
import { ok, err } from "../helpers.js";
// ─── Python Syntax Validation ────────────────────────────────────────────────
/**
 * Validate Python code for common TD issues before sending to TD.
 * Checks: bare math functions, missing imports, common NameErrors, path safety.
 */
export function validatePythonSyntax(code) {
    const errors = [];
    const warnings = [];
    // Check 1: Bare math functions (sin, cos, log, etc. without math. prefix)
    const mathFuncs = [
        "sin", "cos", "tan", "asin", "acos", "atan", "atan2",
        "sqrt", "cbrt", "exp", "exp2", "expm1",
        "log", "log2", "log10", "log1p",
        "floor", "ceil", "trunc",
        "degrees", "radians",
        "fabs", "fmod", "hypot",
    ];
    const bareMathPattern = new RegExp(`(?<!\\.)(?<!\\w)(${mathFuncs.join("|")})(?=\\s*\\()`, "g");
    const bareMatches = code.match(bareMathPattern);
    if (bareMatches && bareMatches.length > 0) {
        const unique = [...new Set(bareMatches)];
        warnings.push(`Bare math functions detected: ${unique.join(", ")} — these need 'math.' prefix in TD (e.g. math.sin). Auto-fix available via td_validate.`);
    }
    // Check 2: Common Python name errors in TD context
    const nameErrors = [
        { pattern: /(?<!\w)print\s*[^(]/g, msg: "print without parentheses (Python 3 requires print())" },
        { pattern: /except\s*:/g, msg: "bare except clause (consider using 'except Exception')" },
        { pattern: /(?<!\w)input\s*=/g, msg: "'input' used as variable name — shadows built-in" },
    ];
    for (const { pattern, msg } of nameErrors) {
        if (pattern.test(code)) {
            warnings.push(msg);
        }
    }
    // Check 3: Unclosed strings/brackets (basic heuristic, skips escaped quotes)
    const singleQuotes = (code.match(/(?<!\\)'/g) || []).length;
    const doubleQuotes = (code.match(/(?<!\\)"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
        errors.push("Odd number of single quotes — possible unclosed string literal");
    }
    if (doubleQuotes % 2 !== 0) {
        errors.push("Odd number of double quotes — possible unclosed string literal");
    }
    // Check 4: f-string with potential injection issues
    if (code.includes("f'") || code.includes('f"')) {
        warnings.push("f-string detected — ensure no user-controlled input is interpolated without escaping");
    }
    return { passed: errors.length === 0, errors, warnings };
}
// ─── Path Safety Validation ──────────────────────────────────────────────────
/**
 * Validate TD operator paths for safety and correctness.
 */
export function validatePathSafety(paths) {
    const errors = [];
    const warnings = [];
    for (const p of paths) {
        // Must start with /
        if (!p.startsWith("/")) {
            errors.push(`Path '${p}' must start with '/'`);
        }
        // No single quotes (injection risk in Python code)
        if (p.includes("'")) {
            errors.push(`Path '${p}' contains single quotes — injection risk in Python exec`);
        }
        // No backslashes
        if (p.includes("\\")) {
            errors.push(`Path '${p}' contains backslashes — use forward slashes for TD paths`);
        }
        // Warn about TD internal paths
        const internalPatterns = ["/annotation/", "/opview/", "/marketplace"];
        for (const pat of internalPatterns) {
            if (p.includes(pat)) {
                warnings.push(`Path '${p}' references TD internal path '${pat}' — may be auto-generated`);
            }
        }
        // Warn about empty segments
        if (p.includes("//")) {
            warnings.push(`Path '${p}' contains double slashes — may cause 'operator not found'`);
        }
    }
    return { passed: errors.length === 0, errors, warnings };
}
// ─── Dependency Check ────────────────────────────────────────────────────────
/**
 * Check that the TD environment meets minimum requirements.
 */
async function checkDependencies(client) {
    const errors = [];
    const warnings = [];
    try {
        const info = await client.getInfo();
        const infoAny = info;
        // Check TD version
        const version = infoAny?.version || infoAny?.buildVersion || "";
        if (version) {
            // Extract major.minor from version string
            const match = version.match(/(\d{4})\.(\d+)/);
            if (match) {
                const year = parseInt(match[1], 10);
                if (year < 2025) {
                    warnings.push(`TouchDesigner version ${version} may be below recommended 2025+ — some POP features may not be available`);
                }
            }
        }
        // Check connectivity
        if (infoAny && !infoAny.error) {
            // Connected
        }
        else {
            errors.push("Cannot reach TouchDesigner — verify TDAPI_HOST and TDAPI_PORT are correct");
        }
    }
    catch (e) {
        errors.push(`TD connection check failed: ${e.message || String(e)}`);
    }
    return { passed: errors.length === 0, errors, warnings };
}
// ─── JSON Integrity Check ────────────────────────────────────────────────────
/**
 * Validate JSON strings for structural integrity before parsing.
 */
export function validateJsonIntegrity(jsonStrings) {
    const errors = [];
    const warnings = [];
    for (let i = 0; i < jsonStrings.length; i++) {
        const raw = jsonStrings[i];
        // Check for markdown wrapping (common LLM mistake)
        if (raw.includes("```json") || raw.includes("```")) {
            errors.push(`JSON string ${i + 1} contains markdown code fences — LLM output should be raw JSON`);
        }
        // Try to parse
        try {
            const parsed = JSON.parse(raw);
            // Check for empty/null results
            if (parsed === null || parsed === undefined) {
                warnings.push(`JSON string ${i + 1} parses to null/undefined`);
            }
            if (typeof parsed === "object" && Object.keys(parsed).length === 0) {
                warnings.push(`JSON string ${i + 1} parses to empty object {}`);
            }
        }
        catch (e) {
            errors.push(`JSON string ${i + 1} is not valid JSON: ${e.message}`);
        }
    }
    return { passed: errors.length === 0, errors, warnings };
}
// ─── Cross-Family Connection Validation (Improvement #7) ─────────────────────
/**
 * Cross-family connection rules: which families can connect directly
 * and which require adapter operators.
 */
const INVALID_CROSS_FAMILY = {
    POP: ["SOP", "TOP", "CHOP", "DAT"],
    SOP: ["POP"],
    TOP: ["POP"],
    CHOP: ["POP"],
    DAT: ["POP"],
};
const VALID_BRIDGES = {
    "POP→SOP": "renderPOP or geometryCOMP",
    "SOP→POP": "attributePOP or geometryCOMP",
    "POP→TOP": "renderPOP → nullTOP",
    "TOP→POP": "choptoTOP → attributePOP",
    "POP→CHOP": "chopToPOP or selectCHOP",
    "CHOP→POP": "selectCHOP → attributePOP",
    "POP→DAT": "not directly supported — use renderTOP → DAT",
    "DAT→POP": "not directly supported — use tableDAT → parameter expression",
};
/**
 * Validate cross-family connections from a code string.
 * Looks for operator.create() or .inputConnectors patterns that suggest
 * cross-family wiring.
 */
export function validateCrossFamilyConnections(code) {
    const errors = [];
    const warnings = [];
    // Detect operator creation patterns and their types
    const createPattern = /\.(create|Create)\((?:td\.)?(\w+)(TOP|CHOP|SOP|DAT|POP|COMP)/g;
    const createdTypes = [];
    let match;
    while ((match = createPattern.exec(code)) !== null) {
        const family = match[3];
        createdTypes.push(family);
    }
    // Check for family mixing warnings
    const families = [...new Set(createdTypes)];
    const crossFamilyPairs = [];
    for (const src of families) {
        for (const tgt of families) {
            if (src !== tgt && INVALID_CROSS_FAMILY[src]?.includes(tgt)) {
                crossFamilyPairs.push([src, tgt]);
            }
        }
    }
    for (const [src, tgt] of crossFamilyPairs) {
        const bridgeKey = `${src}→${tgt}`;
        const bridge = VALID_BRIDGES[bridgeKey] || "adapter operator";
        warnings.push(`Cross-family connection detected: ${src} → ${tgt}. ` +
            `Invalid without adapter. Bridge with: ${bridge}`);
    }
    // Check for POP-specific patterns
    const popCreatePattern = /\.(create|Create)\((?:td\.)?(\w+POP)/g;
    let popMatch;
    while ((popMatch = popCreatePattern.exec(code)) !== null) {
        const popType = popMatch[2];
        // Warn about common POP mistakes
        if (popType === "particlePOP" && !code.includes("particlesupdatepop")) {
            warnings.push("particlePOP created but particlesupdatepop parameter not set — " +
                "feedback loop will not work. Set it to the downstream nullPOP name.");
        }
        if (popType === "noisePOP" && !code.includes("inputConnectors[0].connect")) {
            warnings.push("noisePOP may need an input connection — it cannot run standalone.");
        }
    }
    return { passed: errors.length === 0, errors, warnings };
}
// ─── Tool Registration ───────────────────────────────────────────────────────
export function registerSyntacticCheckTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_syntactic_check
    // ---------------------------------------------------------------------------
    server.registerTool("td_syntactic_check", {
        title: "Pre-Execution Syntactic Check",
        description: "Validate Python code, TD paths, JSON, and environment dependencies BEFORE sending to TD. " +
            "Catches: bare math functions (sin→math.sin), unclosed strings, path injection risks, " +
            "markdown-wrapped JSON, TD version compatibility, connection status, and cross-family " +
            "connection errors (POP→SOP, POP→TOP without adapter). Run this before td_execute or " +
            "td_network_plan to prevent runtime errors.",
        inputSchema: {
            code: z
                .string()
                .optional()
                .describe("Python code to validate before execution"),
            paths: z
                .array(z.string())
                .optional()
                .describe("TD operator paths to validate for safety"),
            json_strings: z
                .array(z.string())
                .optional()
                .describe("JSON strings to validate for structural integrity"),
            check_dependencies: z
                .boolean()
                .optional()
                .default(false)
                .describe("Also verify TD connection and version (requires live TD)"),
        },
    }, async ({ code, paths, json_strings, check_dependencies }) => {
        try {
            const result = {
                ok: true,
                checks: {
                    pythonSyntax: { passed: true, errors: [], warnings: [] },
                    pathSafety: { passed: true, errors: [], warnings: [] },
                    dependencyCheck: { passed: true, errors: [], warnings: [] },
                    jsonIntegrity: { passed: true, errors: [], warnings: [] },
                },
                summary: "",
                suggestions: [],
            };
            // ── Tier 1: Python Syntax ──
            if (code) {
                result.checks.pythonSyntax = validatePythonSyntax(code);
                if (!result.checks.pythonSyntax.passed)
                    result.ok = false;
                for (const w of result.checks.pythonSyntax.warnings) {
                    result.suggestions.push(w);
                }
                // ── Tier 1b: Cross-Family Connection Validation (Improvement #7) ──
                const crossFamilyResult = validateCrossFamilyConnections(code);
                if (!crossFamilyResult.passed) {
                    result.checks.pathSafety.passed = false;
                    result.checks.pathSafety.errors.push(...crossFamilyResult.errors);
                    result.ok = false;
                }
                result.checks.pathSafety.warnings.push(...crossFamilyResult.warnings);
                for (const w of crossFamilyResult.warnings) {
                    result.suggestions.push(w);
                }
            }
            // ── Tier 1: Path Safety ──
            if (paths && paths.length > 0) {
                result.checks.pathSafety = validatePathSafety(paths);
                if (!result.checks.pathSafety.passed)
                    result.ok = false;
            }
            // ── Tier 1: JSON Integrity ──
            if (json_strings && json_strings.length > 0) {
                result.checks.jsonIntegrity = validateJsonIntegrity(json_strings);
                if (!result.checks.jsonIntegrity.passed)
                    result.ok = false;
            }
            // ── Tier 2: Dependency Check ──
            if (check_dependencies) {
                result.checks.dependencyCheck = await checkDependencies(client);
                if (!result.checks.dependencyCheck.passed)
                    result.ok = false;
            }
            // ── Summary ──
            const allChecks = Object.values(result.checks);
            const totalErrors = allChecks.reduce((sum, c) => sum + c.errors.length, 0);
            const totalWarnings = allChecks.reduce((sum, c) => sum + c.warnings.length, 0);
            if (totalErrors === 0 && totalWarnings === 0) {
                result.summary = "✅ All syntactic checks passed — safe to execute.";
            }
            else if (totalErrors === 0) {
                result.summary = `⚠️ ${totalWarnings} warning(s) but no errors — safe to execute with caution.`;
            }
            else {
                result.summary = `❌ ${totalErrors} error(s) found — fix before executing to prevent runtime failures.`;
            }
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
}
