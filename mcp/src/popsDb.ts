/**
 * POPs Knowledge Database
 *
 * Loads and queries the local POP operator index and detailed operator docs.
 * Uses the unified knowledgeCache for index data to avoid redundant disk loads.
 */
import {
  getPopsIndex,
  loadPopsOperatorDoc as _loadPopsOperatorDoc,
  type PopsIndex,
  type PopsOperatorDoc,
} from "./knowledgeCache.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type { PopsIndex, PopsOperatorDoc };

export interface PopsIndexItem {
  pageTitle: string;
  pageSlug: string;
  url: string;
  experimental: boolean;
  tdOpTypeGuess?: string;
  summary?: string;
}

export interface QueryPopsOptions {
  search?: string;
  pageSlug?: string;
  limit?: number;
}

export interface QueryPopsResult {
  kind: "operator" | "search";
  operator?: PopsOperatorDoc;
  results?: PopsIndexItem[];
  total?: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get the pops index from the unified cache. */
export async function loadPopsIndex(): Promise<PopsIndex> {
  return getPopsIndex();
}

/** Load a single pops operator doc. Uses the unified cache helper. */
export async function loadPopsOperatorDoc(
  pageSlug: string
): Promise<PopsOperatorDoc> {
  return _loadPopsOperatorDoc(pageSlug);
}

/** Query pops with search or direct slug lookup. */
export async function queryPops(
  options: QueryPopsOptions
): Promise<QueryPopsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by slug
  if (options.pageSlug) {
    const operator = await loadPopsOperatorDoc(options.pageSlug);
    return { kind: "operator", operator };
  }

  // Search across the index (uses unified cache)
  const index = await loadPopsIndex();
  const q = (options.search ?? "").trim().toLowerCase();
  if (!q) {
    return {
      kind: "search",
      results: index.operators.slice(0, limit),
      total: index.operators.length,
    };
  }

  const scored = index.operators
    .map((op) => {
      const hay =
        `${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
          .toLowerCase()
          .trim();
      const idx = hay.indexOf(q);
      const score = idx === -1 ? -1 : 1000 - idx;
      return { op, score };
    })
    .filter((x): x is { op: PopsIndexItem; score: number } => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.op);

  return { kind: "search", results: scored.slice(0, limit), total: scored.length };
}
