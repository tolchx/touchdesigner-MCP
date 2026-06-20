/**
 * POPs Knowledge Database
 *
 * Thin wrapper around the generic knowledgeDb.queryPops.
 * Re-exports types for backward compatibility.
 */
import { queryPops as _queryPops } from "./knowledgeDb.js";
import { getPopsIndex, loadPopsOperatorDoc as _loadPopsOperatorDoc, } from "./knowledgeCache.js";
// ─── Public API (delegates to generic knowledgeDb) ──────────────────────────
/** Get the pops index from the unified cache. */
export async function loadPopsIndex() {
    return getPopsIndex();
}
/** Load a single pops operator doc. Uses the unified cache helper. */
export async function loadPopsOperatorDoc(pageSlug) {
    return _loadPopsOperatorDoc(pageSlug);
}
/** Query pops with search or direct slug lookup. */
export async function queryPops(options) {
    return _queryPops(options);
}
