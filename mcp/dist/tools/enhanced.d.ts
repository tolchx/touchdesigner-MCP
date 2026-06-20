/**
 * Enhanced Tools Registration
 *
 * Registers all tools migrated from the 7 repos analyzed:
 *  - Network templates (bottobot)
 *  - Natural language type resolution (superdwayne)
 *  - Builder recipes (mrinalghosh)
 *  - Knowledge brain FTS5 (TDPilot)
 *  - Presenter/formatter (8beeeaaat)
 *  - Catalog manager (Embody)
 *
 * These are registered ON TOP of the existing 69 tools for a total of ~82+ tools.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
export declare function registerEnhancedTools(server: McpServer, client: TDClient): Promise<void>;
