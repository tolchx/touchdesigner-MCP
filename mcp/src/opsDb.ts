/**
 * Operator Knowledge Database (TOP/CHOP/SOP/DAT)
 *
 * Thin wrapper around the generic knowledgeDb.queryOps.
 * Re-exports types for backward compatibility.
 */
import { queryOps as _queryOps } from "./knowledgeDb.js";
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

// ─── Public API (delegates to generic knowledgeDb) ──────────────────────────

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
  return _queryOps(options) as Promise<QueryOpsResult>;
}
