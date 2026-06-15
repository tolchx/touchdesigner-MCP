import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

/**
 * Build Python code that auto-fixes common TD expression errors.
 *
 * Fixes applied:
 *   1. Bare math functions  →  math.fn()   (sin, cos, log, etc.)
 *   2. math.math.fn()      →  math.fn()   (double-prefix safety)
 *
 * Skips TD internal paths (/annotation/, /opview/, /marketplace)
 * to avoid corrupting auto-generated components.
 */
function buildAutoFixCode(targetPath: string): string {
  const safePath = targetPath.replace(/'/g, "\\'");

  return `
import json, re

def auto_fix_node(node_path):
    fixes = []
    target = op(node_path)
    if target is None:
        return {"fixed": [], "error": "Node not found: " + node_path}

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
    combined_pattern = re.compile(
        r'(?<!\\.)(?<!\\w)(' + '|'.join(math_funcs) + r')(?=\\s*\\()'
    )

    def should_skip(path):
        return any(pat in path for pat in SKIP_PATTERNS)

    def fix_node(node, depth=0):
        if node is None or depth > 30:
            return
        try:
            if should_skip(node.path):
                return
            for par in node.pars():
                if not par.expr:
                    continue
                original = par.expr
                new_expr = combined_pattern.sub(
                    lambda m: 'math.' + m.group(1), original
                )
                new_expr = new_expr.replace('math.math.', 'math.')
                if new_expr != original:
                    par.expr = new_expr
                    fixes.append({
                        "path": node.path, "param": par.name,
                        "old": original[:120], "new": new_expr[:120],
                    })
        except:
            pass
        try:
            for child in node.children:
                fix_node(child, depth + 1)
        except:
            pass

    fix_node(target)
    return {"fixed": fixes, "count": len(fixes)}

result = auto_fix_node('${safePath}')
print(json.dumps(result))
`;
}

/**
 * Build Python code that classifies healthcheck issues into categories.
 */
function buildClassifyCode(healthJson: string): string {
  const escapedJson = healthJson
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$");
  return `
import json, re

CATEGORY_PATTERNS = [
    ('expression_error', [
        r'AttributeError', r'NameError', r'SyntaxError', r'TypeError',
        r'not defined', r'has no attribute',
    ]),
    ('cook_loop', [r'Cook dependency loop', r'cook.*loop']),
    ('missing_file', [
        r'File not found', r'file not found', r'No such file', r'FileNotFoundError',
    ]),
    ('glsl_error', [
        r'Compile failed', r'compile.*error', r'GLSL.*error', r'shader.*error',
    ]),
]

SUGGESTED_ACTIONS = {
    'expression_error': [
        'Run td_validate with auto_fix=true to fix bare math functions',
        'Check that all Python imports (math, re, etc.) are available',
        'Verify parameter expression syntax in the TD operator',
    ],
    'cook_loop': [
        'Identify the circular dependency chain via operator expressions',
        'Try clearing the offending expression: op(path).par.X.expr = ""',
        'Consider bypassing the operator: op(path).bypass = True',
    ],
    'missing_file': [
        'Verify the file path exists on disk',
        'Set the DAT file parameter: op(path).par.file = "correct/path"',
        'Force-cook the DAT after fixing: op(path).cook(force=True)',
    ],
    'glsl_error': [
        'Check the GLSL source code in the glslTOP/glslPOP',
        'Verify uniform/attribute declarations match the TD environment',
        'Review GLSL compilation errors in the glsl1_info DAT',
    ],
    'needs_manual': [
        'Inspect the operator manually in the TD network editor',
        'Check TD documentation for this operator type',
        "Review the operator's error log via op(path).errors()",
    ],
}

def classify_issue(issue):
    path = issue.get('path', '')
    err = issue.get('error', '') or ''
    warn = issue.get('warning', '') or ''
    text = (err + ' ' + warn).lower()
    for category, patterns in CATEGORY_PATTERNS:
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                return {
                    'path': path, 'category': category,
                    'error': err[:200] if err else None,
                    'warning': warn[:200] if warn else None,
                    'suggested_actions': SUGGESTED_ACTIONS.get(category, []),
                }
    return {
        'path': path, 'category': 'needs_manual',
        'error': err[:200] if err else None,
        'warning': warn[:200] if warn else None,
        'suggested_actions': SUGGESTED_ACTIONS['needs_manual'],
    }

health_json = '${escapedJson}'
health = json.loads(health_json)
issues = health.get('operators', [])
classified = [classify_issue(i) for i in issues]
summary = {}
for c in classified:
    cat = c['category']
    if cat not in summary:
        summary[cat] = []
    summary[cat].append(c)
counts = {cat: len(items) for cat, items in summary.items()}
result = {'total': len(classified), 'counts': counts, 'issues': classified, 'summary': summary}
print(json.dumps(result))
`;
}

/**
 * Build Python code to check GLSL compilation status.
 */
function buildGlslCheckCode(targetPath: string): string {
  const safePath = targetPath.replace(/'/g, "\\'");
  return `
import json
results = []
try:
    target = op('${safePath}')
    if target:
        def check_glsl(node, depth=0):
            if node is None or depth > 30:
                return
            try:
                if hasattr(node, 'OPType') and node.OPType == 'glslPOP':
                    info = op(node.path + '/glsl1_info')
                    if info and info.text:
                        txt = info.text.strip()
                        if 'Error' in txt or 'error' in txt:
                            results.append({"path": node.path, "status": "error", "info": txt[:300]})
                        elif 'Compiled Successfully' in txt:
                            results.append({"path": node.path, "status": "ok"})
                        else:
                            results.append({"path": node.path, "status": "unknown", "info": txt[:200]})
            except:
                pass
            try:
                for child in node.children:
                    check_glsl(child, depth + 1)
            except:
                pass
        check_glsl(target)
except Exception as e:
    results.append({"error": str(e)})
print(json.dumps(results))
`;
}

// ─── Tier 4: Performance Budget Check ────────────────────────────────────────

/**
 * Build Python code to sample performance from critical operators
 * and compare against configurable budgets.
 */
function buildPerfBudgetCode(
  targetPath: string,
  budgets: {
    maxCookTimeMs?: number;
    maxPointCount?: number;
    maxResolution?: number;
    maxRecookHz?: number;
  },
): string {
  const safePath = targetPath.replace(/'/g, "\\'");
  const maxCook = budgets.maxCookTimeMs ?? 16.67; // 60fps budget
  const maxPts = budgets.maxPointCount ?? 1000000;
  const maxRes = budgets.maxResolution ?? 4096;
  const maxHz = budgets.maxRecookHz ?? 120;

  return `
import json

budgets = {
    'maxCookTimeMs': ${maxCook},
    'maxPointCount': ${maxPts},
    'maxResolution': ${maxRes},
    'maxRecookHz': ${maxHz},
}

violations = []
samples = []

target = op('${safePath}')
if target is None:
    print(json.dumps({"error": "Path not found: ${safePath}", "violations": [], "samples": []}))
else:
    def sample_node(node, depth=0):
        if node is None or depth > 30:
            return
        try:
            cook_time = 0
            try:
                if hasattr(node, 'cookTime'):
                    cook_time = node.cookTime
                elif hasattr(node, 'perf'):
                    cook_time = getattr(node, 'perf', 0)
            except:
                pass

            point_count = 0
            try:
                if hasattr(node, 'numPoints'):
                    np = node.numPoints
                    point_count = np() if callable(np) else np
            except:
                pass

            resolution = 0
            try:
                if hasattr(node, 'width') and hasattr(node, 'height'):
                    w = node.width
                    h = node.height
                    resolution = (w() if callable(w) else w) * (h() if callable(h) else h)
            except:
                pass

            sample = {
                'path': node.path,
                'opType': node.OPType if hasattr(node, 'OPType') else '?',
                'cookTimeMs': round(cook_time * 1000, 2) if cook_time else 0,
                'pointCount': point_count,
                'resolution': resolution,
            }
            samples.append(sample)

            # Check budgets
            if cook_time and cook_time * 1000 > budgets['maxCookTimeMs']:
                violations.append({
                    'path': node.path, 'metric': 'cookTimeMs',
                    'value': round(cook_time * 1000, 2),
                    'budget': budgets['maxCookTimeMs'],
                    'severity': 'warning' if cook_time * 1000 < budgets['maxCookTimeMs'] * 2 else 'critical',
                })
            if point_count > budgets['maxPointCount']:
                violations.append({
                    'path': node.path, 'metric': 'pointCount',
                    'value': point_count, 'budget': budgets['maxPointCount'],
                    'severity': 'warning' if point_count < budgets['maxPointCount'] * 2 else 'critical',
                })
            if resolution > budgets['maxResolution']:
                violations.append({
                    'path': node.path, 'metric': 'resolution',
                    'value': resolution, 'budget': budgets['maxResolution'],
                    'severity': 'warning',
                })
        except:
            pass
        try:
            for child in node.children:
                sample_node(child, depth + 1)
        except:
            pass

    sample_node(target)

    result = {
        'budgets': budgets,
        'violations': violations,
        'violationCount': len(violations),
        'sampleCount': len(samples),
        'samples': sorted(samples, key=lambda s: s.get('cookTimeMs', 0), reverse=True)[:20],
    }
    print(json.dumps(result))
`;
}

// ─── Tier 5: Structured Error Report ─────────────────────────────────────────

/**
 * Build Python code to generate a structured error report following
 * the mcp_td_v2 format: symptom, operator, cause, fix, verification.
 */
function buildStructuredReportCode(healthJson: string): string {
  const escapedJson = healthJson
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\$/g, "\\$");

  return `
import json, re

health = json.loads('${escapedJson}')
issues = health.get('operators', [])
reports = []

CAUSE_PATTERNS = {
    'expression_error': {
        'symptom': 'Operator shows red error flag with Python traceback',
        'cause': 'Bare math function used without math. prefix in parameter expression',
        'fix': 'Run td_validate auto_fix or manually prefix with math. (e.g. sin→math.sin)',
        'verify': 'Re-run healthcheck — error flag should clear',
    },
    'cook_loop': {
        'symptom': 'TD shows "Cook dependency loop" warning, frame rate drops',
        'cause': 'Circular cook dependency between operators',
        'fix': 'Break the cycle: clear expression, bypass operator, or restructure network',
        'verify': 'Check cook time drops to near-zero for affected operators',
    },
    'missing_file': {
        'symptom': 'DAT shows "File not found" warning',
        'cause': 'File parameter points to non-existent path',
        'fix': 'Set correct file path or create the missing file',
        'verify': 'Force-cook the DAT: op(path).cook(force=True)',
    },
    'glsl_error': {
        'symptom': 'GLSL POP/TOP shows compilation error in glsl1_info',
        'cause': 'GLSL shader code has syntax error or undeclared identifier',
        'fix': 'Fix shader source — check uniforms, attributes, and GLSL version',
        'verify': 'Check glsl1_info DAT shows "Compiled Successfully"',
    },
    'needs_manual': {
        'symptom': 'Operator has unexpected behavior or warning',
        'cause': 'Requires manual inspection to determine root cause',
        'fix': 'Inspect in TD network editor, check operator documentation',
        'verify': 'Verify operator behavior matches expected output',
    },
}

CATEGORY_PATTERNS = [
    ('expression_error', [r'AttributeError', r'NameError', r'SyntaxError', r'TypeError', r'not defined']),
    ('cook_loop', [r'Cook dependency loop', r'cook.*loop']),
    ('missing_file', [r'File not found', r'No such file']),
    ('glsl_error', [r'Compile failed', r'GLSL.*error', r'shader.*error']),
]

for issue in issues:
    path = issue.get('path', '')
    name = issue.get('name', '')
    op_type = issue.get('opType', '')
    err = issue.get('error', '') or ''
    warn = issue.get('warning', '') or ''
    text = (err + ' ' + warn).lower()

    category = 'needs_manual'
    for cat, patterns in CATEGORY_PATTERNS:
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                category = cat
                break
        if category != 'needs_manual':
            break

    template = CAUSE_PATTERNS[category]
    reports.append({
        'path': path,
        'name': name,
        'opType': op_type,
        'category': category,
        'symptom': template['symptom'],
        'error_detail': err[:200] if err else warn[:200],
        'cause': template['cause'],
        'fix': template['fix'],
        'verification': template['verify'],
    })

result = {
    'total': len(reports),
    'reports': reports,
    'by_category': {cat: len([r for r in reports if r['category'] == cat]) for cat in set(r['category'] for r in reports)} if reports else {},
}
print(json.dumps(result))
`;
}

// ─── POP-Specific Performance Budget (Improvement #6) ───────────────────────

/**
 * Build Python code to check POP-specific performance metrics:
 * particle count, feedback loop integrity, sub-step count, cache size.
 */
function buildPopPerfCode(targetPath: string): string {
  const safePath = targetPath.replace(/'/g, "\\'");
  return `
import json

violations = []
samples = []
target = op('${safePath}')

if target is None:
    print(json.dumps({"error": "Path not found", "violations": [], "samples": []}))
else:
    def check_pop_perf(node, depth=0):
        if node is None or depth > 30:
            return
        try:
            if hasattr(node, 'OPType') and node.OPType and 'POP' in node.OPType:
                op_type = node.OPType
                sample = {
                    'path': node.path,
                    'opType': op_type,
                    'cookTimeMs': 0,
                    'pointCount': 0,
                    'parameters': {},
                }

                # Cook time
                try:
                    if hasattr(node, 'cookTime'):
                        sample['cookTimeMs'] = round(node.cookTime * 1000, 2)
                except:
                    pass

                # Point count
                try:
                    if hasattr(node, 'numPoints'):
                        np = node.numPoints
                        sample['pointCount'] = np() if callable(np) else np
                except:
                    pass

                # Key parameters
                try:
                    for par in node.pars():
                        pname = par.name
                        if pname in ('birthrate', 'lifeexpect', 'maxparticles',
                                     'substeps', 'length', 'cache_length',
                                     'neighborcount'):
                            sample['parameters'][pname] = par.val
                except:
                    pass

                samples.append(sample)

                # Budget checks
                cook_ms = sample['cookTimeMs']
                pts = sample['pointCount']

                # particlePOP-specific
                if op_type == 'particlePOP':
                    if pts > 500000:
                        violations.append({
                            'path': node.path, 'metric': 'pointCount',
                            'value': pts, 'budget': 500000,
                            'severity': 'critical' if pts > 1000000 else 'warning',
                            'suggestion': 'Reduce birthrate, increase lifeexpect, or use deletePOP to cull',
                        })
                    if cook_ms > 8:
                        violations.append({
                            'path': node.path, 'metric': 'cookTimeMs',
                            'value': cook_ms, 'budget': 8,
                            'severity': 'critical' if cook_ms > 16 else 'warning',
                            'suggestion': 'Reduce particle count or simplify force chain',
                        })
                    bp = sample['parameters'].get('birthrate', 0)
                    if bp and bp > 10000:
                        violations.append({
                            'path': node.path, 'metric': 'birthrate',
                            'value': bp, 'budget': 10000,
                            'severity': 'warning',
                            'suggestion': 'High birthrate (>10K/sec) — reduce or increase particle life',
                        })

                # neighborPOP-specific
                if op_type == 'neighborPOP':
                    nc = sample['parameters'].get('neighborcount', 0)
                    if nc and nc > 50:
                        violations.append({
                            'path': node.path, 'metric': 'neighborcount',
                            'value': nc, 'budget': 50,
                            'severity': 'warning',
                            'suggestion': 'High neighbor count (>50) is O(n²) — reduce or use fieldPOP',
                        })

                # trailPOP-specific
                if op_type == 'trailPOP':
                    tl = sample['parameters'].get('length', 0)
                    if tl and tl > 100:
                        violations.append({
                            'path': node.path, 'metric': 'trailLength',
                            'value': tl, 'budget': 100,
                            'severity': 'warning',
                            'suggestion': 'Long trails (>100 segments) consume memory — reduce length',
                        })

                # cachePOP-specific
                if op_type == 'cachePOP':
                    cl = sample['parameters'].get('cache_length', 0)
                    if cl and cl > 256:
                        violations.append({
                            'path': node.path, 'metric': 'cacheLength',
                            'value': cl, 'budget': 256,
                            'severity': 'warning',
                            'suggestion': 'Large cache (>256 frames) consumes VRAM — reduce length',
                        })

                # glslPOP-specific
                if op_type in ('glslPOP', 'glslCreatePOP', 'glslAdvancedPOP'):
                    if cook_ms > 5:
                        violations.append({
                            'path': node.path, 'metric': 'cookTimeMs',
                            'value': cook_ms, 'budget': 5,
                            'severity': 'warning',
                            'suggestion': 'GLSL POP cook time >5ms — simplify shader or reduce resolution',
                        })

                # Generic POP cook time
                if op_type not in ('particlePOP',) and cook_ms > 16.67:
                    violations.append({
                        'path': node.path, 'metric': 'cookTimeMs',
                        'value': cook_ms, 'budget': 16.67,
                        'severity': 'warning',
                        'suggestion': 'POP cook time exceeds 60fps budget — optimize network',
                    })

        except:
            pass
        try:
            for child in node.children:
                check_pop_perf(child, depth + 1)
        except:
            pass

    check_pop_perf(target)

    result = {
        'violations': violations,
        'violationCount': len(violations),
        'sampleCount': len(samples),
        'samples': sorted(samples, key=lambda s: s.get('cookTimeMs', 0), reverse=True)[:20],
    }
    print(json.dumps(result))
`;
}

// ─── Tool Registration ───────────────────────────────────────────────────────

export function registerValidateTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_validate
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_validate",
    {
      title: "Validate & Auto-Fix",
      description:
        "Validate a TouchDesigner operator/network: force-cook, detect errors, " +
        "classify issues by category (expression_error, cook_loop, missing_file, glsl_error, needs_manual), " +
        "auto-fix common expression issues (bare sin→math.sin, log→math.log, etc.), " +
        "check GLSL compilation, and re-validate. Returns errors found, fixes applied, " +
        "issue classifications with suggested actions, and final status.",
      inputSchema: {
        path: z
          .string()
          .describe("Operator path to validate (e.g. '/project1/Pathtracer')"),
        recurse: z
          .boolean()
          .optional()
          .default(true)
          .describe("Validate descendants recursively (default: true)"),
        auto_fix: z
          .boolean()
          .optional()
          .default(true)
          .describe("Auto-fix common expression errors like bare sin/cos/log (default: true)"),
      },
    },
    async ({ path: opPath, recurse, auto_fix }) => {
      try {
        const result: any = {
          path: opPath,
          recurse: recurse ?? true,
          auto_fix: auto_fix ?? true,
          steps: [],
        };

        // ── Step 1: Healthcheck (detect errors) ──
        const health = await client.healthcheck(opPath, recurse ?? true);
        result.steps.push({ step: "healthcheck", result: health });

        const hasErrors =
          health && !(health as any).ok && (health as any).issueCount > 0;

        // ── Step 2: Auto-fix if enabled and errors found ──
        if ((auto_fix ?? true) && hasErrors) {
          const fixCode = buildAutoFixCode(opPath);
          const fixResult = await client.execute(fixCode, "/");
          result.steps.push({ step: "auto_fix", result: fixResult });

          try {
            result.errors_fixed = JSON.parse(
              (fixResult as any)?.output || "{}",
            );
          } catch {
            result.errors_fixed = { raw: (fixResult as any)?.output };
          }

          // ── Step 3: Re-validate after fix ──
          const recheck = await client.healthcheck(opPath, recurse ?? true);
          result.steps.push({ step: "recheck", result: recheck });
          result.final_status = (recheck as any)?.ok ? "healthy" : "has_issues";
        } else {
          result.final_status = hasErrors ? "has_issues" : "healthy";
        }

        // ── Step 4: GLSL compilation check ──
        const glslCheck = await client.execute(
          buildGlslCheckCode(opPath),
          "/",
        );

        let glslResults: any[] = [];
        try {
          glslResults = JSON.parse((glslCheck as any)?.output || "[]");
        } catch {
          glslResults = [];
        }
        result.steps.push({ step: "glsl_check", result: glslResults });

        const glslErrors = glslResults.filter((r: any) => r.status === "error");
        if (glslErrors.length > 0) {
          result.final_status = "has_issues";
          result.glsl_errors = glslErrors;
        }

        // ── Step 5: Classify issues ──
        let classifyResults: any = {};
        try {
          const healthJson = JSON.stringify(health);
          const classifyCode = buildClassifyCode(healthJson);
          const classifyResult = await client.execute(classifyCode, "/");
          try {
            classifyResults = JSON.parse(
              (classifyResult as any)?.output || "{}",
            );
          } catch {
            classifyResults = {};
          }
          result.steps.push({ step: "classify_issues", result: classifyResults });
          result.classification = classifyResults;
        } catch {
          result.steps.push({
            step: "classify_issues",
            result: { error: "Classification failed" },
          });
          result.classification = {};
        }

        // ── Step 6: Structured error reports (Tier 5) — only when issues exist ──
        let structuredReports: any = {};
        if (hasErrors) {
          try {
            const healthJson = JSON.stringify(health);
            const reportCode = buildStructuredReportCode(healthJson);
            const reportResult = await client.execute(reportCode, "/");
          try {
            structuredReports = JSON.parse(
              (reportResult as any)?.output || "{}",
            );
          } catch {
            structuredReports = {};
          }
          result.steps.push({
            step: "structured_reports",
            result: structuredReports,
          });
          result.structuredReports = structuredReports;
          } catch {
            result.steps.push({
              step: "structured_reports",
              result: { error: "Report generation failed" },
            });
          }
        }

        result.summary = {
          total_issues_before: (health as any)?.issueCount ?? 0,
          fixes_applied: result.errors_fixed?.count ?? 0,
          glsl_shaders_checked: glslResults.length,
          glsl_errors: glslErrors.length,
          classified: classifyResults.counts ?? {},
          structured_report_count: structuredReports.total ?? 0,
          final_status: result.final_status,
        };

        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // td_perf_budget
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_perf_budget",
    {
      title: "Performance Budget Check",
      description:
        "Check performance of operators against configurable budgets. " +
        "Monitors cook time, point count, resolution, and recook frequency. " +
        "Returns violations sorted by severity with actionable fix suggestions. " +
        "Tier 4 validation from the mcp_td_v2 testing protocols.",
      inputSchema: {
        path: z
          .string()
          .describe("Root path to profile (e.g. '/project1/mySystem')"),
        max_cook_time_ms: z
          .number()
          .optional()
          .default(16.67)
          .describe("Max cook time per operator in ms (default: 16.67 = 60fps budget)"),
        max_point_count: z
          .number()
          .optional()
          .default(1000000)
          .describe("Max point count per POP operator (default: 1,000,000)"),
        max_resolution: z
          .number()
          .optional()
          .default(4096)
          .describe("Max total pixel count (width*height) for TOP operators (default: 4096)"),
        max_recook_hz: z
          .number()
          .optional()
          .default(120)
          .describe("Max expected recook frequency in Hz (default: 120)"),
      },
    },
    async ({
      path: opPath,
      max_cook_time_ms,
      max_point_count,
      max_resolution,
      max_recook_hz,
    }) => {
      try {
        const code = buildPerfBudgetCode(opPath, {
          maxCookTimeMs: max_cook_time_ms,
          maxPointCount: max_point_count,
          maxResolution: max_resolution,
          maxRecookHz: max_recook_hz,
        });

        const execResult = await client.execute(code, "/");
        let perfResult: any;
        try {
          perfResult = JSON.parse((execResult as any)?.output || "{}");
        } catch {
          perfResult = { error: "Failed to parse performance data" };
        }

        // Generate fix suggestions for violations
        const suggestions: string[] = [];
        if (perfResult.violations) {
          for (const v of perfResult.violations) {
            if (v.metric === "cookTimeMs") {
              suggestions.push(
                `⚠️ ${v.path}: cook time ${v.value}ms exceeds budget ${v.budget}ms — ` +
                  `reduce complexity, lower iteration count, or cache intermediate results`,
              );
            } else if (v.metric === "pointCount") {
              suggestions.push(
                `⚠️ ${v.path}: ${v.value.toLocaleString()} points exceeds budget ${v.budget.toLocaleString()} — ` +
                  `reduce particle count, apply thin POP, or use LOD`,
              );
            } else if (v.metric === "resolution") {
              suggestions.push(
                `⚠️ ${v.path}: resolution ${v.value}px exceeds budget ${v.budget}px — ` +
                  `reduce TOP resolution or use downscaling`,
              );
            }
          }
        }

        return ok({
          ...perfResult,
          suggestions,
          overallStatus:
            (perfResult.violationCount ?? 0) === 0 ? "within_budget" : "budget_exceeded",
        });
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
