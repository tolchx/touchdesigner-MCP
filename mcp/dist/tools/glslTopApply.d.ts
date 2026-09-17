import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * GLSL TOP write path (docs/GLSL_TOP_RULES.md, item 31):
 *   - td_glsl_top_analyze: pure static check against the live-verified TOP
 *     rules (T1 fragColor, T2 vUV swizzles, T4 vec0/const0 uniforms) —
 *     no TD round-trip.
 *   - td_glsl_top_recipe: build one of the 7 verified BoS-derived recipes
 *     via a single /exec, pre-validated through the same safety net.
 */
export declare function registerGlslTopTools(server: McpServer, client: TDClient): void;
