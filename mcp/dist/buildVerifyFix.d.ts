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
import type { TDClient } from "td-api";
export interface VerifyResult {
    ok: boolean;
    path: string;
    issueCount: number;
    issues: string[];
    fixesApplied: number;
    fixDetails: string[];
    summary: string;
}
export interface RewireAttempt {
    fromPath: string;
    toPath: string;
    inputIndex: number;
    success: boolean;
    error?: string;
}
export interface BuildVerifyOptions {
    client: TDClient;
    /** Path to healthcheck after creation */
    path: string;
    /** Whether to auto-fix expression errors */
    autoFix?: boolean;
    /** Whether to verify connections (slower but safer) */
    verifyConnections?: boolean;
}
/**
 * Run the build-verify-fix loop on a freshly created/modified network path.
 *
 * 1. Healthcheck → detect issues
 * 2. Auto-fix expressions → re-check
 * 3. Return detailed report
 */
export declare function buildVerifyFix(options: BuildVerifyOptions): Promise<VerifyResult>;
/**
 * Verify and fix a batch of connections, attempting re-wiring for failed ones.
 */
export declare function verifyAndFixConnections(client: TDClient, connections: Array<{
    sourcePath: string;
    targetPath: string;
    inputIndex: number;
}>): Promise<{
    succeeded: number;
    failed: RewireAttempt[];
    fixed: RewireAttempt[];
}>;
/**
 * Convenience: run build-verify-fix after creating a network graph.
 * This is called by the graph planner's applyNetworkGraph.
 */
export declare function postGraphValidation(client: TDClient, path: string): Promise<VerifyResult>;
