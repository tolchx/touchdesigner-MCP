import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

export function registerDataTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_read_dat
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_read_dat",
    {
      title: "Read DAT",
      description:
        "Read the text content of a DAT operator in TouchDesigner. Returns content with line numbers.",
      inputSchema: {
        path: z.string().describe("Path to the DAT operator"),
        start_line: z.number().optional().describe("Start line (1-based)"),
        end_line: z.number().optional().describe("End line (inclusive)"),
      },
    },
    async ({ path: opPath, start_line, end_line }) => {
      try {
        const result = await client.readDat(opPath, start_line, end_line);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_write_dat
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_write_dat",
    {
      title: "Write DAT",
      description:
        "Write or patch text content of a DAT operator. Can do full replacement or StrReplace-style patching.",
      inputSchema: {
        path: z.string().describe("Path to the DAT operator"),
        text: z.string().optional().describe("Full replacement text"),
        old_text: z.string().optional().describe("Text to find and replace"),
        new_text: z.string().optional().describe("Replacement text"),
        replace_all: z
          .boolean()
          .optional()
          .default(false)
          .describe("Replace all occurrences"),
      },
    },
    async ({ path: opPath, text, old_text, new_text, replace_all }) => {
      try {
        const result = await client.writeDat(
          opPath,
          text,
          old_text,
          new_text,
          replace_all ?? false
        );
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_read_chop
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_read_chop",
    {
      title: "Read CHOP",
      description: "Read CHOP channel sample data. Returns channel values as arrays.",
      inputSchema: {
        path: z.string().describe("Path to the CHOP operator"),
        channels: z
          .array(z.string())
          .optional()
          .describe("Channel names to read"),
        start: z
          .number()
          .optional()
          .describe("Start sample index (0-based)"),
        end: z.number().optional().describe("End sample index (inclusive)"),
      },
    },
    async ({ path: opPath, channels, start, end }) => {
      try {
        const result = await client.readChop(opPath, channels, start, end);
        return ok(result);
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
