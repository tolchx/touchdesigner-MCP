/**
 * Operator Knowledge Database (TOP/CHOP/SOP/DAT)
 *
 * Loads and queries the local operator index and detailed operator docs.
 * Uses the unified knowledgeCache for index data to avoid redundant disk loads.
 */
import {
  getOpsIndex,
  loadOpsOperatorDoc as _loadOpsOperatorDoc,
  TdFamilySchema,
  type OpsIndex,
  type OpsOperatorDoc,
  type TdFamily,
} from "./knowledgeCache.js";

// Re-export for backward compatibility (knowledge.ts imports this)
export { TdFamilySchema };

// ─── Types ──────────────────────────────────────────────────────────────────

export type { TdFamily, OpsIndex, OpsOperatorDoc };

export interface OpsIndexItem {
  family: TdFamily;
  pageTitle: string;
  pageSlug: string;
  url: string;
  tdOpTypeGuess?: string;
  summary?: string;
}

export interface QueryOpsOptions {
  search?: string;
  family?: TdFamily;
  pageSlug?: string;
  limit?: number;
}

export interface QueryOpsResult {
  kind: "operator" | "search";
  operator?: OpsOperatorDoc;
  results?: OpsIndexItem[];
  total?: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Get the ops index from the unified cache. */
export async function loadOpsIndex(): Promise<OpsIndex> {
  return getOpsIndex();
}

/** Load a single ops operator doc. Uses the unified cache helper. */
export async function loadOpsOperatorDoc(
  family: TdFamily,
  pageSlug: string
): Promise<OpsOperatorDoc> {
  return _loadOpsOperatorDoc(family, pageSlug);
}

/** Query ops with search, family filter, or direct slug lookup. */
export async function queryOps(
  options: QueryOpsOptions
): Promise<QueryOpsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by family + slug
  if (options.family && options.pageSlug) {
    const operator = await loadOpsOperatorDoc(options.family, options.pageSlug);
    return { kind: "operator", operator };
  }

  // Search across the index (uses unified cache)
  const index = await loadOpsIndex();
  const pool = options.family
    ? index.operators.filter((o) => o.family === options.family)
    : index.operators;

  const q = (options.search ?? "").trim().toLowerCase();
  if (!q) {
    return { kind: "search", results: pool.slice(0, limit), total: pool.length };
  }

  const scored = pool
    .map((op) => {
      const hay =
        `${op.family} ${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
          .toLowerCase()
          .trim();
      const idx = hay.indexOf(q);
      const score = idx === -1 ? -1 : 1000 - idx;
      return { op, score };
    })
    .filter((x): x is { op: OpsIndexItem; score: number } => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.op);

  return { kind: "search", results: scored.slice(0, limit), total: scored.length };
}
