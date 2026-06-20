/**
 * Command Runner — Routes natural language commands to TouchDesigner tools.
 *
 * Uses an LLM to translate a user prompt into a tool call, executes it
 * against the live TD API, and returns results with latency metrics.
 */
import type { TDClient } from "td-api";
export interface LlmClient {
    generateText(input: {
        system: string;
        user: string;
    }): Promise<{
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
export declare const TOOL_METHOD_MAP: Record<string, string>;
export declare const SUPPORTED_TOOLS: string[];
/**
 * Parse LLM output to extract the first valid JSON tool call.
 * Handles extra text around the JSON (common with some models).
 */
export declare function parseToolCall(text: string): ToolCall | null;
/**
 * Run a natural language command through LLM → tool → TD execution.
 */
export declare function runNaturalLanguageCommand(client: TDClient, llm: LlmClient, prompt: string): Promise<CommandResult>;
