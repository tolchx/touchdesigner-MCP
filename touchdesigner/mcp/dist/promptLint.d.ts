#!/usr/bin/env node
export declare function lintPrompts(options: {
    promptsDir: string;
}): Promise<{
    total: number;
    failed: {
        file: string;
        errors: string[];
    }[];
    passed: number;
}>;
