#!/usr/bin/env node
export declare function buildOpsDb(options: {
    outDir: string;
    families: ("TOP" | "CHOP" | "SOP" | "DAT")[];
    categories: Record<"TOP" | "CHOP" | "SOP" | "DAT", string>;
    limit?: number;
    enrich?: boolean;
    localDocsDir?: string;
}): Promise<void>;
