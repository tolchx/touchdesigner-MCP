import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
interface PopRule {
    /** What this rule checks */
    name: string;
    /** Severity: 'error' blocks execution, 'warning' is advisory */
    severity: "error" | "warning";
    /** Human-readable description of the rule */
    description: string;
    /** Suggested fix when the rule is violated */
    fix: string;
}
/** Rules indexed by POP opType */
export declare const POP_RULES: Record<string, PopRule[]>;
export declare const INVALID_CROSS_FAMILY: Record<string, string[]>;
export declare const VALID_BRIDGES: Record<string, string>;
export declare const ATTRIBUTE_RULES: Record<string, string[]>;
/**
 * Build Python code to detect all POP operators in a network and return
 * their types, connections, and parameter states.
 */
export declare function buildPopScanCode(rootPath: string): string;
/**
 * Build Python code to validate cross-family connections.
 */
export declare function buildCrossFamilyCheckCode(rootPath: string): string;
export declare function registerPopValidationTools(server: McpServer, client: TDClient): void;
export {};
