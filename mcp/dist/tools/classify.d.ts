/**
 * Shared issue classifier for TD healthcheck results.
 *
 * Used by both td_validate (full pipeline) and td_safe_plan (safe mode).
 * Classifies health issues into categories with suggested actions.
 */
export interface ClassifiedIssue {
    path: string;
    category: string;
    error: string | null;
    warning: string | null;
    suggested_actions: string[];
}
export interface ClassificationResult {
    total: number;
    counts: Record<string, number>;
    issues: ClassifiedIssue[];
    summary: Record<string, ClassifiedIssue[]>;
}
/**
 * Classify a single health issue by matching error/warning text against patterns.
 */
export declare function classifyIssue(issue: {
    path: string;
    errors?: string;
    warnings?: string;
}): ClassifiedIssue;
/**
 * Classify all issues from a healthcheck result.
 */
export declare function classifyAllIssues(operators: Array<{
    path: string;
    errors?: string;
    warnings?: string;
}>): ClassificationResult;
/**
 * Build Python code that classifies issues (for embedding in execute calls).
 */
export declare function buildClassifyPythonCode(healthJson: string): string;
