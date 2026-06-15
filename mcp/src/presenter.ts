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

// ─── Types ──────────────────────────────────────────────────────────────────

export type DetailLevel = "minimal" | "summary" | "detailed";
export type ResponseFormat = "json" | "markdown" | "text";

export interface PresenterOptions {
  detailLevel: DetailLevel;
  responseFormat: ResponseFormat;
}

// ─── Operator types (inferred from TD API / client shapes) ──────────────────

export interface OperatorInfo {
  name: string;
  path: string;
  type: string;        // e.g. "constantTOP"
  opType?: string;      // alias for type in some contexts
  family?: string;      // TOP, CHOP, SOP, DAT, POP, COMP, MAT
  flags?: Record<string, boolean>;
  [key: string]: unknown;
}

export interface ParameterInfo {
  name: string;
  label?: string;
  val: unknown;
  expr?: string | null;
  mode?: string;       // CONSTANT, EXPRESSION, etc.
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

// ─── Field selectors ────────────────────────────────────────────────────────

/** Fields included at each detail level. */
const DETAILED_OP_FIELDS: (keyof OperatorInfo)[] = [
  "name", "path", "type", "opType", "family", "flags",
];

const SUMMARY_OP_FIELDS: (keyof OperatorInfo)[] = [
  "name", "path", "type", "family",
];

const MINIMAL_OP_FIELDS: (keyof OperatorInfo)[] = [
  "name", "path",
];

const DETAILED_PARAM_FIELDS: (keyof ParameterInfo)[] = [
  "name", "label", "val", "expr", "mode", "style", "default", "page",
];

const SUMMARY_PARAM_FIELDS: (keyof ParameterInfo)[] = [
  "name", "val", "expr",
];

const MINIMAL_PARAM_FIELDS: (keyof ParameterInfo)[] = [
  "name",
];

const DETAILED_ERROR_FIELDS: (keyof ErrorInfo)[] = [
  "path", "severity", "message", "source",
];

const SUMMARY_ERROR_FIELDS: (keyof ErrorInfo)[] = [
  "path", "severity", "message",
];

const MINIMAL_ERROR_FIELDS: (keyof ErrorInfo)[] = [
  "path", "severity",
];

const DETAILED_CONN_FIELDS: (keyof ConnectionInfo)[] = [
  "fromOp", "fromOutput", "toOp", "toInput",
];

const SUMMARY_CONN_FIELDS: (keyof ConnectionInfo)[] = [
  "fromOp", "toOp",
];

const MINIMAL_CONN_FIELDS: (keyof ConnectionInfo)[] = [
  "fromOp", "toOp",
];

// ─── Pick helper ────────────────────────────────────────────────────────────

function pick<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[],
): Partial<T> {
  const result: Partial<T> = {};
  for (const f of fields) {
    if (f in obj) {
      result[f] = obj[f];
    }
  }
  return result;
}

// ─── Main formatter ─────────────────────────────────────────────────────────

/**
 * Format any data payload according to detailLevel and responseFormat.
 *
 * Types auto-detected or explicitly specified via optional `shape` param:
 *   "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph"
 *
 * When `shape` is omitted, JSON serialisation is used for Markdown/Text output.
 */
export function formatResponse(
  data: unknown,
  options: PresenterOptions,
  shape?: "operatorList" | "parameterList" | "errorList" | "connectionList" | "graph",
): string {
  const { detailLevel, responseFormat } = options;

  // If data is already a string (e.g. a pre-formatted message), return as-is
  if (typeof data === "string") {
    if (responseFormat === "json") {
      return JSON.stringify({ message: data });
    }
    return data;
  }

  // Dispatch to specialised formatters
  switch (shape) {
    case "operatorList":
      return formatOperatorList(data as OperatorInfo[], options);
    case "parameterList":
      return formatParameterList(data as ParameterInfo[], options);
    case "errorList":
      return formatErrorList(data as ErrorInfo[], options);
    case "connectionList":
      return formatConnectionList(data as ConnectionInfo[], options);
    case "graph":
      return formatNetworkGraph(data as NetworkGraph, options);
    default:
      return formatGeneric(data, options);
  }
}

// ─── Generic fallback formatter ─────────────────────────────────────────────

function formatGeneric(data: unknown, options: PresenterOptions): string {
  const { responseFormat } = options;

  switch (responseFormat) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "markdown":
      return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
    case "text":
      return JSON.stringify(data, null, 2);
  }
}

// ─── Operator list formatter ────────────────────────────────────────────────

/**
 * Format a list of TD operators.
 * Minimal: name + path only.  Summary: + type + family.  Detailed: + flags + all fields.
 */
