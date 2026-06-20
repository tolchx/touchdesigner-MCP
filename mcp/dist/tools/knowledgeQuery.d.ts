import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * Register the td_knowledge_query tool.
 */
export declare function registerKnowledgeQueryTool(server: McpServer, client: TDClient): void;
