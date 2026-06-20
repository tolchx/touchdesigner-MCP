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
import { type OpsOperatorDoc, type PopsOperatorDoc, type TdFamily } from "./knowledgeCache.js";
/** Shared shape for every index item (ops has `family`, pops has `experimental`). */
export interface IndexItemBase {
    pageTitle: string;
    pageSlug: string;
    url: string;
    tdOpTypeGuess?: string;
    summary?: string;
}
/**
 * Generic search-and-lookup over any knowledge index.
 *
 * @param items       Full operator array from the typed index
 * @param search      Optional search string (substring match)
 * @param limit       Max results (clamped 1..50)
 * @param extraFilter Optional pre-filter applied before scoring (e.g. family)
 * @returns           The scored, filtered, sliced results
 */
export declare function searchIndex<I extends IndexItemBase>(items: I[], search: string | undefined, limit?: number, extraFilter?: (item: I) => boolean): {
    results: I[];
    total: number;
};
export interface QueryOpsOptions {
    search?: string;
    family?: TdFamily;
    pageSlug?: string;
    limit?: number;
}
export interface QueryOpsResult {
    kind: "operator" | "search";
    operator?: OpsOperatorDoc;
    results?: Array<IndexItemBase & {
        family: TdFamily;
    }>;
    total?: number;
}
export declare function queryOps(options: QueryOpsOptions): Promise<QueryOpsResult>;
export interface QueryPopsOptions {
    search?: string;
    pageSlug?: string;
    limit?: number;
}
export interface QueryPopsResult {
    kind: "operator" | "search";
    operator?: PopsOperatorDoc;
    results?: Array<IndexItemBase & {
        experimental: boolean;
    }>;
    total?: number;
}
export declare function queryPops(options: QueryPopsOptions): Promise<QueryPopsResult>;
