import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { postModifyValidate } from "./postValidate.js";

export function registerParameterTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_pars_get
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pars_get",
    {
      title: "Get Parameters",
      description:
        "Read current parameters from a TouchDesigner operator, including values, expressions, styles and menus.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        names: z
          .array(z.string())
          .optional()
          .describe("Optional list of parameter names"),
      },
    },
    async ({ path: opPath, names }) => {
      try {
        const result = await client.getParameters(opPath, names);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_pars_set
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pars_set",
    {
      title: "Set Parameters",
      description:
        "Set TouchDesigner parameters transactionally. Supports plain values and expressions, with rollback on failure.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        transactional: z
          .boolean()
          .optional()
          .describe("Rollback all changes if any update fails"),
        updates: z.array(
          z.object({
            name: z.string(),
            value: z.unknown().optional(),
            expr: z.string().nullable().optional(),
          })
        ),
      },
    },
    async ({ path: opPath, updates, transactional }) => {
      try {
        const result = await client.setParameters(
          opPath,
          updates,
          transactional ?? true
        );
        // Post-modification validation (catch expression errors)
        const validation = await postModifyValidate(client, opPath);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_set_operator_pars
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_set_operator_pars",
    {
      title: "Set Operator Parameters",
      description:
        "Set parameters on a TouchDesigner operator with a cleaner interface. Supports transactional rollback on failure.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        updates: z
          .array(
            z.object({
              name: z.string().describe("Parameter name"),
              value: z.unknown().optional().describe("Value to set"),
            })
          )
          .describe("Array of parameter updates"),
        transactional: z
          .boolean()
          .optional()
          .default(true)
          .describe("Rollback all changes if any update fails (default: true)"),
      },
    },
    async ({ path: opPath, updates, transactional }) => {
      try {
        const apiUpdates = updates.map((u) => ({
          name: u.name,
          value: u.value,
        }));
        const result = await client.setParameters(
          opPath,
          apiUpdates,
          transactional ?? true
        );
        // Post-modification validation (catch expression errors)
        const validation = await postModifyValidate(client, opPath);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_pulse_param
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pulse_param",
    {
      title: "Pulse Parameter",
      description:
        "Pulse a parameter on a TouchDesigner operator (e.g. Cook, Reset, Save).",
      inputSchema: {
        path: z.string().describe("Operator path"),
        name: z.string().describe("Parameter name to pulse"),
      },
    },
    async ({ path: opPath, name }) => {
      try {
        const result = await client.pulseParam(opPath, name);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_custom_parameters
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_custom_parameters",
    {
      title: "Create Custom Parameters",
      description:
        "Create or update custom parameter pages on a TouchDesigner operator declaratively.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        page: z.string().describe("Custom page name"),
        params: z
          .array(
            z.object({
              name: z.string(),
              type: z.string().optional().default("float"),
              default: z.number().optional(),
              min: z.number().optional(),
              max: z.number().optional(),
              label: z.string().optional(),
            })
          )
          .describe("Parameter definitions"),
      },
    },
    async ({ path: opPath, page, params }) => {
      try {
        const result = await client.customParameters(opPath, page, params);
        const validation = await postModifyValidate(client, opPath);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
