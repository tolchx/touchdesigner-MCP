import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

export function registerCrudTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_create_operator
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_create_operator",
    {
      title: "Create Operator",
      description:
        "Create a new operator in TouchDesigner. Specify the opType (e.g. noiseTOP, constantTOP, nullCHOP) and optional name, parent path, and position.",
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
      },
    },
    async ({ type, name, path: opPath, position_x, position_y }) => {
      try {
        const result = await client.createOperator(
          type,
          name,
          opPath ?? "/",
          position_x,
          position_y
        );
        return ok(result);
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
        return ok(result);
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
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