export function formatOperatorList(
  ops: OperatorInfo[],
  options: PresenterOptions,
): string {
  const { detailLevel, responseFormat } = options;

  if (!Array.isArray(ops) || ops.length === 0) {
    return responseFormat === "json"
      ? "[]"
      : responseFormat === "markdown"
        ? "*(no operators)*"
        : "(no operators)";
  }

  // Select fields per level
  const fields: (keyof OperatorInfo)[] =
    detailLevel === "minimal"
      ? MINIMAL_OP_FIELDS
      : detailLevel === "summary"
        ? SUMMARY_OP_FIELDS
        : DETAILED_OP_FIELDS;

  const rows = ops.map((op) => pick(op, fields));

  switch (responseFormat) {
    case "json":
      return JSON.stringify(rows, null, 2);

    case "markdown":
      return formatAsMarkdownTable(rows, fields as string[]);

    case "text":
      return formatAsBulletList(rows, fields as string[], (item) =>
        item.name ? `${item.name} (${item.path ?? "?"})` : item.path ?? "?",
      );

    default:
      return JSON.stringify(rows, null, 2);
  }
}

// ─── Parameter list formatter ───────────────────────────────────────────────

/**
 * Format a list of parameters.
 * Minimal: name only.  Summary: + val + expr.  Detailed: + label, mode, style, etc.
 */
export function formatParameterList(
  params: ParameterInfo[],
  options: PresenterOptions,
): string {
  const { detailLevel, responseFormat } = options;

  if (!Array.isArray(params) || params.length === 0) {
    return responseFormat === "json"
      ? "[]"
      : responseFormat === "markdown"
        ? "*(no parameters)*"
        : "(no parameters)";
  }

  const fields: (keyof ParameterInfo)[] =
    detailLevel === "minimal"
      ? MINIMAL_PARAM_FIELDS
      : detailLevel === "summary"
        ? SUMMARY_PARAM_FIELDS
        : DETAILED_PARAM_FIELDS;

  const rows = params.map((p) => pick(p, fields));

  switch (responseFormat) {
    case "json":
      return JSON.stringify(rows, null, 2);

    case "markdown":
      return formatAsMarkdownTable(rows, fields as string[]);

    case "text":
      return formatAsBulletList(rows, fields as string[], (item) => {
        const parts: string[] = [String(item.name ?? "?")];
        if (item.val !== undefined) parts.push(`= ${item.val}`);
        if (item.expr) parts.push(`[expr: ${item.expr}]`);
        return parts.join(" ");
      });

    default:
      return JSON.stringify(rows, null, 2);
  }
}

// ─── Error list formatter ───────────────────────────────────────────────────

/**
 * Format a list of TD errors/warnings.
 * Minimal: path + severity.  Summary: + message.  Detailed: + source.
 */
export function formatErrorList(
  errors: ErrorInfo[],
  options: PresenterOptions,
): string {
  const { detailLevel, responseFormat } = options;

  if (!Array.isArray(errors) || errors.length === 0) {
    return responseFormat === "json"
      ? "[]"
      : responseFormat === "markdown"
        ? "*(no errors)*"
        : "(no errors)";
  }

  const fields: (keyof ErrorInfo)[] =
    detailLevel === "minimal"
      ? MINIMAL_ERROR_FIELDS
      : detailLevel === "summary"
        ? SUMMARY_ERROR_FIELDS
        : DETAILED_ERROR_FIELDS;

  const rows = errors.map((e) => pick(e, fields));

  switch (responseFormat) {
    case "json":
      return JSON.stringify(rows, null, 2);

    case "markdown":
      return formatAsMarkdownTable(rows, fields as string[]);

    case "text": {
      const lines = rows.map((e) => {
        const sev = (e.severity ?? "?").toUpperCase().padEnd(7);
        return `  [${sev}] ${e.path ?? "?"}: ${e.message ?? "(no message)"}`;
      });
      const total = `${rows.length} error${rows.length === 1 ? "" : "s"}`;
      return `${total}\n${lines.join("\n")}`;
    }

    default:
      return JSON.stringify(rows, null, 2);
  }
}

// ─── Connection list formatter ──────────────────────────────────────────────

/**
 * Format a list of connections (wires).
 * Minimal/Summary: fromOp → toOp.  Detailed: + fromOutput, toInput.
 */
export function formatConnectionList(
  connections: ConnectionInfo[],
  options: PresenterOptions,
): string {
  const { detailLevel, responseFormat } = options;

  if (!Array.isArray(connections) || connections.length === 0) {
    return responseFormat === "json"
      ? "[]"
      : responseFormat === "markdown"
        ? "*(no connections)*"
        : "(no connections)";
  }

  const fields: (keyof ConnectionInfo)[] =
    detailLevel === "minimal" || detailLevel === "summary"
      ? MINIMAL_CONN_FIELDS
      : DETAILED_CONN_FIELDS;

  const rows = connections.map((c) => pick(c, fields));

  switch (responseFormat) {
    case "json":
      return JSON.stringify(rows, null, 2);

    case "markdown":
      return formatAsMarkdownTable(rows, fields as string[]);

    case "text":
      return formatAsBulletList(rows, fields as string[], (item) => {
        if (detailLevel === "detailed") {
          return `${item.fromOp ?? "?"}:${item.fromOutput ?? "?"} → ${item.toOp ?? "?"}:${item.toInput ?? "?"}`;
        }
        return `${item.fromOp ?? "?"} → ${item.toOp ?? "?"}`;
      });

    default:
      return JSON.stringify(rows, null, 2);
  }
}

