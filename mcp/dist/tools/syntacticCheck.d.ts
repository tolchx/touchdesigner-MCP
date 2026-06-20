import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
/**
 * Validate Python code for common TD issues before sending to TD.
 * Checks: bare math functions, missing imports, common NameErrors, path safety.
 */
export declare function validatePythonSyntax(code: string): {
    passed: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * Validate TD operator paths for safety and correctness.
 */
export declare function validatePathSafety(paths: string[]): {
    passed: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * Validate JSON strings for structural integrity before parsing.
 */
export declare function validateJsonIntegrity(jsonStrings: string[]): {
    passed: boolean;
    errors: string[];
    warnings: string[];
};
/**
 * Validate cross-family connections from a code string.
 * Looks for operator.create() or .inputConnectors patterns that suggest
 * cross-family wiring.
 */
export declare function validateCrossFamilyConnections(code: string): {
    passed: boolean;
    errors: string[];
    warnings: string[];
};
export declare function registerSyntacticCheckTools(server: McpServer, client: TDClient): void;
