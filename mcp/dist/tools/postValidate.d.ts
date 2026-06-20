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
export declare function postModifyValidate(client: TDClient, path: string, parentPath?: string, autoFix?: boolean): Promise<PostValidationResult>;
/**
 * Get the parent path of a TD operator path.
 * e.g. "/project1/noise1" → "/project1"
 *      "/project1/geo1/null1" → "/project1/geo1"
 */
export declare function getParentPath(path: string): string;
