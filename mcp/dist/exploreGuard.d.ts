import { z } from "zod";
import type { TDErrorKind } from "td-api";
/**
 * Guardrails for network-EXPLORATION tools.
 *
 * Why (2026-09-24, evidence from the closest comparable project): their search
 * tool "will hang TD on a sufficiently large network" — confirmed by its own
 * maintainer. The user-side workaround was a hand-written warning in their
 * agent's context file. A tool that can freeze the host application has to
 * defend itself:
 *
 *   1. SCOPE is always explicit (a narrow path beats a recursive sweep).
 *   2. LIMIT is clamped to a budget the bridge can answer quickly.
 *   3. TIMEOUT bounds the caller's wait and, crucially, the failure is
 *      reported as "TD may still be busy" — never retried blindly, because a
 *      retry piles another sweep onto an already-stuck TD.
 */
export declare const EXPLORE_DEFAULT_LIMIT = 100;
export declare const EXPLORE_MAX_LIMIT = 500;
export declare const EXPLORE_DEFAULT_TIMEOUT_MS: number;
/** Normalize a scope: undefined/empty/whitespace → "/". */
export declare function normalizeScope(p?: string | null): string;
/** Clamp a result limit into the exploration budget. */
export declare function clampLimit(limit: number | undefined, max?: number, def?: number): number;
/**
 * Thrown when an exploration call exceeds its budget. Carries the same
 * `envelope` shape as transport errors so `err()` surfaces the actionable hint
 * without any special-casing.
 */
export declare class ExploreTimeoutError extends Error {
    readonly kind: TDErrorKind;
    readonly tool: string;
    readonly scope: string;
    readonly timeoutMs: number;
    readonly envelope: {
        kind: TDErrorKind;
        bridge: string;
        transport: string;
        method: string;
        target: string;
        attempts: number;
        last_ok_call: null;
        hint: string;
        benign: boolean;
    };
    constructor(tool: string, scope: string, timeoutMs: number);
}
/**
 * Run an exploration call with a hard caller-side budget.
 *
 * Note on honesty: this bounds the WAIT, it does not cancel TD (the bridge
 * cannot interrupt a running sweep either). That is exactly why the error says
 * TD may still be busy and why the caller must not retry unchanged.
 */
export declare function runBounded<T>(tool: string, scope: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T>;
/** Shared schema fragment: the scope every exploration tool defaults to "/". */
export declare const scopeSchema: z.ZodOptional<z.ZodString>;
/** Shared schema fragment for result budgets. */
export declare const limitSchema: z.ZodOptional<z.ZodNumber>;
