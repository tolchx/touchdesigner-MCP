/**
 * Semantic Resolution Engine — Single Source of Truth for NL→TD Resolution
 *
 * Maps natural language prompts (in Spanish and English) to canonical
 * TouchDesigner operators, parameters, attributes, and family hints.
 *
 * This module is the canonical source for:
 *   - TYPE_SYNONYMS: 200+ word→operator type mappings
 *   - FAMILY_HINTS: trigger words → TD families (with specificity scoring)
 *   - CONCEPTS: higher-level concept→parameter/attribute mappings
 *   - PARAMETER_ALIASES, ATTRIBUTE_ALIASES, OPERATOR_HINTS
 *   - resolveOperatorType(), getBestFamily(), resolvePrompt(), resolveSemanticTerms()
 */
import { z } from "zod";
export declare const SemanticResolutionSchema: z.ZodObject<{
    original: z.ZodString;
    normalized: z.ZodString;
    conceptMatches: z.ZodArray<z.ZodObject<{
        concept: z.ZodString;
        canonical: z.ZodString;
        aliases: z.ZodArray<z.ZodString, "many">;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        concept: string;
        canonical: string;
        aliases: string[];
        note?: string | undefined;
    }, {
        concept: string;
        canonical: string;
        aliases: string[];
        note?: string | undefined;
    }>, "many">;
    familyHints: z.ZodArray<z.ZodEnum<["POP", "TOP", "CHOP", "SOP", "DAT", "COMP", "MAT"]>, "many">;
    parameterHints: z.ZodArray<z.ZodObject<{
        requested: z.ZodString;
        canonical: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }, {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }>, "many">;
    attributeHints: z.ZodArray<z.ZodObject<{
        requested: z.ZodString;
        canonical: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }, {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }>, "many">;
    operatorHints: z.ZodArray<z.ZodObject<{
        requested: z.ZodString;
        canonical: z.ZodString;
        family: z.ZodOptional<z.ZodString>;
        note: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        canonical: string;
        requested: string;
        family?: string | undefined;
        note?: string | undefined;
    }, {
        canonical: string;
        requested: string;
        family?: string | undefined;
        note?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    original: string;
    normalized: string;
    conceptMatches: {
        concept: string;
        canonical: string;
        aliases: string[];
        note?: string | undefined;
    }[];
    familyHints: ("TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT")[];
    parameterHints: {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }[];
    attributeHints: {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }[];
    operatorHints: {
        canonical: string;
        requested: string;
        family?: string | undefined;
        note?: string | undefined;
    }[];
}, {
    original: string;
    normalized: string;
    conceptMatches: {
        concept: string;
        canonical: string;
        aliases: string[];
        note?: string | undefined;
    }[];
    familyHints: ("TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT")[];
    parameterHints: {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }[];
    attributeHints: {
        canonical: string;
        requested: string;
        note?: string | undefined;
    }[];
    operatorHints: {
        canonical: string;
        requested: string;
        family?: string | undefined;
        note?: string | undefined;
    }[];
}>;
export type SemanticResolution = z.infer<typeof SemanticResolutionSchema>;
export declare const TYPE_SYNONYMS: Record<string, string[]>;
export interface FamilyHintEntry {
    family: "TOP" | "CHOP" | "SOP" | "DAT" | "POP" | "COMP" | "MAT";
    /** Higher = more specific; used for tie-breaking */
    specificity: number;
    /** Words that suggest this family */
    aliases: string[];
}
export declare const FAMILY_HINTS: FamilyHintEntry[];
export declare function resolveSemanticTerms(input: string): SemanticResolution;
/**
 * Resolve a natural-language phrase to the best-matching TD operator type.
 * Multi-word synonyms get a bonus so "green screen" beats a lone "green".
 */
export declare function resolveOperatorType(prompt: string): string;
/**
 * Resolve ALL matching operator types from a prompt, ranked by score.
 */
export declare function resolveAllOperatorTypes(prompt: string, topN?: number): Array<{
    opType: string;
    score: number;
}>;
/**
 * Infer the most likely TD operator family from a prompt.
 */
export declare function getBestFamily(prompt: string): string;
/**
 * Get all matching families ranked by confidence.
 */
export declare function getAllFamilies(prompt: string): Array<{
    family: string;
    score: number;
    specificity: number;
}>;