// ─── Network graph formatter ────────────────────────────────────────────────

/**
 * Format a network graph (nodes + edges).
 * Minimal: node list.  Summary: nodes + edge count.  Detailed: full graph.
 */
export function formatNetworkGraph(
  graph: NetworkGraph,
  options: PresenterOptions,
): string {
  const { detailLevel, responseFormat } = options;

  if (!graph || (!graph.nodes?.length && !graph.edges?.length)) {
    return responseFormat === "json"
      ? "{}"
      : responseFormat === "markdown"
        ? "*(empty graph)*"
        : "(empty graph)";
  }

  const nodeList = graph.nodes ?? [];
  const edgeList = graph.edges ?? [];

  switch (responseFormat) {
    case "json":
      return JSON.stringify(graph, null, 2);

    case "markdown": {
      let md = `**Nodes:** ${nodeList.length}  |  **Edges:** ${edgeList.length}\n\n`;

      if (nodeList.length > 0) {
        md += "| # | Name | Path | Type |\n";
        md += "|---|------|------|------|\n";
        for (let i = 0; i < nodeList.length; i++) {
          const n = nodeList[i];
          md += `| ${i + 1} | ${n.name ?? "?"} | ${n.path ?? "?"} | ${n.type ?? "?"} |\n`;
        }
      }

      if (detailLevel !== "minimal" && edgeList.length > 0) {
        md += "\n**Connections:**\n\n";
        md += "| From | → | To |\n";
        md += "|------|---|----|\n";
        for (const e of edgeList) {
          md += `| ${e.from ?? "?"} | → | ${e.to ?? "?"} |\n`;
        }
      }

      return md.trim();
    }

    case "text": {
      const lines: string[] = [];
      let label = "Nodes";

      if (detailLevel === "minimal") {
        label = "Operators";
      }

      lines.push(`${label}: ${nodeList.length}, Edges: ${edgeList.length}`);
      if (nodeList.length > 0) {
        for (const n of nodeList) {
          lines.push(`  • ${n.name ?? "?"} (${n.path ?? "?"}) [${n.type ?? "?"}]`);
        }
      }
      if (detailLevel !== "minimal" && edgeList.length > 0) {
        lines.push("");
        lines.push("Connections:");
        for (const e of edgeList) {
          lines.push(`  • ${e.from ?? "?"} → ${e.to ?? "?"}`);
        }
      }
      return lines.join("\n");
    }

    default:
      return JSON.stringify(graph, null, 2);
  }
}

// ─── Utility: Markdown table builder ────────────────────────────────────────

function formatAsMarkdownTable(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  if (rows.length === 0) return "*(empty)*";

  // Build header
  let md = "| " + columns.map((c) => formatMarkdownCell(c)).join(" | ") + " |\n";
  md += "|" + columns.map(() => "---").join("|") + "|\n";

  // Build rows
  for (const row of rows) {
    const cells = columns.map((c) => {
      const val = row[c];
      return formatMarkdownCell(val);
    });
    md += "| " + cells.join(" | ") + " |\n";
  }

  return md.trim();
}

function formatMarkdownCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "…"; // collapse nested objects
  const s = String(value);
  // Escape pipe characters in cell content
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ─── Utility: Bullet-list builder ───────────────────────────────────────────

function formatAsBulletList<T extends Record<string, unknown>>(
  items: T[],
  fields: string[],
  headingFn: (item: T) => string,
): string {
  if (items.length === 0) return "(none)";

  const lines: string[] = [];

  for (const item of items) {
    lines.push(`• ${headingFn(item)}`);
    // Append remaining fields as indented sub-items
    for (const f of fields) {
      if (f === "name" || f === "path") continue; // already in heading
      const val = item[f];
      if (val !== undefined && val !== null) {
        lines.push(`    ${f}: ${formatMarkdownCell(val)}`);
      }
    }
  }

  return lines.join("\n");
}

// ─── Quick convenience exports ──────────────────────────────────────────────

/** Minimal JSON — machine-friendly summary, least tokens. */
export function minimalJson(data: unknown, shape?: string): string {
  return formatResponse(data, { detailLevel: "minimal", responseFormat: "json" }, shape as any);
}

/** Summary Markdown — human-friendly tables, moderate tokens. */
export function summaryMarkdown(data: unknown, shape?: string): string {
  return formatResponse(data, { detailLevel: "summary", responseFormat: "markdown" }, shape as any);
}

/** Detailed JSON — full fidelity, inspect everything. */
export function detailedJson(data: unknown, shape?: string): string {
  return formatResponse(data, { detailLevel: "detailed", responseFormat: "json" }, shape as any);
}

/** Detailed Text — bullet-point dump, good for logs. */
export function detailedText(data: unknown, shape?: string): string {
  return formatResponse(data, { detailLevel: "detailed", responseFormat: "text" }, shape as any);
}
