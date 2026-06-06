import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

export function registerInspectionTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_pane
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pane",
    {
      title: "Get Pane State",
      description:
        "Get the current network editor pane state including the network path, position (x, y), and zoom level.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getPaneState();
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_selection
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_selection",
    {
      title: "Get Selection",
      description:
        "Get the currently selected operators in the network editor. Returns operator info including path, name, type, and family.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getSelection();
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_operators
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_operators",
    {
      title: "List Operators",
      description:
        "List all child operators at the specified path. Returns operator info including name, type, and opType.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Operator path (default: '/')"),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.getOperators(opPath ?? "/");
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_find
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_find",
    {
      title: "Find Operators",
      description:
        "Find operators by query, name, family or operator type within a network path.",
      inputSchema: {
        path: z.string().optional().describe("Base path"),
        query: z.string().optional().describe("Free text query"),
        name: z.string().optional().describe("Name substring"),
        family: z.string().optional().describe("Family filter"),
        opType: z.string().optional().describe("Operator type substring"),
        recursive: z
          .boolean()
          .optional()
          .describe("Search descendants recursively"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max results"),
      },
    },
    async (args) => {
      try {
        const result = await client.findOperators(args);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_connections
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_connections",
    {
      title: "Inspect Connections",
      description:
        "Inspect real input/output connections for an operator or a whole network subtree.",
      inputSchema: {
        path: z.string().describe("Operator or container path"),
        recurse: z
          .boolean()
          .optional()
          .describe("Include descendants recursively"),
      },
    },
    async ({ path: opPath, recurse }) => {
      try {
        const result = await client.getConnections(opPath, recurse ?? false);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_errors
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_errors",
    {
      title: "Get Errors",
      description:
        "Get errors and warnings from a TouchDesigner operator or entire network. Force-cooks each operator and reports issues.",
      inputSchema: {
        path: z.string().describe("Operator path to inspect"),
        recurse: z
          .boolean()
          .optional()
          .default(true)
          .describe("Recurse into child operators (default: true)"),
      },
    },
    async ({ path: opPath, recurse }) => {
      try {
        const result = await client.getErrors(opPath, recurse ?? true);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_healthcheck
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_healthcheck",
    {
      title: "Healthcheck Network",
      description:
        "Force-cook and validate a TouchDesigner operator/network, reporting errors, warnings and per-operator issues.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        recurse: z
          .boolean()
          .optional()
          .default(false)
          .describe("Validate descendants recursively (default: false)"),
      },
    },
    async ({ path: opPath, recurse }) => {
      try {
        const result = await client.healthcheck(opPath, recurse ?? false);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_node_detail
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_node_detail",
    {
      title: "Get Node Detail",
      description:
        "Get detailed information about a TouchDesigner operator: parameters, inputs, flags, and optionally recursive children.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        recurse: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include children recursively"),
      },
    },
    async ({ path: opPath, recurse }) => {
      try {
        const result = await client.getNodeDetail(opPath, recurse ?? false);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_hints
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_hints",
    {
      title: "Get Operator Hints",
      description:
        "Get hints and wiring guidance for a specific TouchDesigner operator type.",
      inputSchema: {
        node_type: z
          .string()
          .describe("Operator type (e.g. 'noiseTOP')"),
      },
    },
    async ({ node_type }) => {
      try {
        const result = await client.getHints(node_type);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_info
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_info",
    {
      title: "Get TD Info",
      description:
        "Get TouchDesigner environment info: build version, date, commercial status, platform.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getInfo();
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_focus
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_focus",
    {
      title: "Get Focus",
      description:
        "Get the current user focus in TouchDesigner: which network is open, selected operators, current operator.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getFocus();
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_perf
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_perf",
    {
      title: "Get Performance",
      description:
        "Get performance data from TouchDesigner: FPS, cook budget, GPU memory, and slowest operators sorted by cook time.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("Path to profile (default: '/')"),
        top: z
          .number()
          .optional()
          .default(20)
          .describe("Number of slowest operators to return"),
      },
    },
    async ({ path: opPath, top }) => {
      try {
        const result = await client.getPerf(opPath, top ?? 20);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_pop_inspect
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_pop_inspect",
    {
      title: "Inspect POP Data",
      description:
        "Read particle data from a POP operator: point/prim/vert counts, attributes with types, and sampled attribute values.",
      inputSchema: {
        path: z.string().describe("POP operator path to inspect"),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.popInspect(opPath);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_build_compatibility
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_build_compatibility",
    {
      title: "Check Build Compatibility",
      description: "Check if a specific operator type exists in current TD build.",
      inputSchema: {
        op_type: z.string().describe("Operator type to check"),
      },
    },
    async ({ op_type }) => {
      try {
        const result = await client.getBuildCompatibility(op_type);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_release_delta
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_release_delta",
    {
      title: "Get Release Delta",
      description:
        "Get information about what changed between TouchDesigner builds.",
      inputSchema: {
        build_from: z.string().describe("Source build version"),
        build_to: z
          .string()
          .optional()
          .describe("Target build version (default: current)"),
      },
    },
    async ({ build_from, build_to }) => {
      try {
        const result = await client.getReleaseDelta(build_from, build_to);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
