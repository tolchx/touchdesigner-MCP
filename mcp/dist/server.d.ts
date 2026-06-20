import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TDClient } from "td-api";
/**
 * Create a fully configured TouchDesigner MCP server with all tools registered.
 */
export declare function createTouchDesignerMcpServer(client?: TDClient): Promise<McpServer>;
/**
 * Create a fully configured TouchDesigner MCP server with connection health
 * validation and a td://status resource for offline/online mode detection.
 *
 * The `isConnected` check runs before constructing the server so the result is
 * captured eagerly.  The exposed `td://status` resource returns
 * { connected, baseUrl } which clients can read to determine the
 * online/offline mode.
 */
export declare function createTouchDesignerMcpServerWithStatus(client?: TDClient): Promise<McpServer>;
