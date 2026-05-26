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
    familyHints: z.ZodArray<z.ZodEnum<["POP", "TOP", "CHOP", "SOP", "DAT"]>, "many">;
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
    familyHints: ("TOP" | "CHOP" | "SOP" | "DAT" | "POP")[];
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
    familyHints: ("TOP" | "CHOP" | "SOP" | "DAT" | "POP")[];
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
export declare function resolveSemanticTerms(input: string): {
    original: string;
    normalized: string;
    conceptMatches: {
        concept: string;
        canonical: string;
        aliases: string[];
        note?: string | undefined;
    }[];
    familyHints: ("TOP" | "CHOP" | "SOP" | "DAT" | "POP")[];
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
};
