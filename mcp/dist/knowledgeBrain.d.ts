/**
 * Knowledge Brain — FTS5 SQLite Search Engine for TD Operator Docs
 *
 * Implements the Knowledge Brain system from the original TDPilot project,
 * ported to TypeScript with ESM support.  Features:
 *
 *   • FTS5 full-text search with BM25-style relevance scoring
 *   • Family-scoped search (TOP, CHOP, SOP, DAT, POP)
 *   • Trust-tier ranking: official (3) > bundled (2) > community (1)
 *   • Auto-builds the FTS5 database on first use if it doesn't exist
 *   • In-memory cache with configurable TTL
 *   • Ingests operator JSON from data/ops/operators/ and data/pops/operators/
 *
 * DEPENDENCIES
 *   npm install better-sqlite3          ← CJS native module
 *   npm install --save-dev @types/better-sqlite3
 *
 *   better-sqlite3 is loaded via createRequire because it is a CJS native
 *   addon and this project uses ESM ("type": "module").
 */
import { TdFamily } from "./knowledgeCache.js";
/** Knowledge brain extends the base TdFamily with "unknown" for unclassified operators. */
type BrainFamily = TdFamily | "unknown";
export type TrustTier = "official" | "bundled" | "community";
export type SourceType = "ops" | "pops";
export interface KnowledgeBrainEntry {
    /** Unique row id in the documents table */
    rowid: number;
    /** Canonical operator type name (e.g. "noiseTOP", "noisePOP") */
    name: string;
    /** Operator family (includes 'unknown' for unclassified operators) */
    family: BrainFamily;
    /** Human-readable page title */
    pageTitle: string;
    /** URL slug */
    pageSlug: string;
    /** Derivative docs URL */
    url: string;
    /** Short description / summary */
    summary: string;
    /** Trust tier for ranking boost */
    trustTier: TrustTier;
    /** Source: ops (standard operators) or pops (experimental POPs) */
    sourceType: SourceType;
}
export interface SearchResult {
    entry: KnowledgeBrainEntry;
    /** BM25-style relevance score (higher = better) */
    score: number;
    /** FTS5 snippet with <b>...</b> highlighting */
    snippet: string;
}
export interface SearchOptions {
    query: string;
    limit?: number;
    /** Only operators from this family */
    family?: TdFamily;
    /** Minimum trust tier filter (inclusive) */
    minTrust?: TrustTier;
    /** Source filter */
    sourceType?: SourceType;
}
/**
 * Search the knowledge brain with FTS5 + BM25 scoring.
 *
 * @param query  - Free-text search query (FTS5 syntax supported).
 * @param limit  - Max results to return (default 10, max 50).
 * @returns Ranked search results with scores and HTML snippets.
 */
export declare function searchKnowledge(query: string, limit?: number): {
    results: SearchResult[];
    total: number;
};
/**
 * Search with family filter — only operators matching the given family.
 */
export declare function searchByFamily(query: string, family: TdFamily, limit?: number): {
    results: SearchResult[];
    total: number;
};
/**
 * Full-featured search with all options.
 *
 * Results are cached for 60 seconds by default; clearing happens on rebuild.
 */
export declare function searchKnowledgeAdvanced(options: SearchOptions): {
    results: SearchResult[];
    total: number;
};
/** Get total document count across trust tiers. */
export declare function brainStats(): {
    total: number;
    byFamily: Record<string, number>;
    byTrust: Record<string, number>;
    bySource: Record<string, number>;
};
export {};
