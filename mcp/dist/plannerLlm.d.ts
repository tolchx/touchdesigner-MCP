/**
 * LLM Graph Planner — Uses LLM to plan TouchDesigner networks
 *
 * Extracted from networkPlannerGraph.ts. Uses the topology catalog
 * to generate structured network graphs via LLM, with deterministic
 * fallback on failure.
 */
import type { OpTopology, NetworkGraph } from "./topologyData.js";
/**
 * Plan a network graph using the LLM.
 * Falls back to deterministic planning if LLM is unavailable.
 */
export declare function llmPlanNetwork(prompt: string, catalog: Map<string, OpTopology>, targetPath: string): Promise<NetworkGraph>;
