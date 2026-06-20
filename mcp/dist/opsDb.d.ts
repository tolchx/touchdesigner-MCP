import { TdFamilySchema, type OpsIndex, type OpsOperatorDoc, type TdFamily } from "./knowledgeCache.js";
export { TdFamilySchema };
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
/** Get the ops index from the unified cache. */
export declare function loadOpsIndex(): Promise<OpsIndex>;
/** Load a single ops operator doc. Uses the unified cache helper. */
export declare function loadOpsOperatorDoc(family: TdFamily, pageSlug: string): Promise<OpsOperatorDoc>;
/** Query ops with search, family filter, or direct slug lookup. */
export declare function queryOps(options: QueryOpsOptions): Promise<QueryOpsResult>;
