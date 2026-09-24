import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { getCallStats, getRecentCalls } from "td-api";
/**
 * Chain health + bug-report bundle.
 *
 * Motivation (2026-09-24, evidence from the closest comparable project):
 *   1. "It connects only once when the chat starts, there is no retry, and the
 *      ✓ CONNECTED indicator checks config, not a live connection." — a status
 *      indicator that lies is worse than none. This tool answers ONE question
 *      with a LIVE round-trip: can the agent operate this TD right now?
 *   2. Every bug report started with the maintainer asking "which versions?" and
 *      "do you have logs anywhere?". Both are collected automatically here.
 */
export interface HealthCheck {
    name: string;
    ok: boolean;
    ms: number;
    detail?: unknown;
    error?: string;
}
export interface HealthChainResult {
    verdict: "OK" | "DEGRADED" | "DOWN";
    summary: string;
    checks: HealthCheck[];
    runtime: Record<string, unknown> | null;
    evidence: {
        last_ok_call: string | null;
        recent_calls: ReturnType<typeof getRecentCalls>;
        call_stats: ReturnType<typeof getCallStats>;
        client_log: string | null;
    };
    hint: string;
    /**
     * Avisos del PROYECTO (no de la cadena): errores/warnings de la red. Medido en
     * vivo el 24/09/26 sobre el proyecto real: 31 issues en el scope daban
     * DEGRADED con la cadena 4/4 OK — un indicador que grita siempre es tan inútil
     * como uno que miente. Los avisos informan; el veredicto mide operabilidad.
     */
    warnings: string[];
    /** Clasificación del último error de transporte (solo cuando verdict=DOWN). */
    transport: {
        kind: string;
        bridge: string;
        attempts: number;
        hint: string;
    } | null;
}
interface CheckOptions {
    path?: string;
    recurse?: boolean;
    include_calls?: number;
}
/**
 * Run the four-step chain and turn it into a single verdict.
 * Duck-typed client so this is unit-testable without a running MCP server.
 */
export declare function runHealthChain(client: Pick<TDClient, "getInfo" | "getOperators" | "healthcheck" | "getPerf">, opts?: CheckOptions): Promise<HealthChainResult>;
/**
 * Render the evidence bundle as markdown. Pure function: takes the health
 * result it already computed, so the report can never disagree with the checks.
 */
export declare function buildBugReport(health: HealthChainResult, args: {
    symptoms: string;
    path?: string;
    expected?: string;
}): string;
export declare function registerHealthTools(server: McpServer, client: TDClient): void;
export {};
