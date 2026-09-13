/**
 * td_import_toe_dir — Rebuild a TouchDesigner network from an expanded
 * Toe_Expand .toe.dir (plain-text dump), with per-node verification
 * against the dump.
 *
 * Method (verified live on TD 2025.32460, see docs/TOE_REPLICATION.md):
 *   1. Parse `<scope>/*.n` (type, tile position, inputs) and `<scope>/*.parm`
 *      (values; the real value is the LAST column of each line).
 *   2. Generate ONE /exec Python script that creates the container, operators,
 *      wires them with the verified recipe (`src.outputConnectors[0].connect(dst)`),
 *      sets parameters defensively (missing params → drift log, never fail),
 *      then cooks every node and returns per-node verification JSON.
 *      Per-node fault tolerance: unknown/uncreatable dump types land in
 *      `unsupported` and wire failures in `wire_errors` — the rest of the
 *      network is still built and verified (evidence run 2026-09-12).
 *   3. The tool compares TD's verification report against the dump and
 *      returns a per-node match table.
 *
 * Parsing notes from the real corpus:
 *   - `.n` header line is `FAMILY:type` (e.g. `POP:grid`, `TOP:noise`).
 *   - `.n` tile line: `tile x y w h` → nodeX/nodeY.
 *   - `.n` inputs block: `N\t<name>` lines between `inputs\n{` and `}`.
 *   - `.parm` lines: `name <state> <value>` separated by `?` blocks. The
 *     trailing integer is dump state, NOT the value (e.g. `pt1posx 67108928 10`
 *     → value 10). Toggles serialize like `cpureadback 0 on` → value `on`.
 *   - Param names can be stale vs the live build (Facet's `pt1pos*` does not
 *     exist on 2025.32460 linePOP) — setting is always defensive.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
export interface ToeNode {
    /** relative name inside the scope, e.g. "grid1" */
    name: string;
    /** dump type token, e.g. "POP:grid" */
    rawType: string;
    /** e.g. "POP" */
    family: string;
    /** e.g. "grid" */
    opType: string;
    nodeX: number;
    nodeY: number;
    /** ordered input names from the inputs{} block */
    inputs: string[];
    /** display flag from the flags line */
    display: boolean;
    /** parsed params from the .parm file: name → raw string value */
    params: Record<string, string>;
}
export interface ToeDump {
    scope: string;
    nodes: ToeNode[];
    /** wires resolved from inputs: [source, target, inputIndex] */
    wires: Array<[string, string, number]>;
}
/** Parse one `.n` file body into node info (without params). */
export declare function parseNFile(content: string, name: string): ToeNode | null;
/**
 * Parse a `.parm` file: blocks separated by `?` lines, each real line is
 * `name <state> <value>`. The real value is the LAST column (dump state
 * integer is in the middle and is not a value).
 */
export declare function parseParmFile(content: string): Record<string, string>;
/** Convert dump type token to a TD Python class name, e.g. "POP:grid" → "gridPOP". */
export declare function dumpTypeToPyClass(rawType: string): string | null;
/**
 * Build the full dump for one scope directory of a .toe.dir.
 * `scopeDir` is e.g. `<project>.toe.dir/project1`.
 */
export declare function parseToeDirScope(scopeDir: string): ToeDump;
export declare function buildImportCode(dump: ToeDump, containerName: string, parentPath: string): string;
export interface NodeCheck {
    node: string;
    checks: {
        present: boolean;
        type: boolean;
        position: boolean;
        inputs: boolean;
        clean: boolean;
    };
    geometry: {
        numPoints: number | null;
        numPrims: number | null;
    };
    errors: string;
}
/** Compare TD's per-node verification payload against the dump. Pure function. */
export declare function verifyAgainstDump(dump: ToeDump, verification: Record<string, any>): {
    checks: NodeCheck[];
    allOk: boolean;
    geometrySignature: Record<string, {
        numPoints: number | null;
        numPrims: number | null;
    }>;
};
export declare function registerToeImportTools(server: McpServer, client: TDClient): void;
