import { z } from "zod";
import { ok, err } from "../helpers.js";
import { GLSL_TOP_RECIPES, buildGlslTopRecipeCode, sanitizeNodeName, } from "./glslTopRecipes.js";
import { analyzeGlslTopShader, preValidateTopShader } from "./glslValidate.js";
/**
 * GLSL TOP write path (docs/GLSL_TOP_RULES.md, item 31):
 *   - td_glsl_top_analyze: pure static check against the live-verified TOP
 *     rules (T1 fragColor, T2 vUV swizzles, T4 vec0/const0 uniforms) —
 *     no TD round-trip.
 *   - td_glsl_top_recipe: build one of the 7 verified BoS-derived recipes
 *     via a single /exec, pre-validated through the same safety net.
 */
export function registerGlslTopTools(server, client) {
    server.registerTool("td_glsl_top_analyze", {
        title: "Analyze GLSL TOP Shader",
        description: "Statically analyze a GLSL TOP (pixel) shader against the verified rules " +
            "(docs/GLSL_TOP_RULES.md): missing `layout(location=0) out vec4 fragColor` " +
            "(T1), invalid vUV swizzles like .uv/.uv1/.texcoord with the .st/.xy fix " +
            "(T2), POP-style uniform0name in creation code with the real vec0*/const0* " +
            "mechanism (T4), missing void main, and the infoDAT <name>_info pointer for " +
            "compile failures (T9). No TouchDesigner needed.",
        inputSchema: {
            shader: z.string().describe("Full GLSL TOP pixel shader source"),
            creation_code: z
                .string()
                .optional()
                .describe("Optional Python creation code (from buildGlslTopRecipeCode or hand-written) — enables the T4 uniform0name check"),
        },
    }, async ({ shader, creation_code }) => {
        try {
            const problems = preValidateTopShader(shader, creation_code);
            return ok({
                analysis: analyzeGlslTopShader(shader, creation_code),
                problems,
            });
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("td_glsl_top_recipe", {
        title: "Apply GLSL TOP Recipe",
        description: "Create one of the verified GLSL TOP visual recipes (Book of Shaders " +
            "concepts in TouchDesigner idioms): " +
            GLSL_TOP_RECIPES.map((r) => r.id).join(", ") +
            ". Pre-validates the shader through the TOP safety net (rejects vUV.uv " +
            "and POP-only uniform params before TD sees them), then builds the node " +
            "in TD with a single /exec and reports compile status incl. the infoDAT " +
            "log on failure (T9). Feedback recipes note the scripted-cook buffer " +
            "limitation (T10).",
        inputSchema: {
            recipe_id: z
                .string()
                .describe("One of: " + GLSL_TOP_RECIPES.map((r) => r.id).join(", ")),
            parent_path: z
                .string()
                .default("/project1")
                .describe("Parent COMP path (default /project1)"),
            name: z
                .string()
                .optional()
                .describe("Name for the glslTOP (default <recipe_id> sanitized)"),
        },
    }, async ({ recipe_id, parent_path, name }) => {
        try {
            const recipe = GLSL_TOP_RECIPES.find((r) => r.id === recipe_id);
            if (!recipe) {
                return err("Unknown recipe_id '" + recipe_id + "'. Available: " +
                    GLSL_TOP_RECIPES.map((r) => r.id).join(", "));
            }
            const node_name = sanitizeNodeName(name ?? recipe_id);
            const code = buildGlslTopRecipeCode(recipe, parent_path, node_name);
            const problems = preValidateTopShader(recipe.glsl, code);
            if (problems) {
                return err("Recipe failed its own safety net (bug — please report): " +
                    problems.join("; "));
            }
            const result = await client.execute(code);
            if (!result.success) {
                return err("Execution failed: " + (result.error?.message ?? result.error));
            }
            return ok({
                message: "Recipe '" + recipe_id + "' created as /" +
                    (parent_path.replace(/^\//, "") + "/" + node_name) +
                    (recipe.realtimeOnly
                        ? " (feedback wired; visual evolution requires real-time frames — T10)"
                        : ""),
                recipe_id,
                glsl: recipe.glsl,
                creation_code: code,
                exec_output: result.stdout,
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
