import type { TDClient } from "td-api";

/**
 * Post-modification validation result.
 * Lightweight healthcheck run after any tool that modifies TD state.
 */
export interface PostValidationResult {
  /** Whether the network is healthy after the modification. */
  ok: boolean;
  /** Number of issues detected. */
  issueCount: number;
  /** Issues found (only operators with errors/warnings). */
  issues: Array<{
    path: string;
    name: string;
    opType: string;
    errors: string;
    warnings: string;
  }>;
  /** Auto-fixes applied (if any expression errors were detected). */
  fixesApplied: number;
  /** Human-readable summary for the AI agent. */
  summary: string;
}

/**
 * Lightweight post-modification validation.
 *
 * Runs a non-recursive healthcheck on the specified path (or its parent),
 * then optionally auto-fixes common expression errors (bare sin→math.sin, etc.).
 *
 * This is designed to be called AFTER a modification tool succeeds, to catch
 * issues introduced by the modification immediately rather than later.
 *
 * @param client - TDClient instance
 * @param path - The operator path that was modified
 * @param parentPath - Optional parent path to healthcheck (defaults to path's parent)
 * @param autoFix - Whether to auto-fix expression errors (default: true)
 * @returns PostValidationResult
 */
export async function postModifyValidate(
  client: TDClient,
  path: string,
  parentPath?: string,
  autoFix: boolean = true
): Promise<PostValidationResult> {
  // Determine the path to healthcheck
  // For create/copy: validate the parent (new op might have errors)
  // For connect/params: validate the specific op
  const checkPath = parentPath || path;

  try {
    // Step 1: Lightweight healthcheck (non-recursive for speed)
    const health = await client.healthcheck(checkPath, false);

    const hasIssues =
      health && !health.ok && health.issueCount > 0;

    if (!hasIssues) {
      return {
        ok: true,
        issueCount: 0,
        issues: [],
        fixesApplied: 0,
        summary: "✅ Network healthy — no issues detected after modification.",
      };
    }

    const issues = health.operators?.filter(
      (o) => o.hasIssues
    ) || [];

    // Step 2: Auto-fix expression errors if enabled
    let fixesApplied = 0;
    if (autoFix && issues.length > 0) {
      const fixResult = await autoFixExpressions(client, checkPath);
      fixesApplied = fixResult;
    }

    // Step 3: Re-check after fixes
    if (fixesApplied > 0) {
      const recheck = await client.healthcheck(checkPath, false);
      const stillHasIssues =
        recheck && !recheck.ok && recheck.issueCount > 0;

      if (!stillHasIssues) {
        return {
          ok: true,
          issueCount: 0,
          issues: [],
          fixesApplied,
          summary: `🔧 Auto-fixed ${fixesApplied} expression error(s). Network now healthy.`,
        };
      }

      const remaining = recheck.operators?.filter(
        (o) => o.hasIssues
      ) || [];
      return {
        ok: false,
        issueCount: remaining.length,
        issues: remaining.map((i: any) => ({
          path: i.path,
          name: i.name,
          opType: i.opType,
          errors: i.errors || "",
          warnings: i.warnings || "",
        })),
        fixesApplied,
        summary:
          `🔧 Fixed ${fixesApplied} expression(s), but ${remaining.length} issue(s) remain. ` +
          `Run td_validate for full diagnosis.`,
      };
    }

    // Issues found but no auto-fix possible
    return {
      ok: false,
      issueCount: issues.length,
      issues: issues.map((i: any) => ({
        path: i.path,
        name: i.name,
        opType: i.opType,
        errors: i.errors || "",
        warnings: i.warnings || "",
      })),
      fixesApplied: 0,
      summary:
        `⚠️ ${issues.length} issue(s) detected after modification. ` +
        `Run td_validate with auto_fix=true for full repair.`,
    };
  } catch (e: any) {
    // Don't fail the main operation if validation fails
    return {
      ok: false,
      issueCount: -1,
      issues: [],
      fixesApplied: 0,
      summary: `⚠️ Post-validation skipped: ${e.message || "unknown error"}`,
    };
  }
}

/**
 * Auto-fix common expression errors (bare sin→math.sin, etc.).
 * Returns the number of fixes applied.
 */
async function autoFixExpressions(
  client: TDClient,
  path: string
): Promise<number> {
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
  } catch {
    return 0;
  }
}

/**
 * Get the parent path of a TD operator path.
 * e.g. "/project1/noise1" → "/project1"
 *      "/project1/geo1/null1" → "/project1/geo1"
 */
export function getParentPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}
