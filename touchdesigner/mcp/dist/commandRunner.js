import { z } from "zod";
import { queryPops } from "./popsDb.js";
import { TdFamilySchema, queryOps } from "./opsDb.js";
import { queryTemplates } from "./templatesDb.js";
import { resolveSemanticTerms } from "./semantic.js";
import { createNetworkPlan } from "./networkPlanner.js";
const ToolCallSchema = z.object({
    tool: z.enum([
        "td_execute",
        "td_pane",
        "td_selection",
        "td_operators",
        "td_pars_get",
        "td_pars_set",
        "td_connections",
        "td_find",
        "td_pops_query",
        "td_ops_query",
        "td_templates_query",
        "td_alias_resolve",
        "td_network_plan",
        "td_healthcheck",
    ]),
    args: z.record(z.unknown()).default({}),
});
function nowMs() {
    return performance.now();
}
function extractFirstJsonObject(text) {
    const firstBrace = text.indexOf("{");
    if (firstBrace === -1) {
        throw new Error("Model output did not contain a JSON object");
    }
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let index = firstBrace; index < text.length; index += 1) {
        const char = text[index];
        if (inString) {
            if (escaping) {
                escaping = false;
            }
            else if (char === "\\") {
                escaping = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === "{")
            depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return JSON.parse(text.slice(firstBrace, index + 1));
            }
        }
    }
    throw new Error("Model output did not contain a complete JSON object");
}
export async function runNaturalLanguageCommand(options) {
    const system = [
        "You are a router that translates a user request into one TouchDesigner tool call.",
        "Return ONLY a single JSON object, no markdown, no extra text.",
        'Schema: {"tool":"td_execute|td_pane|td_selection|td_operators|td_pars_get|td_pars_set|td_connections|td_find|td_pops_query|td_ops_query|td_templates_query|td_alias_resolve|td_network_plan|td_healthcheck","args":{...}}',
        "When you need to create or modify operators, use td_execute and provide Python code in args.code.",
        "Prefer td_pane/td_selection/td_operators/td_pars_get/td_connections/td_find when the user is asking to inspect state.",
        "Use td_pops_query to look up POP operator technical details before writing code.",
        "Use td_ops_query to look up TOP/CHOP/SOP/DAT operator details before writing code.",
        "Use td_templates_query to find reusable patterns in local project documentation.",
        "Use td_alias_resolve to normalize prompt concepts like feedback loop, size, life, cd or direction.",
        "Use td_network_plan for dry-run planning or prompt-driven skeleton generation.",
        "Use td_healthcheck when validating or debugging a network is the main goal.",
    ].join("\n");
    const llmResp = await options.llm.generateText({
        system,
        user: options.command,
    });
    const parsed = ToolCallSchema.parse(extractFirstJsonObject(llmResp.text));
    const tdStart = nowMs();
    let tdResult;
    let tdLatencyMs = 0;
    if (parsed.tool === "td_execute") {
        const args = z.object({ code: z.string(), from_op: z.string().optional() }).parse(parsed.args);
        tdResult = await options.td.execute(args.code, args.from_op ?? "/");
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_pane") {
        tdResult = await options.td.getPaneState();
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_selection") {
        tdResult = await options.td.getSelection();
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_operators") {
        const args = z.object({ path: z.string().optional() }).parse(parsed.args);
        tdResult = await options.td.getOperators(args.path ?? "/");
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_pars_get") {
        const args = z.object({ path: z.string(), names: z.array(z.string()).optional() }).parse(parsed.args);
        tdResult = await options.td.getParameters(args.path, args.names);
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_pars_set") {
        const args = z
            .object({
            path: z.string(),
            transactional: z.boolean().optional(),
            updates: z.array(z.object({ name: z.string(), value: z.unknown().optional(), expr: z.string().nullable().optional() })),
        })
            .parse(parsed.args);
        tdResult = await options.td.setParameters(args.path, args.updates, args.transactional ?? true);
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_connections") {
        const args = z.object({ path: z.string(), recurse: z.boolean().optional() }).parse(parsed.args);
        tdResult = await options.td.getConnections(args.path, args.recurse ?? false);
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_find") {
        const args = z
            .object({
            path: z.string().optional(),
            query: z.string().optional(),
            name: z.string().optional(),
            family: z.string().optional(),
            opType: z.string().optional(),
            recursive: z.boolean().optional(),
            limit: z.number().int().min(1).max(200).optional(),
        })
            .parse(parsed.args);
        tdResult = await options.td.findOperators(args);
        tdLatencyMs = nowMs() - tdStart;
    }
    else if (parsed.tool === "td_pops_query") {
        const args = z
            .object({
            search: z.string().optional(),
            page_slug: z.string().optional(),
            limit: z.number().int().min(1).max(50).optional(),
        })
            .parse(parsed.args);
        tdResult = await queryPops({ search: args.search, pageSlug: args.page_slug, limit: args.limit });
        tdLatencyMs = 0;
    }
    else if (parsed.tool === "td_ops_query") {
        const args = z
            .object({
            search: z.string().optional(),
            family: TdFamilySchema.optional(),
            page_slug: z.string().optional(),
            limit: z.number().int().min(1).max(50).optional(),
        })
            .parse(parsed.args);
        tdResult = await queryOps({ search: args.search, family: args.family, pageSlug: args.page_slug, limit: args.limit });
        tdLatencyMs = 0;
    }
    else if (parsed.tool === "td_templates_query") {
        const args = z.object({ search: z.string(), project: z.string().optional(), limit: z.number().int().min(1).max(50).optional() }).parse(parsed.args);
        tdResult = await queryTemplates(args);
        tdLatencyMs = 0;
    }
    else if (parsed.tool === "td_alias_resolve") {
        const args = z.object({ text: z.string() }).parse(parsed.args);
        tdResult = resolveSemanticTerms(args.text);
        tdLatencyMs = 0;
    }
    else if (parsed.tool === "td_network_plan") {
        const args = z
            .object({
            prompt: z.string(),
            target_path: z.string().optional(),
            container_name: z.string().optional(),
            apply: z.boolean().optional(),
        })
            .parse(parsed.args);
        tdResult = await createNetworkPlan({
            td: options.td,
            prompt: args.prompt,
            targetPath: args.target_path,
            containerName: args.container_name,
            apply: args.apply ?? false,
        });
        tdLatencyMs = nowMs() - tdStart;
    }
    else {
        const args = z.object({ path: z.string(), recurse: z.boolean().optional() }).parse(parsed.args);
        tdResult = await options.td.healthcheck(args.path, args.recurse ?? true);
        tdLatencyMs = nowMs() - tdStart;
    }
    return {
        toolCall: parsed,
        llm: {
            provider: llmResp.provider,
            model: llmResp.model,
            latencyMs: llmResp.latencyMs,
        },
        tdLatencyMs,
        tdResult,
    };
}
