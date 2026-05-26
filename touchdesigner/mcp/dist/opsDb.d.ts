import { z } from "zod";
export declare const TdFamilySchema: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT"]>;
export type TdFamily = z.infer<typeof TdFamilySchema>;
declare const OpsOperatorIndexItemSchema: z.ZodObject<{
    family: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT"]>;
    pageTitle: z.ZodString;
    pageSlug: z.ZodString;
    url: z.ZodString;
    tdOpTypeGuess: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    family: "TOP" | "CHOP" | "SOP" | "DAT";
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    family: "TOP" | "CHOP" | "SOP" | "DAT";
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}>;
export declare const OpsIndexSchema: z.ZodObject<{
    generatedAt: z.ZodString;
    source: z.ZodObject<{
        categories: z.ZodRecord<z.ZodEnum<["TOP", "CHOP", "SOP", "DAT"]>, z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        categories: Partial<Record<"TOP" | "CHOP" | "SOP" | "DAT", string>>;
    }, {
        categories: Partial<Record<"TOP" | "CHOP" | "SOP" | "DAT", string>>;
    }>;
    operators: z.ZodArray<z.ZodObject<{
        family: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT"]>;
        pageTitle: z.ZodString;
        pageSlug: z.ZodString;
        url: z.ZodString;
        tdOpTypeGuess: z.ZodOptional<z.ZodString>;
        summary: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        pageTitle: string;
        pageSlug: string;
        url: string;
        family: "TOP" | "CHOP" | "SOP" | "DAT";
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }, {
        pageTitle: string;
        pageSlug: string;
        url: string;
        family: "TOP" | "CHOP" | "SOP" | "DAT";
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    generatedAt: string;
    source: {
        categories: Partial<Record<"TOP" | "CHOP" | "SOP" | "DAT", string>>;
    };
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        family: "TOP" | "CHOP" | "SOP" | "DAT";
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }[];
}, {
    generatedAt: string;
    source: {
        categories: Partial<Record<"TOP" | "CHOP" | "SOP" | "DAT", string>>;
    };
    operators: {
        pageTitle: string;
        pageSlug: string;
        url: string;
        family: "TOP" | "CHOP" | "SOP" | "DAT";
        tdOpTypeGuess?: string | undefined;
        summary?: string | undefined;
    }[];
}>;
export type OpsIndex = z.infer<typeof OpsIndexSchema>;
export type OpsOperatorIndexItem = z.infer<typeof OpsOperatorIndexItemSchema>;
export declare const OpsOperatorDocSchema: z.ZodObject<{
    family: z.ZodEnum<["TOP", "CHOP", "SOP", "DAT"]>;
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
    family: "TOP" | "CHOP" | "SOP" | "DAT";
    tdOpTypeGuess?: string | undefined;
    summary?: string | undefined;
}, {
    pageTitle: string;
    pageSlug: string;
    url: string;
    family: "TOP" | "CHOP" | "SOP" | "DAT";
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
export type OpsOperatorDoc = z.infer<typeof OpsOperatorDocSchema>;
export declare function loadOpsIndex(): Promise<OpsIndex>;
export declare function loadOpsOperatorDoc(family: TdFamily, pageSlug: string): Promise<OpsOperatorDoc>;
export declare function queryOps(options: {
    search?: string;
    family?: TdFamily;
    pageSlug?: string;
    limit?: number;
}): Promise<{
    kind: "operator";
    operator: OpsOperatorDoc;
} | {
    kind: "search";
    results: OpsOperatorIndexItem[];
    total: number;
}>;
export {};
