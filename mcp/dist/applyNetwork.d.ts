/**
 * Apply Network Graph — Push a planned graph to TouchDesigner
 *
 * Creates nodes, wires connections, and runs post-build verification.
 * Extracted from networkPlannerGraph.ts for single-responsibility.
 */
import type { TDClient } from "td-api";
import { type WiringCheckResult } from "./tools/wiringCheck.js";
import type { NetworkGraph } from "./topologyData.js";
export type ApplyResult = {
    success: boolean;
    created: number;
    connected: number;
    errors: string[];
    warnings: string[];
    /** Automatic post-build wiring verification (td_verify_wiring semantics,
     *  AGENTS.md rule 16) with the expected-edge spec embedded from the graph.
     *  `{ skipped }` when the client cannot read connections. */
    wiring?: WiringCheckResult | {
        skipped: string;
    };
};
/**
 * Detect dynamic-input slot collisions BEFORE building (AGENTS.md rule 12,
 * NEG3 evidence): on dynamic-input ops (mergePOP, compositeTOP, ...),
 * `tgt.inputConnectors[i].connect(src)` REPLACES the wire already occupying
 * slot i instead of appending. Two expected edges `(a→d, i)` and `(b→d, i)`
 * with a≠b cannot both exist after the build: the second connect silently
 * overwrites the first, and only the post-build /connections edge-set check
 * (rule 16 / td_verify_wiring) would notice.
 *
 * Returns one warning per colliding slot, naming the edges that share it.
 */
export declare function detectSlotCollisions(graph: NetworkGraph): string[];
/**
 * Apply a network graph to TouchDesigner: create nodes, then wire connections.
 * Creates nodes first (all must succeed), then wires in topological order
 * (sources first, then targets).
 */
export declare function applyNetworkGraph(client: TDClient, graph: NetworkGraph): Promise<ApplyResult>;
