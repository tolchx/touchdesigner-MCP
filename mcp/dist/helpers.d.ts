/**
 * Standard success response for MCP tools.
 */
export declare function ok(data: unknown): {
    content: Array<{
        type: "text";
        text: string;
    }>;
};
/**
 * Standard error response for MCP tools.
 */
export declare function err(error: unknown): {
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError: true;
};
/**
 * Type helper for tool callback functions - inferred by SDK, provided for documentation.
 */
export type ToolCallback<Args extends Record<string, unknown>> = (args: Args) => Promise<ReturnType<typeof ok> | ReturnType<typeof err>>;
