#!/usr/bin/env node
export declare function buildPopsDb(options: {
    outDir: string;
    categoryUrl: string;
    limit?: number;
    enrich?: boolean;
    localDocsDir?: string;
}): Promise<void>;
