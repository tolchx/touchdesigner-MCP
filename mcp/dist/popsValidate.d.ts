/**
 * POPs Validate — parameter validation + corpus-derived POP network templates.
 *
 * 1. validatePopParameters: check requested parameter names against the REAL
 *    parameter list of a POP type (from pop_operators.json, live-probed on
 *    TD 2025.32460) BEFORE setting anything — never set parameters blindly.
 *    Unknown names return a clear error with fuzzy suggestions.
 * 2. POP_NETWORK_TEMPLATES: the six corpus-validated chains (patterns.json):
 *    line→merge→copy, circle→merge→switch, grid→attribute (instancing),
 *    sphere→transform→trail, box→glsl (chained glsl→glsl),
 *    sprinkle→particle (feedback loop). Parameter names used in templates are
 *    real build names (param_usage.json top writes per type).
 *
 * Pure offline module (no TD connection) — unit-testable without TouchDesigner.
 */
import type { TDClient } from "td-api";
export interface PopParamIssue {
    name: string;
    suggestions: string[];
}
export interface PopParamValidation {
    ok: boolean;
    /** Lowercased short type key used for the lookup ("circlepop"). */
    typeKey: string;
    /** Number of real parameters known for this type (0 = unknown type). */
    knownParamCount: number;
    /** Params not in the knowledge base for this type. */
    unknown: PopParamIssue[];
    /** Params confirmed to exist in the knowledge base. */
    valid: string[];
    /** True when the type is not in the knowledge base (validation skipped). */
    skipped: boolean;
}
export declare function validatePopParameters(opType: string, requestedNames: string[]): PopParamValidation;
/** Validate + throw a formatted error when unknown parameters are detected. */
export declare function assertValidPopParameters(opType: string, requestedNames: string[]): PopParamValidation;
export interface RuntimeParamValidation {
    ok: boolean;
    /** Where the authoritative name list came from. */
    source: "live" | "knowledge-base" | "skipped";
    unknown: PopParamIssue[];
    valid: string[];
    knownParamCount: number;
    /** Human-readable detail (error message with suggestions when !ok). */
    detail: string;
}
/**
 * Validate parameter names for a specific operator path before setting them.
 *
 * Preferred source: the operator's REAL parameters read live via /parameters.
 * Fallback: the offline POP knowledge base (pop_operators.json) when the live
 * read fails and the type is a known POP. If neither source can verify, the
 * validation is skipped (ok) — callers must not block on unverifiable names.
 */
export declare function validateParameterNamesForPath(client: TDClient, path: string, names: string[], opTypeHint?: string): Promise<RuntimeParamValidation>;
export interface PopTemplateOperator {
    id: string;
    opType: string;
    label: string;
    purpose: string;
}
export interface PopTemplateConnection {
    from: string;
    to: string;
    inputIndex: number;
    note: string;
}
export interface PopTemplateParameter {
    opId: string;
    paramName: string;
    value: unknown;
    note: string;
}
export interface PopNetworkTemplate {
    name: string;
    description: string;
    /** Corpus evidence: POP→POP chain from patterns.json with occurrence count. */
    corpusChain: string;
    corpusCount: number;
    complexity: "simple" | "medium" | "advanced";
    operators: PopTemplateOperator[];
    connections: PopTemplateConnection[];
    parameters: PopTemplateParameter[];
    pythonBuilder: string;
}
/**
 * The six templates requested, each backed by a measured corpus chain.
 * All parameter names are real build names verified against
 * pop_operators.json `live_params` and param_usage.json writes.
 */
export declare const POP_NETWORK_TEMPLATES: PopNetworkTemplate[];
/**
 * Find POP templates by query (name, tag-ish substring on description or
 * corpus chain). Empty query returns all templates.
 */
export declare function searchPopTemplates(query: string): PopNetworkTemplate[];
/** Get a POP template by exact name. */
export declare function getPopTemplateByName(name: string): PopNetworkTemplate | undefined;
import type { NetworkTemplate } from "./networkTemplates.js";
/**
 * Convert the corpus-derived POP templates to the generic NetworkTemplate
 * shape used by networkTemplates.ts (search, td_list_templates, resolvePrompt).
 */
export declare function popTemplatesAsNetworkTemplates(): NetworkTemplate[];
/**
 * Best-effort resolution of the real operator type for a path, used as the
 * type hint for knowledge-base parameter validation. Returns the TD type
 * (e.g. "circlePOP") when the operator is a known POP, otherwise null.
 * Errors are swallowed — validation must never block on this lookup.
 */
export declare function resolvePopTypeForPath(client: TDClient, path: string): Promise<string | null>;
