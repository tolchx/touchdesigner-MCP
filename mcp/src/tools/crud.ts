import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient, CreateOperatorResult } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { postModifyValidate, getParentPath } from "./postValidate.js";

/**
 * GLSL POP types that require outputattrs to be set for P[id]/Cd[id] writes.
 * Without this, the GLSL shader compilation fails with "undeclared identifier" errors.
 */
const GLSL_POP_TYPES = new Set([
  "glslPOP",
  "glslCreatePOP",
  "glslAdvancedPOP",
  "glslcopyPOP",
  "glslCopyPOP",
]);

export function registerCrudTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_create_operator
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_create_operator",
    {
      title: "Create Operator",
      description:
        "Create a new operator in TouchDesigner. Specify the opType (e.g. noiseTOP, constantTOP, nullCHOP) and optional name, parent path, and position. For GLSL POPs (glslPOP, glslCreatePOP, etc.), outputattrs is auto-set to 'P' and numelems to 100 unless overridden — these are required for P[id]/Cd[id] writes to compile.",
      inputSchema: {
        type: z
          .string()
          .describe(
            "The TD opType to create (e.g. 'noiseTOP', 'constantCHOP', 'nullSOP')"
          ),
        name: z.string().optional().describe("Optional name for the new operator"),
        path: z
          .string()
          .optional()
          .default("/")
          .describe("Parent operator path (default: '/')"),
        position_x: z.number().optional().describe("X position in the network editor"),
        position_y: z.number().optional().describe("Y position in the network editor"),
        outputattrs: z
          .string()
          .optional()
          .describe(
            "Output attributes for GLSL POPs (e.g. 'P', 'P Cd', 'P Cd N'). " +
            "Auto-set to 'P' for glslPOP/glslCreatePOP/glslAdvancedPOP/glslcopyPOP. " +
            "Set to empty string to skip auto-configuration."
          ),
        numelems: z
          .number()
          .optional()
          .describe(
            "Number of elements for GLSL POPs. Auto-set to 100 for glslPOP/glslCreatePOP/glslAdvancedPOP/glslcopyPOP. " +
            "Set to 0 to skip auto-configuration."
          ),
      },
    },
    async ({ type, name, path: opPath, position_x, position_y, outputattrs, numelems }) => {
      try {
        const result = await client.createOperator(
          type,
          name,
          opPath ?? "/",
          position_x,
          position_y
        );

        // Auto-set outputattrs + numelems for GLSL POPs
        const isGlslPop = GLSL_POP_TYPES.has(type);
        if (isGlslPop) {
          const createdPath = result.path;
          if (createdPath) {
            const updates: { name: string; value: unknown }[] = [];
            if (outputattrs !== "") {
              updates.push({ name: "outputattrs", value: outputattrs ?? "P" });
            }
            if (numelems !== 0) {
              updates.push({ name: "numelems", value: numelems ?? 100 });
            }
            if (updates.length > 0) {
              try {
                await client.setParameters(createdPath, updates, false);
                const resultExt = result as CreateOperatorResult & Record<string, unknown>;
                if (outputattrs !== "") resultExt.outputattrs = outputattrs ?? "P";
                if (numelems !== 0) resultExt.numelems = numelems ?? 100;
              } catch {
                (result as CreateOperatorResult & Record<string, unknown>).glslConfigWarning =
                  `Operator created but failed to set GLSL params`;
              }
            }
          }
        }

        // Post-modification validation
        const parentPath = opPath || "/";
        const createdPath = result.path || `${parentPath}/${name || type}`;
        const validation = await postModifyValidate(client, createdPath, parentPath);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_delete_operator
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_delete_operator",
    {
      title: "Delete Operator",
      description: "Delete a TouchDesigner operator by its full path.",
      inputSchema: {
        path: z
          .string()
          .describe("Full operator path to delete (e.g. '/project1/noise1')"),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.deleteOperator(opPath);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_connect_nodes
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_connect_nodes",
    {
      title: "Connect Nodes",
      description: "Connect two TouchDesigner operators by wiring an output to an input.",
      inputSchema: {
        source_path: z.string().describe("Source operator path (output node)"),
        target_path: z.string().describe("Target operator path (input node)"),
        source_output: z
          .string()
          .optional()
          .default("output")
          .describe("Source output name (default: 'output')"),
        target_input: z
          .number()
          .optional()
          .default(0)
          .describe("Target input index (default: 0)"),
      },
    },
    async ({ source_path, target_path, target_input }) => {
      try {
        const result = await client.connectNodes(
          source_path,
          target_path,
          target_input ?? 0
        );
        // Post-modification validation (check target for cook loops)
        const validation = await postModifyValidate(client, target_path);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_disconnect
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_disconnect",
    {
      title: "Disconnect Nodes",
      description:
        "Disconnect an input of a TouchDesigner operator from its source.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        input_index: z
          .number()
          .optional()
          .default(0)
          .describe("Input index to disconnect"),
      },
    },
    async ({ path: opPath, input_index }) => {
      try {
        const result = await client.disconnect(opPath, input_index ?? 0);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_copy_node
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_copy_node",
    {
      title: "Copy Node",
      description:
        "Duplicate a TouchDesigner operator. If destination is omitted, copies to the same parent.",
      inputSchema: {
        path: z.string().describe("Source operator path"),
        destination: z
          .string()
          .optional()
          .describe("Destination parent path"),
        name: z.string().optional().describe("New name for the copy"),
      },
    },
    async ({ path: opPath, destination, name }) => {
      try {
        const result = await client.copyNode(opPath, destination, name);
        // Post-modification validation
        const parentPath = destination || getParentPath(opPath);
        const validation = await postModifyValidate(client, opPath, parentPath);
        return ok({ ...result, validation });
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
