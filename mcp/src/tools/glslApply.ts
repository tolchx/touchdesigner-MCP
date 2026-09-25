import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";
import { analyzeGlslShader, applyGlslPop } from "./glslValidate.js";

/**
 * Safe GLSL POP write path (docs/GLSL_POP_RULES.md):
 *   - td_glsl_analyze: pure static check (R1-R4) — no TD round-trip.
 *   - td_glsl_apply:   pre-validate → create with auto Create Attributes (R3),
 *     auto readwrite (R4), cook, and return the infoDAT compiler log on
 *     failure (R5) instead of a bare "Compile failed".
 */
export function registerGlslApplyTools(server: McpServer, client: TDClient) {
  server.registerTool(
    "td_glsl_analyze",
    {
      title: "Analyze GLSL POP Shader",
      description:
        "Statically analyze a GLSL POP shader against the verified rules " +
        "(docs/GLSL_POP_RULES.md): output reads (R1), missing TDIndex/TDNumElements " +
        "guard (R2), attributes needing Create Attributes with the exact params " +
        "(R3), and outputaccess='readwrite' needs (R4). No TouchDesigner needed.",
      inputSchema: {
        shader: z.string().describe("Full GLSL shader source to analyze"),
      },
    },
    async ({ shader }) => {
      try {
        return ok(analyzeGlslShader(shader));
      } catch (e: any) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "td_glsl_apply",
    {
      title: "Apply GLSL POP",
      description:
        "Create a glslPOP that COMPILES: pre-validates the shader (rejects " +
        "output reads with the fix — R1), writes the shader to a textDAT, creates " +
        "the glslPOP, auto-creates the attributes it writes via Create Attributes " +
        "(attr0name='Custom' + attr0customname + attr0numcomps — R3), sets " +
        "outputaccess='readwrite' when needed (R4), optionally wires a source POP, " +
        "cooks, and on compile failure returns the real compiler log from the " +
        "infoDAT <name>_info (R5).",
      inputSchema: {
        parent_path: z.string().describe("Parent COMP path (e.g. /project1)"),
        name: z.string().describe("Name for the glslPOP"),
        shader: z.string().describe("Full GLSL shader source"),
        source_path: z
          .string()
          .optional()
          .describe("Optional POP source to wire into input 0 (GLSL POP needs an input to produce data)"),
        outputattrs: z
          .string()
          .optional()
          .describe("Override outputattrs (default 'P' — only input-existing attrs, R3)"),
        pop_kind: z
          .enum(["basic", "copy"])
          .optional()
          .default("basic")
          .describe(
            "'basic' creates a glslPOP; 'copy' creates a glslcopyPOP for per-copy shaders " +
              "(Phyllotaxis/Hairy-Banana style). The copy POP uses ptcomputedat/ptoutputattrs " +
              "and the TDNumPoints/TDCopyIndex/TDTemplate_* builtin family — write the shader " +
              "for that family, NOT TDIndex()/TDNumElements()."
          ),
      },
    },
    async ({ parent_path, name, shader, source_path, outputattrs, pop_kind }) => {
      try {
        const result = await applyGlslPop(client, {
          parentPath: parent_path,
          name,
          shader,
          sourcePath: source_path,
          outputattrs,
          popKind: pop_kind ?? "basic",
        });
        if (result.isError) {
          return err(result.message);
        }
        return ok({ message: result.message, report: result.report });
      } catch (e: any) {
        return err(e);
      }
    }
  );
}
