/**
 * Operator Knowledge Database (TOP/CHOP/SOP/DAT)
 *
 * Thin wrapper around the generic knowledgeDb.queryOps.
 * Re-exports types for backward compatibility.
 */
import { queryOps as _queryOps } from "./knowledgeDb.js";
import { getOpsIndex, loadOpsOperatorDoc as _loadOpsOperatorDoc, TdFamilySchema, } from "./knowledgeCache.js";
// Re-export for backward compatibility (knowledge.ts imports this)
export { TdFamilySchema };
// ─── Public API (delegates to generic knowledgeDb) ──────────────────────────
/** Get the ops index from the unified cache. */
export async function loadOpsIndex() {
    return getOpsIndex();
}
/** Load a single ops operator doc. Uses the unified cache helper. */
export async function loadOpsOperatorDoc(family, pageSlug) {
    return _loadOpsOperatorDoc(family, pageSlug);
}
/** Query ops with search, family filter, or direct slug lookup. */
export async function queryOps(options) {
    return _queryOps(options);
}
