import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

export function registerUiTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_screenshot
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_screenshot",
    {
      title: "Screenshot Operator",
      description:
        "Take a screenshot of an operator's output. Returns a base64-encoded PNG image.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe(
            "Operator path to screenshot (default: current active pane)"
          ),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.screenshot(opPath);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_screenshots
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_screenshots",
    {
      title: "Get Screenshots (Batch)",
      description:
        "Get screenshots of multiple operators in one batch. Returns base64-encoded PNG images for each operator.",
      inputSchema: {
        paths: z
          .array(z.string())
          .describe("List of full operator paths to screenshot"),
        max_size: z
          .number()
          .optional()
          .describe("Max pixel size for longer side"),
      },
    },
    async ({ paths, max_size }) => {
      try {
        const result = await client.getScreenshots(paths, max_size);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_navigate_to
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_navigate_to",
    {
      title: "Navigate To",
      description:
        "Navigate the TouchDesigner Network Editor viewport to show a specific operator. Opens the parent network and centers the view.",
      inputSchema: {
        path: z
          .string()
          .describe("Path to the operator to navigate to"),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.navigateTo(opPath);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_read_textport
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_read_textport",
    {
      title: "Read Textport",
      description:
        "Read the last N lines from the TouchDesigner textport (console output). Use to see errors, warnings and print output.",
      inputSchema: {
        lines: z
          .number()
          .optional()
          .default(20)
          .describe("Number of recent lines to return"),
      },
    },
    async ({ lines }) => {
      try {
        const result = await client.readTextport(lines ?? 20);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_clear_textport
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_clear_textport",
    {
      title: "Clear Textport",
      description:
        "Clear the textport log buffer. Use before starting a debug session to keep output focused.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.clearTextport();
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_search
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_search",
    {
      title: "Search Inside TD",
      description:
        "Search for text across all code (DAT scripts), parameter expressions, and string parameter values in the TD project.",
      inputSchema: {
        query: z.string().describe("Search query"),
        root: z
          .string()
          .optional()
          .describe("Root path to search from (default /project1)"),
        scope: z
          .enum(["all", "code", "expressions", "parameters"])
          .optional()
          .default("all")
          .describe("What to search"),
        case_sensitive: z
          .boolean()
          .optional()
          .default(false)
          .describe("Case-sensitive matching"),
        max_results: z
          .number()
          .optional()
          .default(50)
          .describe("Max results"),
        count_only: z
          .boolean()
          .optional()
          .default(false)
          .describe("Return only count"),
      },
    },
    async ({ query, root, scope, case_sensitive, max_results, count_only }) => {
      try {
        const result = await client.searchInTD(
          query,
          root,
          scope,
          case_sensitive,
          max_results,
          count_only
        );
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_reinit_extension
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_reinit_extension",
    {
      title: "Reinit Extension",
      description:
        "Reinitialize an extension on a COMP. Call after finishing code edits to apply changes.",
      inputSchema: {
        path: z
          .string()
          .describe("Path to the COMP with the extension"),
      },
    },
    async ({ path: opPath }) => {
      try {
        const result = await client.reinitExtension(opPath);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_auto_layout
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_auto_layout",
    {
      title: "Auto-Layout Network",
      description:
        "Auto-arrange operators in a container using topological-sort layout. Sources on the left, outputs on the right, organized as a clean grid. Supports all operator families including POPs.",
      inputSchema: {
        path: z
          .string()
          .default("/project1")
          .describe("Path to the container to auto-layout"),
        spacingX: z
          .number()
          .default(250)
          .describe("Horizontal spacing between nodes in pixels"),
        spacingY: z
          .number()
          .default(80)
          .describe("Vertical spacing between nodes in pixels"),
      },
    },
    async ({ path, spacingX, spacingY }) => {
      try {
        const result = await client.autoLayout(
          path ?? "/project1",
          spacingX ?? 250,
          spacingY ?? 80,
        );
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_smart_connect
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_smart_connect",
    {
      title: "Smart Connect",
      description:
        "Create an operator between two existing operators with auto-detected type compatibility. Auto-positions and wires the new operator. Either source or destination may be omitted, but at least one is required.",
      inputSchema: {
        source: z
          .string()
          .describe("Path to the source operator (its output feeds the new op)"),
        destination: z
          .string()
          .describe("Path to the destination operator (the new op feeds its first input)"),
        type: z
          .string()
          .optional()
          .describe(
            "Optional forced operator type (e.g. 'blurTOP', 'nullCHOP'). If omitted, a compatible null* type is auto-detected from the source/destination family."
          ),
        name: z
          .string()
          .optional()
          .describe("Optional custom name for the new operator"),
      },
    },
    async ({ source, destination, type, name }) => {
      try {
        const result = await client.smartConnect(source, destination, type, name);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
