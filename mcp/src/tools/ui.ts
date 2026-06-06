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
}
