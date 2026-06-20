/**
 * Presenter — Token-Optimized Output Formatter
 *
 * Every MCP tool can use this layer to control response verbosity
 * and format, reducing token burn while keeping data actionable.
 *
 * detailLevel:  "minimal" | "summary" | "detailed"
 * responseFormat: "json" | "markdown" | "text"
 *
 *   Minimal   — IDs / names / paths only (fast scanning)
 *   Summary   — Key fields: name, type, status, short desc
 *   Detailed  — Everything, full fidelity
 *
 *   JSON      — Raw structured data (machine-friendly)
 *   Markdown  — Tables with headers (human-friendly, compact)
 *   Text      — Bullet points (plain-text logs / narrow UIs)
 */
export type DetailLevel = "minimal" | "summary" | "detailed";
export type ResponseFormat = "json" | "markdown" | "text";
export interface PresenterOptions {
    detailLevel: DetailLevel;
    responseFormat: ResponseFormat;
}
export interface OperatorInfo {
    name: string;
    path: string;
    type: string;
    opType?: string;
    family?: string;
    flags?: Record<string, boolean>;
    [key: string]: unknown;
}
export interface ParameterInfo {
    name: string;
    label?: string;
    val: unknown;
    expr?: string | null;
    mode?: string;
    style?: string;
    default?: unknown;
    page?: string;
    [key: string]: unknown;
}
export interface ErrorInfo {
    path: string;
    severity: "error" | "warning" | "info";
    message: string;
    source?: string;
    [key: string]: unknown;
}
export interface ConnectionInfo {
    /** Source operator path */
    fromOp: string;
    /** Source output connector index or name */
    fromOutput: string | number;
    /** Target operator path */
    toOp: string;
    /** Target input connector index or name */
    toInput: string | number;
    [key: string]: unknown;
}
export interface GraphNode {
    path: string;
    name: string;
    type: string;
    family?: string;
    [key: string]: unknown;
}
export interface GraphEdge {
    from: string;
    to: string;
    fromOutput?: string | number;
    toInput?: string | number;
    [key: string]: unknown;
}
export interface NetworkGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
    [key: string]: unknown;
}
/**
 * Format any data payload according to detailLevel and responseFormat.
 *
 * Types auto-detected or explicitly specified via optional `shape` param:
 *   "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"
 *
 * When `shape` is omitted, JSON serialisation is used for Markdown/Text output.
 */
export declare function formatResponse(data: unknown, options: PresenterOptions, shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"): string;
export declare function formatOperatorList(ops: OperatorInfo[], options: PresenterOptions): string;
export declare function formatParameterList(params: ParameterInfo[], options: PresenterOptions): string;
/**
 * Format a list of TD errors/warnings.
 * Minimal: path + severity.  Summary: + message.  Detailed: + source.
 * Uses a custom text format with severity badges.
 */
export declare function formatErrorList(errors: ErrorInfo[], options: PresenterOptions): string;
export declare function formatConnectionList(connections: ConnectionInfo[], options: PresenterOptions): string;
/**
 * Format a network graph (nodes + edges).
 * Minimal: node list.  Summary: nodes + edge count.  Detailed: full graph.
 */
export declare function formatNetworkGraph(graph: NetworkGraph, options: PresenterOptions): string;
/** Minimal JSON — machine-friendly summary, least tokens. */
export declare function minimalJson(data: unknown, shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"): string;
/** Summary Markdown — human-friendly tables, moderate tokens. */
export declare function summaryMarkdown(data: unknown, shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"): string;
/** Detailed JSON — full fidelity, inspect everything. */
export declare function detailedJson(data: unknown, shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"): string;
/** Detailed Text — bullet-point dump, good for logs. */
export declare function detailedText(data: unknown, shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"): string;
