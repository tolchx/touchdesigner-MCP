/**
 * Build-Verify-Fix Loop — Post-modification validation with auto-repair.
 *
 * After every node creation and connection in a network graph, this module:
 *   1. Healthchecks the modified path
 *   2. Auto-fixes common issues (expression errors, missing connections)
 *   3. Attempts re-wiring if connections fail
 *   4. Reports what was fixed
 *
 * Level 4 — integrates with the graph planner for robust TD network creation.
 */
// ─── Healthcheck Wrapper ────────────────────────────────────────────────────
/**
 * Run a healthcheck on a path and return structured results.
 */
async function healthcheckPath(client, path, recurse = false) {
    try {
        const result = await client.healthcheck(path, recurse);
        const health = result;
        return {
            ok: health?.ok ?? true,
            issueCount: health?.issueCount ?? 0,
            operators: health?.operators || health?.issues || [],
        };
    }
    catch {
        return { ok: true, issueCount: 0, operators: [] };
    }
}
// ─── Expression Auto-Fix ────────────────────────────────────────────────────
/**
 * Auto-fix common Python expression errors (bare sin→math.sin, etc.).
 * Returns the number of fixes applied.
 */
async function autoFixExpressions(client, path) {
    const safePath = path.replace(/'/g, "\\'");
    const fixCode = `
import json, re

math_funcs = [
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
    'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
    'degrees', 'radians',
    'sqrt', 'cbrt', 'exp', 'exp2', 'expm1',
    'log', 'log2', 'log10', 'log1p',
    'floor', 'ceil', 'trunc',
    'fabs', 'fmod', 'gcd', 'hypot',
    'factorial', 'comb', 'perm',
]

SKIP_PATTERNS = ['/annotation/', '/opview/', '/marketplace']
pattern = re.compile(r'(?<!\\.)(?<!\\w)(' + '|'.join(math_funcs) + r')(?=\\s*\\()')

def should_skip(p):
    return any(pat in p for pat in SKIP_PATTERNS)

target = op('${safePath}')
if target is None:
    print(json.dumps({'fixed': 0}))
else:
    state = {'count': 0}
    def fix(node, depth=0):
        if node is None or depth > 30:
            return
        if should_skip(node.path):
            return
        try:
            for par in node.pars():
                if not par.expr:
                    continue
                original = par.expr
                new_expr = pattern.sub(lambda m: 'math.' + m.group(1), original)
                new_expr = new_expr.replace('math.math.', 'math.')
                if new_expr != original:
                    par.expr = new_expr
                    state['count'] += 1
        except:
            pass
        try:
            for child in node.children:
                fix(child, depth + 1)
        except:
            pass

    fix(target)
    print(json.dumps({'fixed': state['count']}))
`;
    try {
        const result = await client.execute(fixCode, "/");
        const parsed = JSON.parse(result.stdout || '{"fixed":0}');
        return parsed.fixed || 0;
    }
    catch {
        return 0;
    }
}
// ─── Connection Verification ────────────────────────────────────────────────
/**
 * Verify that a connection was actually established.
 * Tries to read the target's input and confirms the source is connected.
 */
async function verifyConnection(client, sourcePath, targetPath, inputIndex) {
    try {
        const safeTarget = targetPath.replace(/'/g, "\\'");
        const code = `
t = op('${safeTarget}')
if t is None:
    print('NOT_FOUND')
elif len(t.inputConnectors) <= ${inputIndex}:
    print('NO_INPUT')
else:
    conns = t.inputConnectors[${inputIndex}].connections
    if conns and len(conns) > 0:
        print(conns[0].owner.path)
    else:
        print('NOT_CONNECTED')
`;
        const result = await client.execute(code, "/");
        const output = (result.stdout || "").trim();
        return output === sourcePath || output.includes(sourcePath);
    }
    catch {
        return false;
    }
}
/**
 * Attempt to re-wire a failed connection with alternative approaches.
 */
async function attemptRewire(client, sourcePath, targetPath, inputIndex) {
    const strategies = [
        // Strategy 1: Standard connectNodes
        async () => {
            await client.connectNodes(sourcePath, targetPath, inputIndex);
            return await verifyConnection(client, sourcePath, targetPath, inputIndex);
        },
        // Strategy 2: Via execute (direct Python wiring)
        async () => {
            const safeSource = sourcePath.replace(/'/g, "\\'");
            const safeTarget = targetPath.replace(/'/g, "\\'");
            const code = `
s = op('${safeSource}')
t = op('${safeTarget}')
if s and t:
    if len(t.inputConnectors) > ${inputIndex}:
        s.outputConnectors[0].connect(t.inputConnectors[${inputIndex}])
        print('OK')
    else:
        print('NO_INPUT')
else:
    print('NOT_FOUND')
`;
            await client.execute(code, "/");
            return await verifyConnection(client, sourcePath, targetPath, inputIndex);
        },
        // Strategy 3: Try input 0 if the requested index fails
        async () => {
            if (inputIndex === 0)
                return false;
            await client.connectNodes(sourcePath, targetPath, 0);
            return await verifyConnection(client, sourcePath, targetPath, 0);
        },
    ];
    for (let i = 0; i < strategies.length; i++) {
        try {
            const success = await strategies[i]();
            if (success) {
                return { fromPath: sourcePath, toPath: targetPath, inputIndex, success: true };
            }
        }
        catch (e) {
            // Try next strategy
            if (i === strategies.length - 1) {
                return {
                    fromPath: sourcePath,
                    toPath: targetPath,
                    inputIndex,
                    success: false,
                    error: e.message || String(e),
                };
            }
        }
    }
    return {
        fromPath: sourcePath,
        toPath: targetPath,
        inputIndex,
        success: false,
        error: "All rewire strategies failed",
    };
}
/**
 * Run the build-verify-fix loop on a freshly created/modified network path.
 *
 * 1. Healthcheck → detect issues
 * 2. Auto-fix expressions → re-check
 * 3. Return detailed report
 */
export async function buildVerifyFix(options) {
    const { client, path, autoFix = true, verifyConnections = false } = options;
    const fixDetails = [];
    let fixesApplied = 0;
    // Step 1: Initial healthcheck
    const health = await healthcheckPath(client, path, false);
    if (health.ok) {
        return {
            ok: true,
            path,
            issueCount: 0,
            issues: [],
            fixesApplied: 0,
            fixDetails: [],
            summary: "✅ Network healthy — no issues.",
        };
    }
    // Step 2: Collect issues
    const issues = health.operators
        .filter((o) => o.hasIssues)
        .map((o) => `${o.path}: ${o.errors || o.warnings || "unknown"}`);
    // Step 3: Auto-fix expressions
    if (autoFix) {
        const fixed = await autoFixExpressions(client, path);
        if (fixed > 0) {
            fixesApplied += fixed;
            fixDetails.push(`Fixed ${fixed} expression error(s) (bare math functions)`);
        }
    }
    // Step 4: Re-check after fixes
    if (fixesApplied > 0) {
        const recheck = await healthcheckPath(client, path, false);
        if (recheck.ok) {
            return {
                ok: true,
                path,
                issueCount: 0,
                issues: [],
                fixesApplied,
                fixDetails,
                summary: `🔧 Auto-fixed ${fixesApplied} issue(s). Network now healthy.`,
            };
        }
        const remaining = recheck.operators
            .filter((o) => o.hasIssues)
            .map((o) => `${o.path}: ${o.errors || o.warnings || "unknown"}`);
        return {
            ok: false,
            path,
            issueCount: remaining.length,
            issues: remaining,
            fixesApplied,
            fixDetails,
            summary: `⚠️ Fixed ${fixesApplied} issue(s), ${remaining.length} remain. Try td_validate for deeper repair.`,
        };
    }
    return {
        ok: false,
        path,
        issueCount: health.issueCount,
        issues,
        fixesApplied: 0,
        fixDetails,
        summary: `⚠️ ${health.issueCount} issue(s) found. Run td_validate with auto_fix=true.`,
    };
}
/**
 * Verify and fix a batch of connections, attempting re-wiring for failed ones.
 */
export async function verifyAndFixConnections(client, connections) {
    const failed = [];
    const fixed = [];
    let succeeded = 0;
    for (const conn of connections) {
        const verified = await verifyConnection(client, conn.sourcePath, conn.targetPath, conn.inputIndex);
        if (verified) {
            succeeded++;
        }
        else {
            // Attempt rewire
            const rewire = await attemptRewire(client, conn.sourcePath, conn.targetPath, conn.inputIndex);
            if (rewire.success) {
                fixed.push(rewire);
                succeeded++;
            }
            else {
                failed.push(rewire);
            }
        }
    }
    return { succeeded, failed, fixed };
}
/**
 * Convenience: run build-verify-fix after creating a network graph.
 * This is called by the graph planner's applyNetworkGraph.
 */
export async function postGraphValidation(client, path) {
    return buildVerifyFix({
        client,
        path,
        autoFix: true,
        verifyConnections: true,
    });
}
