import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * Record a change in the history log.
 * Called internally by tools that modify operators.
 */
export declare function recordChange(client: TDClient, path: string, action: string): Promise<void>;
export declare function registerHistoryTools(server: McpServer, client: TDClient): void;
