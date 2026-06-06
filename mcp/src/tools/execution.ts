import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { createNetworkPlan } from "../networkPlanner.js";

export function registerExecutionTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_execute
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_execute",
    {
      title: "Execute Python",
      description:
        "Execute Python code in TouchDesigner. The code runs in TD's Python environment with access to all TD modules (op, ui, etc.). Use 'me' to reference the context operator specified by from_op.",
      inputSchema: {
        code: z.string().describe("Python code to execute"),
        from_op: z
          .string()
          .optional()
          .describe("Context operator path (default: '/')"),
      },
    },
    async ({ code, from_op }) => {
      try {
        const result = await client.execute(code, from_op ?? "/");
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_network_plan
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_network_plan",
    {
      title: "Plan Or Apply Network",
      description:
        "Create a dry-run network plan from a prompt using operator databases and semantic aliases, or apply the generated skeleton inside TouchDesigner.",
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
      },
    },
    async ({ prompt, target_path, container_name, apply }) => {
      try {
        const result = await createNetworkPlan({
          td: client,
          prompt,
          targetPath: target_path,
          containerName: container_name,
          apply: apply ?? false,
        });
        return ok(result);
      } catch (e: any) {
        return err((e as any).message || String(e));
      }
    }
  );
}
