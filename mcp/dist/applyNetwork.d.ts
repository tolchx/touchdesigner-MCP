/**
 * Apply Network Graph — Push a planned graph to TouchDesigner
 *
 * Creates nodes, wires connections, and runs post-build verification.
 * Extracted from networkPlannerGraph.ts for single-responsibility.
 */
import type { TDClient } from "td-api";
import type { NetworkGraph } from "./topologyData.js";
export type ApplyResult = {
    success: boolean;
    created: number;
    connected: number;
    errors: string[];
};
/**
 * Apply a network graph to TouchDesigner: create nodes, then wire connections.
 * Creates nodes first (all must succeed), then wires in topological order
 * (sources first, then targets).
 */
export declare function applyNetworkGraph(client: TDClient, graph: NetworkGraph): Promise<ApplyResult>;
