/**
 * @deprecated Use networkPlannerGraph.ts instead (topology-aware graph planner).
 * This module now delegates to the graph planner for backward compatibility.
 */
import type { TDClient } from "td-api";
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";
export type { NetworkGraph, GraphNode, GraphConnection, PlanResult } from "./networkPlannerGraph.js";
/** Levenshtein distance for fuzzy search scoring */
export declare function levenshteinDistance(a: string, b: string): number;
export interface FuzzySearchResult {
    name: string;
    label: string;
    score: number;
    family: string;
}
export declare function fuzzySearchOperators(query: string, limit?: number): FuzzySearchResult[];
interface PlanOptions {
    td: TDClient;
    prompt: string;
    targetPath?: string;
    containerName?: string;
    apply: boolean;
}
interface PlanResult {
    success: boolean;
    plan?: any;
    message?: string;
    error?: string;
}
/**
 * @deprecated Use planNetworkGraph() from networkPlannerGraph.ts instead.
 * Delegate to the graph-based planner which handles multi-input, branching,
 * and feedback loops. Falls back to deterministic matching if LLM unavailable.
 */
export declare function createNetworkPlan(options: PlanOptions): Promise<PlanResult>;
