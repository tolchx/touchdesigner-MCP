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
import { getOpsIndex, getPopsIndex, loadOpsOperatorDoc, loadPopsOperatorDoc, } from "./knowledgeCache.js";
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
export function searchIndex(items, search, limit = 10, extraFilter) {
    const clampedLimit = Math.max(1, Math.min(50, limit));
    let pool = items;
    if (extraFilter) {
        pool = pool.filter(extraFilter);
    }
    const q = (search ?? "").trim().toLowerCase();
    if (!q) {
        return { results: pool.slice(0, clampedLimit), total: pool.length };
    }
    const scored = pool
        .map((op) => {
        const hay = `${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
            .toLowerCase()
            .trim();
        const idx = hay.indexOf(q);
        const score = idx === -1 ? -1 : 1000 - idx;
        return { op, score };
    })
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score);
    return {
        results: scored.map((x) => x.op).slice(0, clampedLimit),
        total: scored.length,
    };
}
export async function queryOps(options) {
    const limit = Math.max(1, Math.min(50, options.limit ?? 10));
    // Direct operator lookup by family + slug
    if (options.family && options.pageSlug) {
        const operator = await loadOpsOperatorDoc(options.family, options.pageSlug);
        return { kind: "operator", operator };
    }
    const index = getOpsIndex();
    const { results, total } = searchIndex(index.operators, options.search, limit, options.family ? (o) => o.family === options.family : undefined);
    return { kind: "search", results, total };
}
export async function queryPops(options) {
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
