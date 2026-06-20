/**
 * Network Planner Graph — Topology-Aware Network Planning
 *
 * Thin orchestrator that re-exports from the split modules:
 *   - topologyData.ts: types, pattern tables, inference, catalog builder
 *   - plannerLlm.ts: LLM-based network planning
 *   - plannerDeterministic.ts: deterministic fallback planner
 */
import type { TDClient } from "td-api";
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";
export { isFamilyCompatible, deterministicPlan } from "./plannerDeterministic.js";
export { buildTopologyCatalog, inferOpTopology, type GraphNode, type GraphConnection, type NetworkGraph, type OpTopology, type PlanResult, } from "./topologyData.js";
import type { PlanResult } from "./topologyData.js";
/** Levenshtein distance for fuzzy search scoring */
export declare function levenshteinDistance(a: string, b: string): number;
export interface FuzzySearchResult {
    name: string;
    label: string;
    score: number;
    family: string;
}
export declare function fuzzySearchOperators(query: string, limit?: number): FuzzySearchResult[];
export interface GraphPlanOptions {
    td: TDClient;
    prompt: string;
    targetPath?: string;
    containerName?: string;
    /** Use LLM for planning (falls back to deterministic if LLM unavailable) */
    useLlm?: boolean;
    /** Apply the plan to TD immediately */
    apply: boolean;
}
/**
 * Plan a network graph from a natural language prompt.
 * Uses LLM when available, falls back to deterministic matching.
 */
export declare function planNetworkGraph(options: GraphPlanOptions): Promise<PlanResult>;
