/**
 * WebToe MCP — Bridge between our TouchDesigner research and the WebToe engine.
 *
 * Generates OpSpec definitions, .webtoe.json networks, and imports for WebToe.
 * Leverages the full research corpus: 96 projects, 31,610 operators, POP topology,
 * GLSL contracts, parameter schemas, connection patterns.
 *
 * Tools:
 *   wt_generate_op  — Generate OpSpec + shader for any TD operator (fills WebToe gaps)
 *   wt_build_network — Natural language → .webtoe.json network graph
 *   wt_import_toe   — Convert Toe_Expand real projects → .webtoe.json
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
export declare function registerWebtoeTools(server: McpServer, client: TDClient): void;
