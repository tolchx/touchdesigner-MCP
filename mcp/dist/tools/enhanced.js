/**
 * Enhanced Tools Registration
 *
 * Registers all tools migrated from the 7 repos analyzed:
 *  - Network templates (bottobot)
 *  - Natural language type resolution (superdwayne)
 *  - Builder recipes (mrinalghosh)
 *  - Knowledge brain FTS5 (TDPilot)
 *  - Presenter/formatter (8beeeaaat)
 *  - Catalog manager (Embody)
 *
 * These are registered ON TOP of the existing 69 tools for a total of ~82+ tools.
 */
import { z } from "zod";
import { ok, err } from "../helpers.js";
// ─── New modules ──────────────────────────────────────────────────────────
import { resolvePrompt, getBestFamily, searchTemplates, getTemplateByName, listTemplateNames, listAllTags, FAMILY_HINTS, } from "../networkTemplates.js";
import { listRecipes, getRecipe, searchRecipes, } from "../builderRecipes.js";
import { searchKnowledge, searchByFamily, } from "../knowledgeBrain.js";
import { searchCatalog, getCatalogEntry, listByFamily, getCreationDefaults, getCatalogCountsByFamily, } from "../catalogManager.js";
// ─── Registration ─────────────────────────────────────────────────────────
export async function registerEnhancedTools(server, client) {
    // ---------------------------------------------------------------------------
    // td_resolve_operator — Natural Language → TD Operator Type
    // ---------------------------------------------------------------------------
    server.registerTool("td_resolve_operator", {
        title: "Resolve Operator Type",
        description: "Convert natural language descriptions to exact TouchDesigner operator types. " +
            "200+ synonyms: 'webcam'→videodeviceinTOP, 'blur'→blurTOP, 'particles'→particlePOP, etc. " +
            "Also returns best-guess family and matching templates/recipes.",
        inputSchema: {
            prompt: z.string().describe("Natural language description (e.g., 'noisy webcam with blur')"),
            limit: z.number().int().min(1).max(10).optional().default(3).describe("Max operator matches"),
        },
    }, async ({ prompt, limit }) => {
        try {
            const result = resolvePrompt(prompt);
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_template — Get a pre-built network template
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_template", {
        title: "Get Network Template",
        description: "Get a pre-built network template with exact port-level wiring, parameters, and Python builder code. " +
            "8 templates: generative-art-feedback, audio-reactive-spectrum, particle-system-basic, " +
            "glow-bloom, glsl-shader-pipeline, chroma-key-composite, kaleidoscope, edge-detect.",
        inputSchema: {
            name: z.string().describe("Template name (use 'list' to see all names)"),
            search: z.string().optional().describe("Search templates by keyword"),
        },
    }, async ({ name, search }) => {
        try {
            if (name === "list" || name === "all") {
                const names = listTemplateNames();
                return ok({ templates: names, count: names.length });
            }
            if (search) {
                const results = searchTemplates(search);
                return ok({ templates: results, count: results.length });
            }
            const tmpl = getTemplateByName(name);
            if (!tmpl) {
                return err(new Error(`Template "${name}" not found. Use td_list_templates to see options.`));
            }
            return ok(tmpl);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_list_templates — List all available templates
    // ---------------------------------------------------------------------------
    server.registerTool("td_list_templates", {
        title: "List Templates",
        description: "List all available network templates with tags and summaries.",
        inputSchema: {
            tag: z.string().optional().describe("Filter by tag (e.g., 'particles', 'audio', 'glsl')"),
        },
    }, async ({ tag }) => {
        try {
            const allTags = listAllTags();
            const names = listTemplateNames();
            const results = tag
                ? searchTemplates(tag)
                : names.map(n => {
                    const t = getTemplateByName(n);
                    return { name: n, description: t?.description || "", tags: t?.tags || [] };
                });
            return ok({ templates: results, count: results.length, availableTags: allTags });
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_recipe — Get a builder recipe (paste-ready Python)
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_recipe", {
        title: "Get Builder Recipe",
        description: "Get a production-ready builder recipe with paste-ready Python code, gotchas, and wiring. " +
            "5 recipes: feedback-loop-top, particle-system-pop, glsl-top-shader, audio-reactive-spectrum, render-scene-3d. " +
            "Each recipe includes known gotchas to prevent common mistakes.",
        inputSchema: {
            name: z.string().describe("Recipe name (use 'list' to see all)"),
            search: z.string().optional().describe("Search recipes by keyword"),
        },
    }, async ({ name, search }) => {
        try {
            if (name === "list" || name === "all") {
                const all = listRecipes();
                return ok({ recipes: all.map(r => ({ name: r.name, title: r.title, tags: r.tags, complexity: r.complexity })), count: all.length });
            }
            if (search) {
                const results = searchRecipes(search);
                return ok({ recipes: results.map(r => ({ name: r.name, description: r.description })), count: results.length });
            }
            const recipe = getRecipe(name);
            if (!recipe) {
                return err(new Error(`Recipe "${name}" not found. Use td_get_recipe name="list" to see options.`));
            }
            return ok(recipe);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_search_knowledge — FTS5 search of TD operator documentation
    // ---------------------------------------------------------------------------
    server.registerTool("td_search_knowledge", {
        title: "Search Knowledge Brain",
        description: "Full-text search across all TouchDesigner operator documentation (FTS5 + BM25 ranking). " +
            "Returns ranked results with snippet highlighting. Use this when you need deep operator knowledge.",
        inputSchema: {
            query: z.string().describe("Search query"),
            family: z.enum(["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]).optional()
                .describe("Filter by operator family"),
            limit: z.number().int().min(1).max(20).optional().default(5).describe("Max results"),
        },
    }, async ({ query, family, limit }) => {
        try {
            const data = family
                ? await searchByFamily(query, family, limit ?? 5)
                : await searchKnowledge(query, limit ?? 5);
            return ok({ query, family: family || "all", results: data.results, count: data.total });
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_catalog — Browse the operator catalog
    // ---------------------------------------------------------------------------
    server.registerTool("td_catalog", {
        title: "Browse Operator Catalog",
        description: "Browse the operator catalog: list by family, search by name, get creation defaults. " +
            "7 families supported: TOP, CHOP, SOP, DAT, POP, COMP, MAT.",
        inputSchema: {
            action: z.enum(["list", "search", "get", "stats"]).describe("Action: list (by family), search (by query), get (specific op), stats (counts)"),
            family: z.enum(["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]).optional().describe("Filter by family (for 'list' action)"),
            query: z.string().optional().describe("Search query (for 'search' action)"),
            opType: z.string().optional().describe("Operator type (for 'get' action, e.g. 'particlePOP')"),
        },
    }, async ({ action, family, query, opType }) => {
        try {
            if (action === "stats") {
                const counts = getCatalogCountsByFamily();
                return ok({ action, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
            }
            if (action === "list" && family) {
                const ops = listByFamily(family);
                return ok({ action, family, operators: ops.map(o => ({ opType: o.opType, label: o.label, isExperimental: o.isExperimental })), count: ops.length });
            }
            if (action === "search" && query) {
                const results = searchCatalog(query);
                return ok({ action, query, results: results.slice(0, 20), count: results.length });
            }
            if (action === "get" && opType) {
                const entry = getCatalogEntry(opType);
                if (!entry)
                    return err(new Error(`Operator "${opType}" not found in catalog.`));
                const defaults = getCreationDefaults(opType);
                return ok({ action, entry, creationDefaults: defaults });
            }
            return err(new Error("Invalid action. Use list/surname/get/stats."));
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_get_family_hints — Family inference hints
    // ---------------------------------------------------------------------------
    server.registerTool("td_get_family_hints", {
        title: "Get Family Hints",
        description: "Get family inference hints: which TD operator family (TOP/CHOP/SOP/POP/etc.) matches your keywords. " +
            "Useful for narrowing down operator choices before building.",
        inputSchema: {
            prompt: z.string().describe("Natural language description or keywords"),
        },
    }, async ({ prompt }) => {
        try {
            const bestFamily = getBestFamily(prompt);
            const familyInfo = FAMILY_HINTS.find(f => f.family === bestFamily);
            return ok({
                prompt,
                bestFamily,
                familyInfo: familyInfo ? {
                    family: familyInfo.family,
                    specificity: familyInfo.specificity,
                    aliases: familyInfo.aliases,
                } : null,
                allFamilies: FAMILY_HINTS.map(f => ({ family: f.family, specificity: f.specificity, aliases: f.aliases, score: 0 })),
            });
        }
        catch (e) {
            return err(e);
        }
    });
    // ═══════════════════════════════════════════════════════════════════════════
    // PATCH ENGINE TOOLS — Transactional complex system building
    // ═══════════════════════════════════════════════════════════════════════════
    // Import patch engine lazily to avoid circular deps
    const patchEngine = await import("../patchEngine.js");
    const { runPatchWorkflow, detectComplexityTier, scoreComplexity, previewPatch, applyPatch, generateVariations, planPatch, } = patchEngine;
    // ---------------------------------------------------------------------------
    // td_patch_plan — Plan a complex network patch
    // ---------------------------------------------------------------------------
    server.registerTool("td_patch_plan", {
        title: "Plan Patch (Complex System)",
        description: "Plan a complex network patch with pre-turn context injection. " +
            "Auto-detects complexity (basic/standard/pro tier) and enriches the prompt " +
            "with knowledge base hits, templates, recipes, and resolved operators.",
        inputSchema: {
            prompt: z.string().describe("Natural language description of what to build"),
            target_path: z.string().optional().describe("Container path"),
            dry_run: z.boolean().optional().default(true)
                .describe("Dry run: plan + preview only, no TD changes"),
        },
    }, async ({ prompt, target_path, dry_run }) => {
        try {
            const result = await runPatchWorkflow(client, prompt, target_path || "/", { dryRun: dry_run ?? true });
            return ok(result);
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_patch_preview — Preview what a patch will do
    // ---------------------------------------------------------------------------
    server.registerTool("td_patch_preview", {
        title: "Preview Patch",
        description: "Preview exactly what nodes will be created and how they'll be connected. " +
            "Shows risk level, warnings, and estimated node count.",
        inputSchema: {
            prompt: z.string().describe("Natural language description of what to build"),
            target_path: z.string().optional().describe("Container path"),
        },
    }, async ({ prompt, target_path }) => {
        try {
            const plan = await planPatch(client, prompt, target_path || "/");
            const preview = previewPatch(plan);
            return ok({
                patchId: plan.patchId,
                tier: plan.tier,
                complexityScore: plan.preContext.complexityScore,
                preview,
                preContext: {
                    templates: plan.preContext.templates,
                    recipes: plan.preContext.recipes,
                    resolvedOps: plan.preContext.resolvedOps,
                },
            });
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_patch_apply — Apply a patch with undo-block + auto-rollback
    // ---------------------------------------------------------------------------
    server.registerTool("td_patch_apply", {
        title: "Apply Patch (with Rollback)",
        description: "Apply a planned patch with automatic undo-block wrapping and rollback on failure. " +
            "Snapshots errors before/after — if errors increase, auto-rolls back. " +
            "Runs post-build validation with auto-fix.",
        inputSchema: {
            prompt: z.string().describe("Natural language description of what to build"),
            target_path: z.string().optional().describe("Container path"),
        },
    }, async ({ prompt, target_path }) => {
        try {
            const plan = await planPatch(client, prompt, target_path || "/");
            const result = await applyPatch(client, plan);
            return ok({
                patchId: plan.patchId,
                tier: plan.tier,
                result,
            });
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_patch_variations — Generate alternative approaches
    // ---------------------------------------------------------------------------
    server.registerTool("td_patch_variations", {
        title: "Patch Variations",
        description: "Generate alternative approaches for a patch (Minimal, Alternative operators, Parallel chains). " +
            "Useful when the first approach didn't work or you want to explore options.",
        inputSchema: {
            prompt: z.string().describe("Natural language description of what to build"),
            count: z.number().int().min(1).max(5).optional().default(3)
                .describe("Number of variations"),
        },
    }, async ({ prompt, count }) => {
        try {
            const plan = await planPatch(client, prompt);
            const variations = generateVariations(plan, count ?? 3);
            return ok({
                basePatchId: plan.patchId,
                variations: variations.map((v) => ({
                    patchId: v.patchId,
                    description: v.description,
                    differences: v.differences,
                    nodeCount: v.graph.nodes.length,
                    connectionCount: v.graph.connections.length,
                })),
                count: variations.length,
            });
        }
        catch (e) {
            return err(e);
        }
    });
    // ---------------------------------------------------------------------------
    // td_complexity_check — Check complexity of a prompt
    // ---------------------------------------------------------------------------
    server.registerTool("td_complexity_check", {
        title: "Check Complexity",
        description: "Analyze a prompt for complexity: returns tier (basic/standard/pro), " +
            "complexity score (0-100), detected triggers, and recommended approach.",
        inputSchema: {
            prompt: z.string().describe("Natural language description to analyze"),
        },
    }, async ({ prompt }) => {
        try {
            const tier = detectComplexityTier(prompt);
            const score = scoreComplexity(prompt);
            const preCtx = await patchEngine.gatherPreTurnContext(prompt);
            let recommendation = "";
            if (tier === "pro") {
                recommendation = "Use td_patch_plan for full transactional workflow with preview and rollback.";
            }
            else if (tier === "standard") {
                recommendation = "Use td_network_plan for graph-based planning, or td_patch_plan for extra safety.";
            }
            else {
                recommendation = "Simple enough for direct td_create_operator + td_connect_nodes calls.";
            }
            return ok({
                prompt,
                tier,
                complexityScore: score,
                recommendation,
                preContext: {
                    matchingTemplates: preCtx.templates,
                    matchingRecipes: preCtx.recipes,
                    resolvedOps: preCtx.resolvedOps.map((o) => o.opType),
                },
            });
        }
        catch (e) {
            return err(e);
        }
    });
}
