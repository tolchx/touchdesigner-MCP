import { z } from "zod";
export declare const TdFamilySchema: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]>;
declare const OpsIndexSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    source: z.ZodObject<{
        categories: z.ZodRecord<z.ZodEnum<["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]>, z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        categories: Partial<Record<"TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT", string>>;
    }, {
        categories: Partial<Record<"TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT", string>>;
    }>;
    operators: z.ZodArray<z.ZodObject<{
        family: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]>;
        pageTitle: z.ZodString;
        pageSlug: z.ZodString;
        url: z.ZodString;
        tdOpTypeGuess: z.ZodOptional<z.ZodString>;
        summary: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }, {
        family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    operators: {
        family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }[];
    generatedAt: string;
    source: {
        categories: Partial<Record<"TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT", string>>;
    };
}, {
    operators: {
        family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }[];
    generatedAt: string;
    source: {
        categories: Partial<Record<"TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT", string>>;
    };
}>;
declare const OpsOperatorDocSchema: z.ZodObject<{
    family: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]>;
    pageTitle: z.ZodString;
    pageSlug: z.ZodString;
    url: z.ZodString;
    tdOpTypeGuess: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    inputs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        index: number;
        description?: string | undefined;
    }, {
        index: number;
        description?: string | undefined;
    }>, "many">>;
    parameters: z.ZodDefault<z.ZodArray<z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        label: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }, {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }>, "many">>;
    attributes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }>, "many">>;
    localNotes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        excerpt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        source: string;
        excerpt: string;
    }, {
        source: string;
        excerpt: string;
    }>, "many">>;
    useCases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    examples: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        steps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        steps: string[];
        description?: string | undefined;
    }, {
        title: string;
        description?: string | undefined;
        steps?: string[] | undefined;
    }>, "many">>;
    commonCombinations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        with: z.ZodArray<z.ZodString, "many">;
        why: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        with: string[];
        why?: string | undefined;
    }, {
        with: string[];
        why?: string | undefined;
    }>, "many">>;
    troubleshooting: z.ZodDefault<z.ZodArray<z.ZodObject<{
        problem: z.ZodString;
        cause: z.ZodOptional<z.ZodString>;
        fix: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }, {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
    pageTitle: string;
    pageSlug: string;
    url: string;
    inputs: {
        index: number;
        description?: string | undefined;
    }[];
    parameters: {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }[];
    attributes: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[];
    localNotes: {
        source: string;
        excerpt: string;
    }[];
    useCases: string[];
    examples: {
        title: string;
        steps: string[];
        description?: string | undefined;
    }[];
    commonCombinations: {
        with: string[];
        why?: string | undefined;
    }[];
    troubleshooting: {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }[];
    summary?: string | undefined;
    tdOpTypeGuess?: string | undefined;
}, {
    family: "TOP" | "POP" | "CHOP" | "COMP" | "SOP" | "DAT" | "MAT";
    pageTitle: string;
    pageSlug: string;
    url: string;
    summary?: string | undefined;
    tdOpTypeGuess?: string | undefined;
    inputs?: {
        index: number;
        description?: string | undefined;
    }[] | undefined;
    parameters?: {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    attributes?: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    localNotes?: {
        source: string;
        excerpt: string;
    }[] | undefined;
    useCases?: string[] | undefined;
    examples?: {
        title: string;
        description?: string | undefined;
        steps?: string[] | undefined;
    }[] | undefined;
    commonCombinations?: {
        with: string[];
        why?: string | undefined;
    }[] | undefined;
    troubleshooting?: {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }[] | undefined;
}>;
declare const PopsIndexSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    source: z.ZodObject<{
        categoryUrl: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        categoryUrl: string;
    }, {
        categoryUrl: string;
    }>;
    operators: z.ZodArray<z.ZodObject<{
        pageTitle: z.ZodString;
        pageSlug: z.ZodString;
        url: z.ZodString;
        experimental: z.ZodDefault<z.ZodBoolean>;
        tdOpTypeGuess: z.ZodOptional<z.ZodString>;
        summary: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        pageTitle: string;
        pageSlug: string;
        url: string;
        experimental: boolean;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }, {
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
        experimental?: boolean | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        experimental: boolean;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
    }[];
    generatedAt: string;
    source: {
        categoryUrl: string;
    };
}, {
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        summary?: string | undefined;
        tdOpTypeGuess?: string | undefined;
        experimental?: boolean | undefined;
    }[];
    generatedAt: string;
    source: {
        categoryUrl: string;
    };
}>;
declare const PopsOperatorDocSchema: z.ZodObject<{
    pageTitle: z.ZodString;
    pageSlug: z.ZodString;
    url: z.ZodString;
    experimental: z.ZodDefault<z.ZodBoolean>;
    tdOpTypeGuess: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    inputs: z.ZodDefault<z.ZodArray<z.ZodObject<{
        index: z.ZodNumber;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        index: number;
        description?: string | undefined;
    }, {
        index: number;
        description?: string | undefined;
    }>, "many">>;
    parameters: z.ZodDefault<z.ZodArray<z.ZodObject<{
        page: z.ZodOptional<z.ZodString>;
        label: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }, {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }>, "many">>;
    attributes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }, {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }>, "many">>;
    localNotes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        excerpt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        source: string;
        excerpt: string;
    }, {
        source: string;
        excerpt: string;
    }>, "many">>;
    useCases: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    examples: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        steps: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        steps: string[];
        description?: string | undefined;
    }, {
        title: string;
        description?: string | undefined;
        steps?: string[] | undefined;
    }>, "many">>;
    commonCombinations: z.ZodDefault<z.ZodArray<z.ZodObject<{
        with: z.ZodArray<z.ZodString, "many">;
        why: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        with: string[];
        why?: string | undefined;
    }, {
        with: string[];
        why?: string | undefined;
    }>, "many">>;
    troubleshooting: z.ZodDefault<z.ZodArray<z.ZodObject<{
        problem: z.ZodString;
        cause: z.ZodOptional<z.ZodString>;
        fix: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }, {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    inputs: {
        index: number;
        description?: string | undefined;
    }[];
    parameters: {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }[];
    attributes: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[];
    localNotes: {
        source: string;
        excerpt: string;
    }[];
    useCases: string[];
    examples: {
        title: string;
        steps: string[];
        description?: string | undefined;
    }[];
    commonCombinations: {
        with: string[];
        why?: string | undefined;
    }[];
    troubleshooting: {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }[];
    experimental: boolean;
    summary?: string | undefined;
    tdOpTypeGuess?: string | undefined;
}, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    summary?: string | undefined;
    tdOpTypeGuess?: string | undefined;
    inputs?: {
        index: number;
        description?: string | undefined;
    }[] | undefined;
    parameters?: {
        label: string;
        description?: string | undefined;
        page?: string | undefined;
        name?: string | undefined;
    }[] | undefined;
    attributes?: {
        name: string;
        type?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
    localNotes?: {
        source: string;
        excerpt: string;
    }[] | undefined;
    useCases?: string[] | undefined;
    examples?: {
        title: string;
        description?: string | undefined;
        steps?: string[] | undefined;
    }[] | undefined;
    commonCombinations?: {
        with: string[];
        why?: string | undefined;
    }[] | undefined;
    troubleshooting?: {
        problem: string;
        cause?: string | undefined;
        fix?: string | undefined;
    }[] | undefined;
    experimental?: boolean | undefined;
}>;
export type TdFamily = z.infer<typeof TdFamilySchema>;
export type OpsIndex = z.infer<typeof OpsIndexSchema>;
export type OpsOperatorDoc = z.infer<typeof OpsOperatorDocSchema>;
export type PopsIndex = z.infer<typeof PopsIndexSchema>;
export type PopsOperatorDoc = z.infer<typeof PopsOperatorDocSchema>;
/**
 * Load both ops and pops knowledge from disk and build all caches.
 * Uses synchronous reads (intentional: startup-only, called once, non-blocking is fine).
 * Idempotent — safe to call multiple times.
 */
