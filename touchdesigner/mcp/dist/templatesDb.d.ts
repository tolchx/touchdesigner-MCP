export interface TemplateMatch {
    project: string;
    file: string;
    fullPath: string;
    score: number;
    excerpt: string;
}
export declare function queryTemplates(options: {
    search: string;
    limit?: number;
    project?: string;
}): Promise<{
    kind: "template_search";
    query: string;
    total: number;
    results: TemplateMatch[];
}>;
