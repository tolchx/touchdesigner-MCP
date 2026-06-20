export interface QueryTemplatesOptions {
    search: string;
    project?: string;
    limit?: number;
}
export interface TemplateResult {
    project: string;
    file: string;
    fullPath: string;
    score: number;
    excerpt: string;
}
export interface QueryTemplatesResult {
    kind: "template_search";
    query: string;
    total: number;
    results: TemplateResult[];
}
export declare function queryTemplates(options: QueryTemplatesOptions): Promise<QueryTemplatesResult>;
