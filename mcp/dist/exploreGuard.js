import { z } from "zod";
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
export const EXPLORE_DEFAULT_LIMIT = 100;
export const EXPLORE_MAX_LIMIT = 500;
export const EXPLORE_DEFAULT_TIMEOUT_MS = (() => {
    // Overridable for slow machines / very large legit networks, but always
    // bounded: an unbounded exploration call is what freezes the host app.
    const raw = Number(process.env.TDMCP_EXPLORE_TIMEOUT_MS);
    return Number.isFinite(raw) && raw >= 1000 ? raw : 20_000;
})();
/** Normalize a scope: undefined/empty/whitespace → "/". */
export function normalizeScope(p) {
    const s = (p ?? "").trim();
    return s === "" ? "/" : s;
}
/** Clamp a result limit into the exploration budget. */
export function clampLimit(limit, max = EXPLORE_MAX_LIMIT, def = EXPLORE_DEFAULT_LIMIT) {
    if (limit === undefined || limit === null || Number.isNaN(limit))
        return def;
    return Math.max(1, Math.min(max, Math.trunc(limit)));
}
/**
 * Thrown when an exploration call exceeds its budget. Carries the same
 * `envelope` shape as transport errors so `err()` surfaces the actionable hint
 * without any special-casing.
 */
export class ExploreTimeoutError extends Error {
    kind = "timeout";
    tool;
    scope;
    timeoutMs;
    envelope;
    constructor(tool, scope, timeoutMs) {
        const hint = `'${tool}' no respondió en ${timeoutMs} ms. En redes grandes esto significa que TD ` +
            `está ocupado barriendo: TD PUEDE SEGUIR TRABAJANDO aunque hayas recibido este error. ` +
            `No lo repitas igual: acotá el scope (path más profundo y concreto, menos recursión, ` +
            `limit más bajo) y verificá con td_healthchain antes de insistir.`;
        super(`${tool} timed out after ${timeoutMs}ms at scope '${scope}'. ${hint}`);
        this.name = "ExploreTimeoutError";
        this.tool = tool;
        this.scope = scope;
        this.timeoutMs = timeoutMs;
        this.envelope = {
            kind: "timeout",
            bridge: "-",
            transport: "http",
            method: "GET",
            target: tool,
            attempts: 1,
            last_ok_call: null,
            hint,
            benign: false,
        };
    }
}
/**
 * Run an exploration call with a hard caller-side budget.
 *
 * Note on honesty: this bounds the WAIT, it does not cancel TD (the bridge
 * cannot interrupt a running sweep either). That is exactly why the error says
 * TD may still be busy and why the caller must not retry unchanged.
 */
export async function runBounded(tool, scope, fn, timeoutMs = EXPLORE_DEFAULT_TIMEOUT_MS) {
    let timer;
    try {
        return await Promise.race([
            fn(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new ExploreTimeoutError(tool, scope, timeoutMs)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
/** Shared schema fragment: the scope every exploration tool defaults to "/". */
export const scopeSchema = z
    .string()
    .optional()
    .describe("Scope to explore. Defaults to '/'. Prefer a narrow path: sweeping a large " +
    "network can make TD busy for seconds.");
/** Shared schema fragment for result budgets. */
export const limitSchema = z
    .number()
    .int()
    .min(1)
    .max(EXPLORE_MAX_LIMIT)
    .optional()
    .describe(`Max results (default ${EXPLORE_DEFAULT_LIMIT}, hard cap ${EXPLORE_MAX_LIMIT})`);
