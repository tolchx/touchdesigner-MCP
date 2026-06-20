import { type PopsIndex, type PopsOperatorDoc } from "./knowledgeCache.js";
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
/** Get the pops index from the unified cache. */
export declare function loadPopsIndex(): Promise<PopsIndex>;
/** Load a single pops operator doc. Uses the unified cache helper. */
export declare function loadPopsOperatorDoc(pageSlug: string): Promise<PopsOperatorDoc>;
/** Query pops with search or direct slug lookup. */
export declare function queryPops(options: QueryPopsOptions): Promise<QueryPopsResult>;
