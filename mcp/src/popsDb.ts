/**
 * POPs Knowledge Database
 *
 * Thin wrapper around the generic knowledgeDb.queryPops.
 * Re-exports types for backward compatibility.
 */
import { queryPops as _queryPops } from "./knowledgeDb.js";
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

// ─── Public API (delegates to generic knowledgeDb) ──────────────────────────

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
  return _queryPops(options) as Promise<QueryPopsResult>;
}
