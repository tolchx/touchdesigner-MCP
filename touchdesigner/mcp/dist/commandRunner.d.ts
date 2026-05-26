import { z } from "zod";
import { TDClient } from "td-api";
import type { LlmClient } from "./llm.js";
declare const ToolCallSchema: z.ZodObject<{
    tool: z.ZodEnum<["td_execute", "td_pane", "td_selection", "td_operators", "td_pars_get", "td_pars_set", "td_connections", "td_find", "td_pops_query", "td_ops_query", "td_templates_query", "td_alias_resolve", "td_network_plan", "td_healthcheck"]>;
    args: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    tool: "td_pane" | "td_execute" | "td_selection" | "td_operators" | "td_pars_get" | "td_pars_set" | "td_connections" | "td_find" | "td_pops_query" | "td_ops_query" | "td_templates_query" | "td_alias_resolve" | "td_network_plan" | "td_healthcheck";
    args: Record<string, unknown>;
}, {
    tool: "td_pane" | "td_execute" | "td_selection" | "td_operators" | "td_pars_get" | "td_pars_set" | "td_connections" | "td_find" | "td_pops_query" | "td_ops_query" | "td_templates_query" | "td_alias_resolve" | "td_network_plan" | "td_healthcheck";
    args?: Record<string, unknown> | undefined;
}>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export interface RunCommandResult {
    toolCall: ToolCall;
    llm: {
        provider: string;
        model: string;
        latencyMs: number;
    };
    tdLatencyMs: number;
    tdResult: unknown;
}
export declare function runNaturalLanguageCommand(options: {
    llm: LlmClient;
    td: TDClient;
    command: string;
}): Promise<RunCommandResult>;
export {};
