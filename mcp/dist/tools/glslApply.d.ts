import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * Safe GLSL POP write path (docs/GLSL_POP_RULES.md):
 *   - td_glsl_analyze: pure static check (R1-R4) — no TD round-trip.
 *   - td_glsl_apply:   pre-validate → create with auto Create Attributes (R3),
 *     auto readwrite (R4), cook, and return the infoDAT compiler log on
 *     failure (R5) instead of a bare "Compile failed".
 */
export declare function registerGlslApplyTools(server: McpServer, client: TDClient): void;