export declare function ensureKnowledgeLoaded(): void;
/**
 * Build a raw operator map from either array or Record format index data.
 * Handles legacy Record<string, path> format by loading individual files.
 *
 * Exported for unit testing (pure function — no module-level state).
 */
export declare function buildRawMap(parsed: any, family: string, dataDir: string): Record<string, any>;
/**
 * Ensure knowledge is loaded, returning a Promise.
 * Since the underlying load is sync (startup-only), this simply calls the sync version.
 */
export declare function ensureKnowledgeLoadedAsync(): Promise<void>;
/** Get the typed ops index. Loads if needed. */
export declare function getOpsIndex(): OpsIndex;
/** Get the typed pops index. Loads if needed. */
export declare function getPopsIndex(): PopsIndex;
/** Get the raw ops map (pageSlug → operator data). Loads if needed. */
export declare function getOpsMap(): Record<string, any>;
/** Get the raw pops map (pageSlug → operator data). Loads if needed. */
export declare function getPopsMap(): Record<string, any>;
/** Get the unified search index. Loads if needed. */
export declare function getSearchIndex(): Map<string, {
    name: string;
    label: string;
    family: string;
    operator: any;
}>;
/** Check if knowledge base loaded successfully. */
export declare function isKnowledgeLoaded(): boolean;
/** Get the load error if any. */
export declare function getKnowledgeLoadError(): Error | null;
export declare function buildSearchIndex(opsMap: Record<string, any>, popsMap: Record<string, any>): Map<string, {
    name: string;
    label: string;
    family: string;
    operator: any;
}>;
/** Load a single ops operator doc by family + pageSlug. */
export declare function loadOpsOperatorDoc(family: TdFamily, pageSlug: string): Promise<OpsOperatorDoc>;
/** Load a single pops operator doc by pageSlug. */
export declare function loadPopsOperatorDoc(pageSlug: string): Promise<PopsOperatorDoc>;
export {};
