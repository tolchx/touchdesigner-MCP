/**
 * Command Runner — Routes natural language commands to TouchDesigner tools.
 *
 * Uses an LLM to translate a user prompt into a tool call, executes it
 * against the live TD API, and returns results with latency metrics.
 */
import type { TDClient } from "td-api";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LlmClient {
  generateText(input: { system: string; user: string }): Promise<{
    text: string;
    provider: string;
    model: string;
    latencyMs: number;
  }>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface CommandResult {
  toolCall: ToolCall;
  llm: {
    provider: string;
    model: string;
    latencyMs: number;
    rawResponse: string;
  };
  tdLatencyMs: number;
  tdResult: unknown;
  error?: string;
}

// ─── Tool Name → Method Name Mapping ────────────────────────────────────────
// Maps MCP tool names to TDClient method names for direct invocation.

export const TOOL_METHOD_MAP: Record<string, string> = {
  td_execute: "execute",
  td_pane: "getPaneState",
  td_selection: "getSelection",
  td_operators: "getOperators",
  td_pars_get: "getParameters",
  td_pars_set: "setParameters",
  td_create_operator: "createOperator",
  td_delete_operator: "deleteOperator",
  td_connect_nodes: "connectNodes",
  td_get_errors: "getErrors",
  td_healthcheck: "healthcheck",
  td_find: "findOperators",
  td_connections: "getConnections",
  td_screenshot: "screenshot",
  td_get_param_help: "getHints",
  td_pop_inspect: "popInspect",
  td_snapshot_scene: "snapshotScene",
  td_project_lifecycle: "projectLifecycle",
  td_read_textport: "readTextport",
  td_clear_textport: "clearTextport",
  td_navigate_to: "navigateTo",
  td_read_dat: "readDat",
  td_write_dat: "writeDat",
  td_read_chop: "readChop",
  td_search: "searchInTD",
  td_pulse_param: "pulseParam",
  td_set_operator_pars: "setParameters",
  td_custom_parameters: "customParameters",
  td_reinit_extension: "reinitExtension",
  td_memory_save: "memorySave",
  td_memory_recall: "memoryRecall",
  td_get_info: "getInfo",
  td_get_focus: "getFocus",
  td_get_perf: "getPerf",
  td_get_screenshots: "getScreenshots",
  td_disconnect: "disconnect",
  td_copy_node: "copyNode",
  td_get_node_detail: "getNodeDetail",
  td_get_hints: "getHints",
  td_get_build_compatibility: "getBuildCompatibility",
  td_get_release_delta: "getReleaseDelta",
  td_search_official_docs: "searchOfficialDocs",
};

export const SUPPORTED_TOOLS = Object.keys(TOOL_METHOD_MAP).concat([
  "td_pops_query",
  "td_ops_query",
  "td_alias_resolve",
  "td_network_plan",
  "td_templates_query",
  "td_search_official_docs",
  "td_get_build_compatibility",
  "td_get_release_delta",
  "td_get_node_detail",
  "td_get_hints",
  "td_pop_inspect",
  "tool_batch",
]);

const SYSTEM_PROMPT = `You are a TouchDesigner MCP assistant. Translate a user's natural language request into one of the following tool calls.

Available tools:
${SUPPORTED_TOOLS.map((t) => `  - ${t}`).join("\n")}

Respond with valid JSON only:
{"tool": "tool_name", "args": {"arg1": "value1", ...}}

Rules:
- For generic questions about an operator, use td_get_param_help
- For Python code execution, use td_execute with the code in the "code" arg
- For listing operators at a path, use td_operators with optional "path" arg
- For getting current state, use td_pane or td_selection (no args needed)
- For POP particle systems, prefer td_pop_inspect
- For errors/warnings, use td_get_errors or td_healthcheck with "path" and "recurse"
- For knowledge queries, use td_pops_query, td_ops_query, or td_alias_resolve
- For multiple operations, use tool_batch

Respond with ONLY valid JSON. No explanation.`;

// ─── Main ───────────────────────────────────────────────────────────────────

/**
 * Parse LLM output to extract the first valid JSON tool call.
 * Handles extra text around the JSON (common with some models).
 */
export function parseToolCall(text: string): ToolCall | null {
  // Try direct parse first
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed.tool === "string") {
      return { tool: parsed.tool, args: parsed.args ?? {} };
    }
  } catch {
    // Fall through to extraction
  }

  // Find JSON by bracket matching (handles extra text)
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.tool === "string") {
            return { tool: parsed.tool, args: parsed.args ?? {} };
          }
        } catch {
          // Continue searching
        }
        start = -1;
      }
    }
  }

  return null;
}

