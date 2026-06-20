/**
 * Shared issue classifier for TD healthcheck results.
 *
 * Used by both td_validate (full pipeline) and td_safe_plan (safe mode).
 * Classifies health issues into categories with suggested actions.
 */
const CATEGORY_PATTERNS = [
    ["expression_error", [
            "AttributeError",
            "NameError",
            "SyntaxError",
            "TypeError",
            "not defined",
            "has no attribute",
        ]],
    ["cook_loop", ["Cook dependency loop", "cook.*loop"]],
    ["missing_file", [
            "File not found",
            "file not found",
            "No such file",
            "FileNotFoundError",
        ]],
    ["glsl_error", [
            "Compile failed",
            "compile.*error",
            "GLSL.*error",
            "shader.*error",
        ]],
];
const SUGGESTED_ACTIONS = {
    expression_error: [
        "Run td_validate with auto_fix=true to fix bare math functions",
        "Check that all Python imports (math, re, etc.) are available",
        "Verify parameter expression syntax in the TD operator",
    ],
    cook_loop: [
        "Identify the circular dependency chain via operator expressions",
        'Try clearing the offending expression: op(path).par.X.expr = ""',
        "Consider bypassing the operator: op(path).bypass = True",
        "This may be a pre-existing TD infrastructure issue (e.g. ArcBall camera)",
    ],
    missing_file: [
        "Verify the file path exists on disk",
        'Set the DAT file parameter: op(path).par.file = "correct/path"',
        "Force-cook the DAT after fixing: op(path).cook(force=True)",
        "Create the missing file/directory if needed",
    ],
    glsl_error: [
        "Check the GLSL source code in the glslTOP/glslPOP",
        "Verify uniform/attribute declarations match the TD environment",
        "Review GLSL compilation errors in the glsl1_info DAT",
    ],
    needs_manual: [
        "Inspect the operator manually in the TD network editor",
        "Check TD documentation for this operator type",
        "Review the operator's error log via op(path).errors()",
    ],
};
/**
 * Classify a single health issue by matching error/warning text against patterns.
 */
export function classifyIssue(issue) {
    const text = ((issue.errors || "") + " " + (issue.warnings || "")).toLowerCase();
    let category = "needs_manual";
    for (const [cat, patterns] of CATEGORY_PATTERNS) {
        for (const pat of patterns) {
            if (new RegExp(pat, "i").test(text)) {
                category = cat;
                break;
            }
        }
        if (category !== "needs_manual")
            break;
    }
    return {
        path: issue.path,
        category,
        error: issue.errors || null,
        warning: issue.warnings || null,
        suggested_actions: SUGGESTED_ACTIONS[category] || SUGGESTED_ACTIONS.needs_manual,
    };
}
/**
 * Classify all issues from a healthcheck result.
 */
export function classifyAllIssues(operators) {
    const classified = operators.map(classifyIssue);
    const counts = {};
    const summary = {};
    for (const c of classified) {
        counts[c.category] = (counts[c.category] || 0) + 1;
        if (!summary[c.category])
            summary[c.category] = [];
        summary[c.category].push(c);
    }
    return { total: classified.length, counts, issues: classified, summary };
}
/**
 * Build Python code that classifies issues (for embedding in execute calls).
 */
export function buildClassifyPythonCode(healthJson) {
    const escapedJson = healthJson
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\$/g, "\\$");
    return `
import json, re

CATEGORY_PATTERNS = [
    ('expression_error', [r'AttributeError', r'NameError', r'SyntaxError', r'TypeError', r'not defined', r'has no attribute']),
    ('cook_loop', [r'Cook dependency loop', r'cook.*loop']),
    ('missing_file', [r'File not found', r'file not found', r'No such file', r'FileNotFoundError']),
    ('glsl_error', [r'Compile failed', r'compile.*error', r'GLSL.*error', r'shader.*error']),
]

health_json = '${escapedJson}'
health = json.loads(health_json)
issues = health.get('operators', [])

classified = []
for issue in issues:
    path = issue.get('path', '')
    err_text = (issue.get('errors', '') or '').lower()
    warn_text = (issue.get('warnings', '') or '').lower()
    text = err_text + ' ' + warn_text
    category = 'needs_manual'
    for cat, patterns in CATEGORY_PATTERNS:
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                category = cat
                break
        if category != 'needs_manual':
            break
    classified.append({'path': path, 'category': category})

counts = {}
for c in classified:
    cat = c['category']
    counts[cat] = counts.get(cat, 0) + 1

print(json.dumps({'total': len(classified), 'counts': counts, 'issues': classified}))
`;
}
