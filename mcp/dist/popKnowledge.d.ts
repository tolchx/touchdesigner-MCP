/**
 * POP Knowledge — offline access to the validated POP knowledge base.
 *
 * Sources (built from live probes + 102 real .toe projects, see
 * docs/POPs_KNOWLEDGE.md):
 *   data/pops/knowledge/pop_operators.json — 101 POP types with the REAL
 *     parameter names from build 2025.32460 (`live_params`), inputs/outputs,
 *     and wiki↔eval param mapping.
 *   data/pops/patterns.json                — POP→POP edges/chains from the corpus.
 *   data/pops/param_usage.json             — which params are actually written.
 *   data/pops/validation.json              — what is confirmed vs wiki drift.
 *
 * This module is pure offline data access (no TouchDesigner connection), so it
 * is unit-testable without a live TD instance.
 */
export interface PopOperatorInfo {
    /** Canonical TD type, e.g. "circlePOP". */
    type: string;
    /** Lowercased short name from the corpus, e.g. "circle". */
    name: string;
    family: string;
    /** Whether the operator was actually created live in TD (created_live). */
    createdLive: boolean;
    inputs: number;
    outputs: number;
    paramCount: number;
    /** REAL parameter names (eval names) read from the live build. */
    liveParams: string[];
}
/**
 * Load (and memoize) the POP knowledge base keyed by lowercased type name
 * (e.g. "circlepop"). Aliases: the corpus short name ("circle") also resolves.
 * Returns an empty map if the knowledge file is missing — callers must
 * degrade gracefully (skip validation) instead of blocking all writes.
 */
export declare function loadPopKnowledge(): Map<string, PopOperatorInfo>;
/** Look up a POP type ("circlePOP", "circlepop" or corpus short name "circle"). */
export declare function getPopInfo(opType: string): PopOperatorInfo | undefined;
/** All known POP type names (canonical, e.g. "circlePOP"). */
export declare function listPopTypes(): string[];
/**
 * Suggest the closest real parameter names for an unknown name.
 * Pure function — exported for direct unit testing.
 */
export declare function suggestParameterNames(knownNames: string[], badName: string, max?: number): string[];
/**
 * Human-readable error for unknown parameters, including suggestions.
 */
export declare function formatUnknownParameterError(opType: string, invalid: Array<{
    name: string;
    suggestions: string[];
}>, validCount: number): string;
/** Reset the memoized knowledge cache (used by tests). */
export declare function resetPopKnowledgeCache(): void;
