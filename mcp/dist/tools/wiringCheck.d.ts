import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * td_verify_wiring — post-build wiring check as an MCP tool (AGENTS.md rule 16).
 *
 * Verifies a freshly built network's wiring via GET /connections (real edges
 * from TouchDesigner connectors, backlog item 38) instead of trusting build
 * output. Expected edges are compared as a SET of (from, to, input), so
 * missing wires, missing outputs and wrong input indices are all caught and
 * reported by name.
 */
export interface ExpectedEdge {
    from: string;
    to: string;
    input: number;
}
/** Parse "srcA->nz:0,nz->mg:0,srcB->mg:1" into a set of expected edges. */
export declare function parseEdgeSpec(spec: string): ExpectedEdge[];
/** Format an edge as "from->to:input" for compact reporting. */
export declare function formatEdge(e: ExpectedEdge): string;
export interface WiringCheckResult {
    path: string;
    ok: boolean;
    /** Total real edges found under the container. */
    totalEdges: number;
    missing: string[];
    unexpected: string[];
    /** The real wiring, as "from->to:input" strings (from + input sorted). */
    actual: string[];
    /** True when a missing+unexpected pair shares destination and input slot
     *  with different sources — the dynamic-input REPLACEMENT pattern (rule 12,
     *  NEG3): a later connect overwrote the earlier wire. */
    replacementSuspected: boolean;
    /** Named explanation when replacementSuspected, else undefined. */
    replacementHint?: string;
}
/** Core comparison: expected vs real edge set (from /connections). */
export declare function verifyWiring(path: string, expected: ExpectedEdge[], actualEdges: Array<{
    from: string;
    to: string;
    input: number;
}>): WiringCheckResult;
export declare function registerWiringCheckTools(server: McpServer, client: TDClient): void;
