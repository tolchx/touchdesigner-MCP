import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Standard success response for MCP tools.
 */
export function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Standard error response for MCP tools.
 */
export function err(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error);
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/**
 * Type helper for tool callback functions - inferred by SDK, provided for documentation.
 */
export type ToolCallback<Args extends Record<string, unknown>> = (
  args: Args
) => Promise<ReturnType<typeof ok> | ReturnType<typeof err>>;
