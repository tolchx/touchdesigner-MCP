import { z } from "zod";
import { ok, err } from "../helpers.js";
import { planNetworkGraph } from "../networkPlannerGraph.js";
export function registerExecutionTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_execute
    // ---------------------------------------------------------------------------
    server.registerTool("td_execute", {
        title: "Execute Python",
        description: "Execute Python code in TouchDesigner. The code runs in TD's Python environment with access to all TD modules (op, ui, etc.). Use 'me' to reference the context operator specified by from_op.",
        inputSchema: {
            code: z.string().describe("Python code to execute"),
            from_op: z
                .string()
                .optional()
                .describe("Context operator path (default: '/')"),
        },
    }, async ({ code, from_op }) => {
        try {
            const result = await client.execute(code, from_op ?? "/");
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_network_plan — now uses topology-aware graph planner (Level 1)
    // ---------------------------------------------------------------------------
    server.registerTool("td_network_plan", {
        title: "Plan Or Apply Network (Graph-based)",
        description: "Create a topology-aware network plan from a prompt. Understands multi-input nodes, branching, and feedback loops. " +
            "Uses LLM for complex planning with deterministic fallback. " +
            "Connections include proper input indices (not just linear chains).",
        inputSchema: {
            prompt: z.string().describe("Natural language instruction"),
            target_path: z
                .string()
                .optional()
                .describe("Container path where the system should be created"),
            container_name: z
                .string()
                .optional()
                .describe("Name of the generated container"),
            apply: z
                .boolean()
                .optional()
                .describe("Apply the generated plan inside TouchDesigner"),
            use_llm: z
                .boolean()
                .optional()
                .default(true)
                .describe("Use LLM for smarter planning (false = deterministic only)"),
        },
    }, async ({ prompt, target_path, container_name, apply, use_llm }) => {
        try {
            const result = await planNetworkGraph({
                td: client,
                prompt,
                targetPath: target_path,
                containerName: container_name,
                useLlm: use_llm ?? true,
                apply: apply ?? false,
            });
            return ok(result);
        }
        catch (e) {
            return err(e.message || String(e));
        }
    });
}
