/**
 * Generic Knowledge Database
 *
 * Unifies the query logic shared between opsDb.ts and popsDb.ts:
 *   - Load index from the unified knowledgeCache
 *   - Search with substring scoring
 *   - Direct operator lookup by slug
 *
 * Parameterised by two type variables so each domain (ops, pops) keeps
 * its own strongly-typed interface while re-using the search engine.
 */
import {
  getOpsIndex,
  getPopsIndex,
  loadOpsOperatorDoc,
  loadPopsOperatorDoc,
  type OpsIndex,
  type OpsOperatorDoc,
  type PopsIndex,
  type PopsOperatorDoc,
  type TdFamily,
} from "./knowledgeCache.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shared shape for every index item (ops has `family`, pops has `experimental`). */
export interface IndexItemBase {
  pageTitle: string;
  pageSlug: string;
  url: string;
  tdOpTypeGuess?: string;
  summary?: string;
}

/** A scored search result wrapper. */
interface Scored<I extends IndexItemBase> {
  op: I;
  score: number;
}

// ─── Generic query engine ───────────────────────────────────────────────────

/**
 * Generic search-and-lookup over any knowledge index.
 *
 * @param items       Full operator array from the typed index
 * @param search      Optional search string (substring match)
 * @param limit       Max results (clamped 1..50)
 * @param extraFilter Optional pre-filter applied before scoring (e.g. family)
 * @returns           The scored, filtered, sliced results
 */
export function searchIndex<I extends IndexItemBase>(
  items: I[],
  search: string | undefined,
  limit: number = 10,
  extraFilter?: (item: I) => boolean,
): { results: I[]; total: number } {
  const clampedLimit = Math.max(1, Math.min(50, limit));

  let pool = items;
  if (extraFilter) {
    pool = pool.filter(extraFilter);
  }

  const q = (search ?? "").trim().toLowerCase();
  if (!q) {
    return { results: pool.slice(0, clampedLimit), total: pool.length };
  }

  const scored: Scored<I>[] = pool
    .map((op) => {
      const hay =
        `${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
          .toLowerCase()
          .trim();
      const idx = hay.indexOf(q);
      const score = idx === -1 ? -1 : 1000 - idx;
      return { op, score };
    })
    .filter((x): x is Scored<I> => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  return {
    results: scored.map((x) => x.op).slice(0, clampedLimit),
    total: scored.length,
  };
}

// ─── Ops-specific API (preserves opsDb public interface) ────────────────────

export interface QueryOpsOptions {
  search?: string;
  family?: TdFamily;
  pageSlug?: string;
  limit?: number;
}

export interface QueryOpsResult {
  kind: "operator" | "search";
  operator?: OpsOperatorDoc;
  results?: Array<IndexItemBase & { family: TdFamily }>;
  total?: number;
}

export async function queryOps(options: QueryOpsOptions): Promise<QueryOpsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by family + slug
  if (options.family && options.pageSlug) {
    const operator = await loadOpsOperatorDoc(options.family, options.pageSlug);
    return { kind: "operator", operator };
  }

  const index = getOpsIndex();
  const { results, total } = searchIndex(
    index.operators,
    options.search,
    limit,
    options.family ? (o) => o.family === options.family : undefined,
  );

  return { kind: "search", results, total };
}

// ─── Pops-specific API (preserves popsDb public interface) ──────────────────

export interface QueryPopsOptions {
  search?: string;
  pageSlug?: string;
  limit?: number;
}

export interface QueryPopsResult {
  kind: "operator" | "search";
  operator?: PopsOperatorDoc;
  results?: Array<IndexItemBase & { experimental: boolean }>;
  total?: number;
}

export async function queryPops(options: QueryPopsOptions): Promise<QueryPopsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by slug
  if (options.pageSlug) {
    const operator = await loadPopsOperatorDoc(options.pageSlug);
    return { kind: "operator", operator };
  }

  const index = getPopsIndex();
  const { results, total } = searchIndex(index.operators, options.search, limit);

  return { kind: "search", results, total };
}
