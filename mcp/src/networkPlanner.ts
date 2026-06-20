/**
 * @deprecated Use networkPlannerGraph.ts instead (topology-aware graph planner).
 * This module now delegates to the graph planner for backward compatibility.
 */

import type { TDClient } from "td-api";
import {
  ensureKnowledgeLoaded,
  getOpsMap,
  getPopsMap,
  getSearchIndex,
} from "./knowledgeCache.js";
import { planNetworkGraph } from "./networkPlannerGraph.js";

// Re-export for backward compatibility (server.ts imports this)
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";

// Re-export graph planner types
export type { NetworkGraph, GraphNode, GraphConnection, PlanResult } from "./networkPlannerGraph.js";

// ── Fuzzy Search ─────────────────────────────────────────────────────

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

// ── Network Planning ──────────────────────────────────────────────────

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
export async function createNetworkPlan(options: PlanOptions): Promise<PlanResult> {
  const { td, prompt, targetPath, containerName, apply } = options;

  const result = await planNetworkGraph({
    td,
    prompt,
    targetPath: targetPath || "/",
    containerName,
    useLlm: true,
    apply,
  });

  return {
    success: result.success,
    plan: result.graph,
    message: result.message,
    error: result.error,
  };
}

