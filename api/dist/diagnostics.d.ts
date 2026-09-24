/**
 * Client-side diagnostics for the TD bridge client.
 *
 * Why this exists (evidence, 2026-09-24): the single largest support cost in
 * the closest comparable project (TWOZERO's Discord, 486 messages analysed)
 * was failures that were SILENT — "no textport output, no errors, it just
 * silently fails" — followed by the maintainer's question "do you have logs
 * generated anywhere?". The one report that got fixed fast carried a client
 * log line-by-line (success / success / connection dropped / TD gone).
 *
 * Responsibilities:
 *   1. Ring buffer of the last N calls (tool, path, ms, ok, kind) + last OK ts.
 *   2. Optional JSONL file so a failure can be reported with evidence.
 *   3. Classification of connection errors so the caller can decide whether a
 *      retry is safe (see `isRetryable`).
 *
 * Deliberately dependency-free and sync-writing: it must never be the reason a
 * call fails, so every write is wrapped and swallowed.
 */
export type TDErrorKind = "bridge_unreachable" | "connect_reset" | "timeout" | "http_error" | "ws_error" | "unknown";
export interface CallRecord {
    ts: string;
    /** Path only (query string stripped) so records group cleanly. */
    target: string;
    method: string;
    ok: boolean;
    ms: number;
    attempt: number;
    transport: "http" | "websocket";
    kind?: TDErrorKind;
    error?: string;
}
export interface CallStats {
    total: number;
    ok: number;
    failed: number;
    byKind: Record<string, number>;
    last_ok_call: string | null;
}
/**
 * Resolve the JSONL log path. Order: explicit override > TDMCP_CLIENT_LOG env >
 * `<tmpdir>/tdmcp-client.log`. `TDMCP_CLIENT_LOG=off|0|false` disables the file
 * (the in-memory ring keeps working).
 */
export declare function clientLogPath(): string | null;
/** Force a specific log file (or `null` to disable). Also a test seam. */
export declare function setClientLogPath(p: string | null): void;
/**
 * Clear the ring, the last-OK stamp and the stats. An explicitly configured log
 * path (setClientLogPath) is preserved — only the env-derived resolution is
 * re-evaluated on the next call.
 */
export declare function resetDiagnostics(): void;
/** Path without query string — keeps records comparable across calls. */
export declare function safeTarget(url: string): string;
/**
 * Record one call attempt. Never throws.
 */
export declare function recordCall(rec: CallRecord): void;
/** Last `n` call records, oldest first. */
export declare function getRecentCalls(n?: number): CallRecord[];
/** ISO timestamp of the last successful call, or null if none happened yet. */
export declare function getLastOkAt(): string | null;
export declare function getCallStats(): CallStats;
/**
 * Classify a transport error. The distinction that matters to callers is
 * whether the request could have reached TD at all:
 *
 *   bridge_unreachable — DNS/refused/route error: the request NEVER left the
 *                        client, so retrying is safe even for writes.
 *   connect_reset      — the socket dropped after being established: a write
 *                        MAY have executed. Retry only reads.
 *   timeout            — same uncertainty as connect_reset.
 *   http_error         — TD answered with a non-2xx status: a real answer, not
 *                        a transport problem. Never retry.
 */
export declare function classifyConnectionError(e: unknown): TDErrorKind;
export declare function errorMessage(e: unknown, depth?: number): string;
/** Is it worth trying again? `requestReallyHappened` encodes the uncertainty
 *  rule above: only reads may be retried when the socket was already open. */
export declare function isRetryable(kind: TDErrorKind, method: string): boolean;
/** Human-readable, actionable hint per kind. */
export declare const KIND_HINTS: Record<TDErrorKind, string>;
