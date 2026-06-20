/**
 * Standard success response for MCP tools.
 */
export function ok(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
/**
 * Standard error response for MCP tools.
 */
export function err(error) {
    const message = typeof error === "string"
        ? error
        : error instanceof Error
            ? error.message
            : JSON.stringify(error);
    return {
        content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
        isError: true,
    };
}
