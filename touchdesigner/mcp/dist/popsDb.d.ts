import { z } from "zod";
declare const PopsOperatorIndexItemSchema: z.ZodObject<{
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
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    experimental?: boolean | undefined;
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}>;
export declare const PopsIndexSchema: z.ZodObject<{
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
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }, {
        pageTitle: string;
        pageSlug: string;
        url: string;
        experimental?: boolean | undefined;
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    generatedAt: string;
    source: {
        categoryUrl: string;
    };
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        experimental: boolean;
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }[];
}, {
    generatedAt: string;
    source: {
        categoryUrl: string;
    };
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        experimental?: boolean | undefined;
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }[];
}>;
export type PopsIndex = z.infer<typeof PopsIndexSchema>;
export type PopsOperatorIndexItem = z.infer<typeof PopsOperatorIndexItemSchema>;
export declare const PopsOperatorDocSchema: z.ZodObject<{
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
    experimental: boolean;
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
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    experimental?: boolean | undefined;
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
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
export type PopsOperatorDoc = z.infer<typeof PopsOperatorDocSchema>;
export declare function loadPopsIndex(): Promise<PopsIndex>;
export declare function loadPopsOperatorDoc(pageSlug: string): Promise<PopsOperatorDoc>;
export declare function queryPops(options: {
    search?: string;
    pageSlug?: string;
    limit?: number;
}): Promise<{
    kind: "operator";
    operator: PopsOperatorDoc;
} | {
    kind: "search";
    results: PopsOperatorIndexItem[];
    total: number;
}>;
export {};