/**
 * Execute a tool call against the TD API.
 * Maps MCP tool names to native TDClient methods via TOOL_METHOD_MAP.
 */
async function executeToolCall(
  client: TDClient,
  toolCall: ToolCall
): Promise<unknown> {
  // Map tool name to method name, or fallback to td_execute
  const methodName = TOOL_METHOD_MAP[toolCall.tool];

  if (!methodName) {
    // Tool has no native method mapping; try direct name fallback
    const method = (client as unknown as Record<string, Function>)[toolCall.tool];
    if (typeof method === "function") {
      return await method.call(client, toolCall.args);
    }
    // Last resort: wrap as Python execution
    return await client.execute(
      `print("Tool ${toolCall.tool} requires MCP server, not direct API call")`,
      "/"
    );
  }

  const method = (client as unknown as Record<string, Function>)[methodName];
  if (typeof method !== "function") {
    throw new Error(
      `Method '${methodName}' not found on TDClient (mapped from tool '${toolCall.tool}')`
    );
  }

  // Handle methods that take named args vs positional args
  if (methodName === "setParameters") {
    // Two different tools map to setParameters: td_pars_set and td_set_operator_pars
    const args = toolCall.args as Record<string, unknown>;
    return await method.call(client, args.path, args.updates, args.transactional ?? true);
  }

  if (methodName === "execute") {
    const args = toolCall.args as Record<string, unknown>;
    return await method.call(client, args.code, args.from_op ?? "/");
  }

  if (methodName === "findOperators") {
    return await method.call(client, toolCall.args);
  }

  if (methodName === "projectLifecycle") {
    const args = toolCall.args as Record<string, unknown>;
    return await method.call(client, args.action, args.path);
  }

  // For all other methods, pass args object directly
  return await method.call(client, toolCall.args);
}

/**
 * Run a natural language command through LLM → tool → TD execution.
 */
export async function runNaturalLanguageCommand(
  client: TDClient,
  llm: LlmClient,
  prompt: string
): Promise<CommandResult> {
  // Step 1: LLM translates prompt to tool call
  const llmStart = performance.now();
  const llmOutput = await llm.generateText({
    system: SYSTEM_PROMPT,
    user: prompt,
  });
  const llmLatency = performance.now() - llmStart;

  // Step 2: Parse the tool call
  const toolCall = parseToolCall(llmOutput.text);
  if (!toolCall) {
    return {
      toolCall: { tool: "unknown", args: {} },
      llm: {
        provider: llmOutput.provider,
        model: llmOutput.model,
        latencyMs: llmLatency,
        rawResponse: llmOutput.text,
      },
      tdLatencyMs: 0,
      tdResult: null,
      error: `Could not parse tool call from LLM response: ${llmOutput.text.substring(0, 200)}`,
    };
  }

  // Step 3: Execute tool call against TD
  const tdStart = performance.now();
  try {
    const tdResult = await executeToolCall(client, toolCall);
    const tdLatency = performance.now() - tdStart;

    return {
      toolCall,
      llm: {
        provider: llmOutput.provider,
        model: llmOutput.model,
        latencyMs: llmLatency,
        rawResponse: llmOutput.text,
      },
      tdLatencyMs: tdLatency,
      tdResult,
    };
  } catch (error: unknown) {
    const tdLatency = performance.now() - tdStart;
    return {
      toolCall,
      llm: {
        provider: llmOutput.provider,
        model: llmOutput.model,
        latencyMs: llmLatency,
        rawResponse: llmOutput.text,
      },
      tdLatencyMs: tdLatency,
      tdResult: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
