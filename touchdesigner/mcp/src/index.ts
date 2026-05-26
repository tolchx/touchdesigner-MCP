#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TDClient } from "td-api";
import { z } from "zod";
import { pathToFileURL } from "node:url";
import { queryPops } from "./popsDb.js";
import { TdFamilySchema, queryOps, loadOpsIndex, TdFamily } from "./opsDb.js";
import { queryTemplates } from "./templatesDb.js";
import { resolveSemanticTerms } from "./semantic.js";
import { createNetworkPlan } from "./networkPlanner.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function createTouchDesignerMcpServer(client: TDClient = new TDClient()) {
  const server = new McpServer({
    name: "touchdesigner",
    version: "0.1.0",
  });

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
      const result = await client.execute(code, from_op ?? "/");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_pane",
    {
      title: "Get Pane State",
      description:
        "Get the current network editor pane state including the network path, position (x, y), and zoom level.",
      inputSchema: {},
    },
    async () => {
      const result = await client.getPaneState();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_selection",
    {
      title: "Get Selection",
      description:
        "Get the currently selected operators in the network editor. Returns operator info including path, name, type, and family.",
      inputSchema: {},
    },
    async () => {
      const result = await client.getSelection();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_operators",
    {
      title: "List Operators",
      description:
        "List all child operators at the specified path. Returns operator info including name, type, and opType.",
      inputSchema: {
        path: z.string().optional().describe("Operator path (default: '/')"),
      },
    },
    async ({ path }) => {
      const result = await client.getOperators(path ?? "/");
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_pops_query",
    {
      title: "Query POPs Knowledge Base",
      description:
        "Search the local POPs knowledge base or fetch a specific operator doc by page slug (e.g. Particle_POP).",
      inputSchema: {
        search: z.string().optional().describe("Search string"),
        page_slug: z.string().optional().describe("Exact page slug (e.g. Particle_POP)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, page_slug, limit }) => {
      const result = await queryPops({ search, pageSlug: page_slug, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_ops_query",
    {
      title: "Query Operator Knowledge Base (TOP/CHOP/SOP/DAT)",
      description:
        "Search the local operator knowledge base (TOP/CHOP/SOP/DAT) or fetch a specific operator doc by family+page slug (e.g. TOP + Noise_TOP).",
      inputSchema: {
        search: z.string().optional().describe("Search string"),
        family: TdFamilySchema.optional().describe("Operator family: TOP|CHOP|SOP|DAT"),
        page_slug: z.string().optional().describe("Exact page slug (e.g. Noise_TOP)"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, family, page_slug, limit }) => {
      const result = await queryOps({ search, family, pageSlug: page_slug, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_pars_get",
    {
      title: "Get Parameters",
      description:
        "Read current parameters from a TouchDesigner operator, including values, expressions, styles and menus.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        names: z.array(z.string()).optional().describe("Optional list of parameter names"),
      },
    },
    async ({ path, names }) => {
      const result = await client.getParameters(path, names);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_pars_set",
    {
      title: "Set Parameters",
      description:
        "Set TouchDesigner parameters transactionally. Supports plain values and expressions, with rollback on failure.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        transactional: z.boolean().optional().describe("Rollback all changes if any update fails"),
        updates: z.array(
          z.object({
            name: z.string(),
            value: z.unknown().optional(),
            expr: z.string().nullable().optional(),
          })
        ),
      },
    },
    async ({ path, updates, transactional }) => {
      const result = await client.setParameters(path, updates, transactional ?? true);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_connections",
    {
      title: "Inspect Connections",
      description:
        "Inspect real input/output connections for an operator or a whole network subtree.",
      inputSchema: {
        path: z.string().describe("Operator or container path"),
        recurse: z.boolean().optional().describe("Include descendants recursively"),
      },
    },
    async ({ path, recurse }) => {
      const result = await client.getConnections(path, recurse ?? false);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

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
        recursive: z.boolean().optional().describe("Search descendants recursively"),
        limit: z.number().int().min(1).max(200).optional().describe("Max results"),
      },
    },
    async ({ path, query, name, family, opType, recursive, limit }) => {
      const result = await client.findOperators({
        path,
        query,
        name,
        family,
        opType,
        recursive,
        limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_templates_query",
    {
      title: "Query Project Templates",
      description:
        "Search reusable patterns and project-specific markdown templates inside Toe_Expand documentation.",
      inputSchema: {
        search: z.string().describe("Search phrase"),
        project: z.string().optional().describe("Optional project filter"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results"),
      },
    },
    async ({ search, project, limit }) => {
      const result = await queryTemplates({ search, project, limit });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_alias_resolve",
    {
      title: "Resolve Semantic Aliases",
      description:
        "Resolve prompt vocabulary like feedback loop, life, size, cd or direction into canonical TouchDesigner parameters, attributes and family hints.",
      inputSchema: {
        text: z.string().describe("Natural language text or prompt"),
      },
    },
    async ({ text }) => {
      const result = resolveSemanticTerms(text);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_network_plan",
    {
      title: "Plan Or Apply Network",
      description:
        "Create a dry-run network plan from a prompt using operator databases and semantic aliases, or apply the generated skeleton inside TouchDesigner.",
      inputSchema: {
        prompt: z.string().describe("Natural language instruction"),
        target_path: z.string().optional().describe("Container path where the system should be created"),
        container_name: z.string().optional().describe("Name of the generated container"),
        apply: z.boolean().optional().describe("Apply the generated plan inside TouchDesigner"),
      },
    },
    async ({ prompt, target_path, container_name, apply }) => {
      const result = await createNetworkPlan({
        td: client,
        prompt,
        targetPath: target_path,
        containerName: container_name,
        apply: apply ?? false,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "td_healthcheck",
    {
      title: "Healthcheck Network",
      description:
        "Force-cook and validate a TouchDesigner operator/network, reporting errors, warnings and per-operator issues.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        recurse: z.boolean().optional().describe("Validate descendants recursively"),
      },
    },
    async ({ path, recurse }) => {
      const result = await client.healthcheck(path, recurse ?? true);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );

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
        type: z.string().describe("The TD opType to create (e.g. 'noiseTOP', 'constantCHOP', 'nullSOP')"),
        name: z.string().optional().describe("Optional name for the new operator"),
        path: z.string().optional().default("/").describe("Parent operator path (default: '/')"),
        position_x: z.number().optional().describe("X position in the network editor"),
        position_y: z.number().optional().describe("Y position in the network editor"),
      },
    },
    async ({ type, name, path, position_x, position_y }) => {
      try {
        const result = await client.createOperator(type, name, path ?? "/", position_x, position_y);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
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
        path: z.string().describe("Full operator path to delete (e.g. '/project1/noise1')"),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.deleteOperator(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
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
        source_output: z.string().optional().default("output").describe("Source output name (default: 'output')"),
        target_input: z.number().optional().default(0).describe("Target input index (default: 0)"),
      },
    },
    async ({ source_path, target_path, source_output, target_input }) => {
      try {
        const result = await client.connectNodes(source_path, target_path, target_input ?? 0);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
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
        recurse: z.boolean().optional().default(true).describe("Recurse into child operators (default: true)"),
      },
    },
    async ({ path, recurse }) => {
      try {
        const result = await client.getErrors(path, recurse ?? true);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }, null, 2) }],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_screenshot
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_screenshot",
    {
      title: "Screenshot Operator",
      description: "Take a screenshot of an operator's output. Returns a base64-encoded PNG image.",
      inputSchema: {
        path: z.string().optional().describe("Operator path to screenshot (default: current active pane)"),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.screenshot(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_get_param_help
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_get_param_help",
    {
      title: "Get Parameter Help",
      description:
        "Look up the available parameters for a TouchDesigner operator type (e.g. 'noiseTOP') from the local knowledge base.",
      inputSchema: {
        type: z.string().describe("Operator type to look up (e.g. 'noiseTOP', 'constantCHOP', 'mergeSOP', 'textDAT')"),
      },
    },
    async ({ type }) => {
      try {
        // Map the opType to a family and pageSlug by scanning the index
        const index = await loadOpsIndex();
        const matching = index.operators.filter(
          (op) => op.tdOpTypeGuess?.toLowerCase() === type.toLowerCase()
        );

        if (matching.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    found: false,
                    type,
                    message: `No operator found for type '${type}' in the local knowledge base. Try searching with td_ops_query to find the correct type name.`,
                    hint: "Operator types follow the pattern: noiseTOP, constantCHOP, mergeSOP, textDAT, etc.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Try loading the full doc for the first match
        const match = matching[0];
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const docPath = path.join(
          __dirname,
          "../data/ops/operators",
          match.family,
          `${match.pageSlug}.json`
        );

        let doc: any;
        try {
          const raw = await fs.readFile(docPath, "utf8");
          doc = JSON.parse(raw);
        } catch {
          // Fallback: return just the index-level info
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    found: true,
                    type,
                    family: match.family,
                    pageTitle: match.pageTitle,
                    url: match.url,
                    note: "Full parameter details not available in local database for this operator.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  found: true,
                  type,
                  family: doc.family,
                  pageTitle: doc.pageTitle,
                  url: doc.url,
                  summary: doc.summary?.substring(0, 1000) ?? "",
                  parameters: doc.parameters ?? [],
                  inputs: doc.inputs ?? [],
                  attributes: doc.attributes ?? [],
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  found: false,
                  type,
                  error: e.message,
                  message: `Could not look up operator type '${type}' from the local knowledge base.`,
                },
                null,
                2
              ),
            },
          ],
        };
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
        updates: z.array(
          z.object({
            name: z.string().describe("Parameter name"),
            value: z.unknown().optional().describe("Value to set"),
          })
        ).describe("Array of parameter updates"),
        transactional: z.boolean().optional().default(true).describe("Rollback all changes if any update fails (default: true)"),
      },
    },
    async ({ path, updates, transactional }) => {
      try {
        // Convert to the existing API format
        const apiUpdates = updates.map((u) => ({
          name: u.name,
          value: u.value,
        }));
        const result = await client.setParameters(path, apiUpdates, transactional ?? true);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: e.message }, null, 2) }],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_project_lifecycle
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_project_lifecycle",
    {
      title: "Project Lifecycle",
      description:
        "Control TouchDesigner project lifecycle: save, load, undo, redo, start/end undo block, or clear undo history.",
      inputSchema: {
        action: z.enum([
          "save",
          "load",
          "undo",
          "redo",
          "start_undo_block",
          "end_undo_block",
          "clear_undo",
        ]).describe("Lifecycle action to perform"),
        path: z.string().optional().describe("File path for save/load actions"),
      },
    },
    async ({ action, path }) => {
      try {
        const result = await client.projectLifecycle(action, path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, action, error: e.message }, null, 2) }],
        };
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
    async ({ path }) => {
      try {
        const result = await client.popInspect(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_snapshot_scene
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_snapshot_scene",
    {
      title: "Snapshot Scene",
      description:
        "Save a snapshot of an operator's state (all par values, modes, expressions) to a JSON structure. Useful before destructive changes.",
      inputSchema: {
        path: z.string().default("/").describe("Root operator path for snapshot"),
      },
    },
    async ({ path }) => {
      try {
        const result = await client.snapshotScene(path);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }],
        };
      }
    }
  );

  // ---------------------------------------------------------------------------
  // td_read_dat
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_read_dat",
    {
      title: "Read DAT",
      description: "Read the text content of a DAT operator in TouchDesigner. Returns content with line numbers.",
      inputSchema: {
        path: z.string().describe("Path to the DAT operator"),
        start_line: z.number().optional().describe("Start line (1-based)"),
        end_line: z.number().optional().describe("End line (inclusive)"),
      },
    },
    async ({ path, start_line, end_line }) => {
      try {
        const result = await client.readDat(path, start_line, end_line);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Write or patch text content of a DAT operator. Can do full replacement or StrReplace-style patching.",
      inputSchema: {
        path: z.string().describe("Path to the DAT operator"),
        text: z.string().optional().describe("Full replacement text"),
        old_text: z.string().optional().describe("Text to find and replace"),
        new_text: z.string().optional().describe("Replacement text"),
        replace_all: z.boolean().optional().default(false).describe("Replace all occurrences"),
      },
    },
    async ({ path, text, old_text, new_text, replace_all }) => {
      try {
        const result = await client.writeDat(path, text, old_text, new_text, replace_all ?? false);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
        channels: z.array(z.string()).optional().describe("Channel names to read"),
        start: z.number().optional().describe("Start sample index (0-based)"),
        end: z.number().optional().describe("End sample index (inclusive)"),
      },
    },
    async ({ path, channels, start, end }) => {
      try {
        const result = await client.readChop(path, channels, start, end);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Search for text across all code (DAT scripts), parameter expressions, and string parameter values in the TD project.",
      inputSchema: {
        query: z.string().describe("Search query"),
        root: z.string().optional().describe("Root path to search from (default /project1)"),
        scope: z.enum(["all", "code", "expressions", "parameters"]).optional().default("all").describe("What to search"),
        case_sensitive: z.boolean().optional().default(false).describe("Case-sensitive matching"),
        max_results: z.number().optional().default(50).describe("Max results"),
        count_only: z.boolean().optional().default(false).describe("Return only count"),
      },
    },
    async ({ query, root, scope, case_sensitive, max_results, count_only }) => {
      try {
        const result = await client.searchInTD(query, root, scope, case_sensitive, max_results, count_only);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Get TouchDesigner environment info: build version, date, commercial status, platform.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await client.getInfo();
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Get detailed information about a TouchDesigner operator: parameters, inputs, flags, and optionally recursive children.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        recurse: z.boolean().optional().default(false).describe("Include children recursively"),
      },
    },
    async ({ path, recurse }) => {
      try {
        const result = await client.getNodeDetail(path, recurse ?? false);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Get hints and wiring guidance for a specific TouchDesigner operator type.",
      inputSchema: {
        node_type: z.string().describe("Operator type (e.g. 'noiseTOP')"),
      },
    },
    async ({ node_type }) => {
      try {
        const result = await client.getHints(node_type);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Get information about what changed between TouchDesigner builds.",
      inputSchema: {
        build_from: z.string().describe("Source build version"),
        build_to: z.string().optional().describe("Target build version (default: current)"),
      },
    },
    async ({ build_from, build_to }) => {
      try {
        const result = await client.getReleaseDelta(build_from, build_to);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
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
      description: "Create or update custom parameter pages on a TouchDesigner operator declaratively.",
      inputSchema: {
        path: z.string().describe("Operator path"),
        page: z.string().describe("Custom page name"),
        params: z.array(z.object({
          name: z.string(),
          type: z.string().optional().default("float"),
          default: z.number().optional(),
          min: z.number().optional(),
          max: z.number().optional(),
          label: z.string().optional(),
        })).describe("Parameter definitions"),
      },
    },
    async ({ path, page, params }) => {
      try {
        const result = await client.customParameters(path, page, params);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: e.message }, null, 2) }] };
      }
    }
  );

  return server;
}

export async function runStdioMcpServer() {
  const server = createTouchDesignerMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runStdioMcpServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

