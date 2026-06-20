/**
 * Network Planner Graph — Topology-Aware Network Planning
 *
 * Thin orchestrator that re-exports from the split modules:
 *   - topologyData.ts: types, pattern tables, inference, catalog builder
 *   - plannerLlm.ts: LLM-based network planning
 *   - plannerDeterministic.ts: deterministic fallback planner
 */

import type { TDClient } from "td-api";

// Re-export from split modules
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";
export { isFamilyCompatible, deterministicPlan } from "./plannerDeterministic.js";
export {
  buildTopologyCatalog,
  inferOpTopology,
  type GraphNode,
  type GraphConnection,
  type NetworkGraph,
  type OpTopology,
  type PlanResult,
} from "./topologyData.js";

import { applyNetworkGraph } from "./applyNetwork.js";

// Import what we need for orchestrator + fuzzy search
import type { NetworkGraph, PlanResult } from "./topologyData.js";
import { buildTopologyCatalog } from "./topologyData.js";
import { llmPlanNetwork } from "./plannerLlm.js";
import { deterministicPlan } from "./plannerDeterministic.js";
import { ensureKnowledgeLoaded, getSearchIndex } from "./knowledgeCache.js";

// ─── Fuzzy Search (moved from networkPlanner.ts) ──────────────────────────

/** Levenshtein distance for fuzzy search scoring */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[] = [];
  for (let i = 0; i <= bn; i++) matrix[i] = i;
  for (let i = 1; i <= an; i++) {
    let prev = i;
    for (let j = 1; j <= bn; j++) {
      const temp = matrix[j - 1];
      matrix[j - 1] = prev;
      prev =
        a[i - 1] === b[j - 1]
          ? temp
          : Math.min(temp, matrix[j], prev) + 1;
    }
    matrix[bn] = prev;
  }
  return matrix[bn];
}

export interface FuzzySearchResult {
  name: string;
  label: string;
  score: number;
  family: string;
}

export function fuzzySearchOperators(query: string, limit: number = 10): FuzzySearchResult[] {
  ensureKnowledgeLoaded();
  const searchIndex = getSearchIndex();
  if (searchIndex.size === 0) return [];
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results: FuzzySearchResult[] = [];
  const seen = new Set<string>();
  for (const [, entry] of searchIndex) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    const nameLower = entry.name.toLowerCase();
    const labelLower = entry.label.toLowerCase();
    const searchText = nameLower + " " + labelLower;
    let score = 0;
    if (nameLower === q || labelLower === q) score = 100;
    else if (nameLower.startsWith(q) || labelLower.startsWith(q)) score = 80;
    else if (searchText.includes(q)) score = 60;
    else {
      const ld = levenshteinDistance(q, nameLower.substring(0, Math.min(nameLower.length, q.length + 3)));
      if (ld < 3) score = 40;
    }
    if (score > 0) {
      results.push({ name: entry.name, label: entry.label, score, family: entry.family });
    }
  }
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });
  return results.slice(0, limit);
}

// ─── Public API ────────────────────────────────────────────────────────────

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
export async function planNetworkGraph(options: GraphPlanOptions): Promise<PlanResult> {
  const {
    td,
    prompt,
    targetPath = "/",
    containerName,
    useLlm = true,
    apply = false,
  } = options;

  try {
    const catalog = buildTopologyCatalog();

    // Plan the graph
    let graph: NetworkGraph;
    if (useLlm) {
      graph = await llmPlanNetwork(prompt, catalog, targetPath);
    } else {
      graph = deterministicPlan(prompt, catalog, targetPath);
    }

    if (containerName) {
      graph.containerName = containerName;
    }

    // Apply to TD if requested
    if (apply && td) {
      const result = await applyNetworkGraph(td, graph);
      return {
        success: result.success,
        graph,
        createdCount: result.created,
        connectedCount: result.connected,
        message: `Created ${result.created} nodes, wired ${result.connected} connections.`
          + (result.errors.length > 0 ? ` ${result.errors.length} errors.` : ""),
        error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
      };
    }

    return {
      success: true,
      graph,
      message: `Dry-run: planned ${graph.nodes.length} nodes and ${graph.connections.length} connections. Set apply=true to create them.`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || String(e),
      message: "Network planning failed.",
    };
  }
}
