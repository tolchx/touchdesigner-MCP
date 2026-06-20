/**
 * Network Templates — Template storage, retrieval, and search
 *
 * Templates are loaded from data/templates/builtin-templates.json.
 * NL→TD resolution (TYPE_SYNONYMS, FAMILY_HINTS, resolveOperatorType, getBestFamily)
 * lives in semantic.ts — this module re-exports them for backward compatibility.
 */
export interface TemplateOperator {
    id: string;
    opType: string;
    label: string;
    purpose: string;
}
export interface TemplateConnection {
    from: string;
    to: string;
    inputIndex: number;
    note: string;
}
export interface TemplateParameter {
    opId: string;
    paramName: string;
    value: unknown;
    note: string;
}
export interface NetworkTemplate {
    name: string;
    description: string;
    tags: string[];
    complexity: "simple" | "medium" | "advanced";
    operators: TemplateOperator[];
    connections: TemplateConnection[];
    parameters: TemplateParameter[];
    pythonBuilder: string;
}
import { TYPE_SYNONYMS, FAMILY_HINTS, type FamilyHintEntry, resolveOperatorType, resolveAllOperatorTypes, getBestFamily, getAllFamilies, resolveSemanticTerms, type SemanticResolution } from "./semantic.js";
export { TYPE_SYNONYMS, FAMILY_HINTS, type FamilyHintEntry, resolveOperatorType, resolveAllOperatorTypes, getBestFamily, getAllFamilies, resolveSemanticTerms, type SemanticResolution, };
export interface PromptResolution {
    prompt: string;
    operatorType: string;
    allOperatorTypes: Array<{
        opType: string;
        score: number;
    }>;
    family: string;
    allFamilies: Array<{
        family: string;
        score: number;
    }>;
    matchingTemplates: NetworkTemplate[];
}
/**
 * Fully resolve a natural-language prompt: operator type, family, templates.
 * This is the convenience entry point for the MCP server.
 */
export declare function resolvePrompt(prompt: string): PromptResolution;
/**
 * The built-in (non-POP-chain) templates.
 */
export declare const NETWORK_TEMPLATES: NetworkTemplate[];
/**
 * All network templates. Currently identical to NETWORK_TEMPLATES
 * (POP chain templates removed in Fix #5 simplification).
 */
export declare const ALL_NETWORK_TEMPLATES: NetworkTemplate[];
/**
 * Find a network template by name (exact match).
 */
export declare function getTemplateByName(name: string): NetworkTemplate | undefined;
/**
 * Search templates by tag or description substring.
 */
export declare function searchTemplates(query: string): NetworkTemplate[];
/**
 * List all available template names.
 */
export declare function listTemplateNames(): string[];
/**
 * List all unique tags across all templates.
 */
export declare function listAllTags(): string[];
