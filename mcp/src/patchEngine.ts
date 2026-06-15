/**
 * Patch Engine — Transactional Complex System Builder
 *
 * Core architectural improvements migrated from TDPilot, Embody, and satoruhiga:
 *
 *   CORE 1: Patch System
 *     plan → preview → apply(undo-block) → validate → variations
 *     Transactional, reversible, iterative workflow for complex networks.
 *
 *   CORE 2: Auto-Rollback
 *     Every batch wrapped in TD ui.undo.startBlock(). Error-diff after batch.
 *     If errors INCREASED, auto-rollback. Clean state guarantee.
 *
 *   CORE 3: Pro Tier Detection
 *     Detects complexity keywords (feedback, loop, particle system, solver, etc.)
 *     and escalates reasoning tier + injects pre-turn knowledge context.
 */

import type { TDClient } from "td-api";
import { planNetworkGraph, type NetworkGraph } from "./networkPlannerGraph.js";
import { buildVerifyFix } from "./buildVerifyFix.js";
import { searchKnowledge } from "./knowledgeBrain.js";
import { resolvePrompt, searchTemplates } from "./networkTemplates.js";
import { searchRecipes } from "./builderRecipes.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export type ComplexityTier = "basic" | "standard" | "pro";

export interface PatchPlan {
  /** Unique patch ID */
  patchId: string;
  /** Human description */
  description: string;
  /** Inferred complexity tier */
  tier: ComplexityTier;
  /** The network graph to create */
  graph: NetworkGraph;
  /** Pre-turn context injected for better planning */
  preContext: PreTurnContext;
}

export interface PreTurnContext {
  /** Matching templates */
  templates: string[];
  /** Matching recipes */
  recipes: string[];
  /** Relevant knowledge base hits */
  knowledgeHits: Array<{ title: string; snippet: string }>;
  /** Resolved operator types */
  resolvedOps: Array<{ opType: string; label: string }>;
  /** Best family guess */
  bestFamily: string;
  /** Complexity score (0-100) */
  complexityScore: number;
}

export interface PatchPreview {
  patchId: string;
  /** What will be created */
  nodesWillCreate: Array<{ opType: string; label: string; parent: string }>;
  /** What will be connected */
  connectionsWillMake: Array<{ from: string; to: string; inputIndex: number }>;
  /** Estimated node count */
  estimatedNodeCount: number;
  /** Risk assessment */
  riskLevel: "low" | "medium" | "high";
  /** Things to watch out for */
  warnings: string[];
}

export interface PatchResult {
  patchId: string;
  success: boolean;
  /** Nodes actually created */
  created: string[]; // TD paths
  /** Connections actually made */
  connected: string[];
  /** Errors during application */
  errors: string[];
  /** Rollback performed? */
  rolledBack: boolean;
  /** Post-validation result */
  validation?: {
    ok: boolean;
    issueCount: number;
    summary: string;
  };
}

export interface PatchVariation {
  patchId: string;
  variationIndex: number;
  description: string;
  graph: NetworkGraph;
  /** What's different from the base plan */
  differences: string[];
}

// ─── Complexity Detection ──────────────────────────────────────────────────

const COMPLEXITY_TRIGGERS: Record<string, ComplexityTier> = {
  // Structural complexity (pro tier)
  "feedback": "pro",
  "feedback loop": "pro",
  "solver": "pro",
  "solver loop": "pro",
  "particle system": "pro",
  "particles": "pro",
  "gpu compute": "pro",
  "compute shader": "pro",
  "reaction-diffusion": "pro",
  "raymarch": "pro",
  "path trace": "pro",
  "pathtrace": "pro",
  "fluid": "pro",
  "fluid simulation": "pro",
  "sph": "pro",
  "boids": "pro",
  "flocking": "pro",
  "instancing": "pro",
  "multi-pass": "pro",
  "pipeline": "pro",
  "multi-layer": "pro",

  // Medium complexity
  "audio reactive": "standard",
  "glsl": "standard",
  "shader": "standard",
  "composite": "standard",
  "blend": "standard",
  "bloom": "standard",
  "glow": "standard",
  "trail": "standard",
  "kaleidoscope": "standard",
  "edge detect": "standard",
  "chroma": "standard",
};

/**
 * Detect complexity tier from a prompt.
 * Pro tier: multi-step, feedback, GPU compute, simulations.
 * Standard tier: shaders, composites, effects.
 * Basic tier: simple node creation, parameter changes.
 */
export function detectComplexityTier(prompt: string): ComplexityTier {
  const lower = prompt.toLowerCase();

  // Check triggers from most specific to least
  for (const [trigger, tier] of Object.entries(COMPLEXITY_TRIGGERS)) {
    if (lower.includes(trigger)) {
      return tier;
    }
  }

  // Heuristic: count operators mentioned
  const resolved = resolvePrompt(prompt);
  const opCount = resolved.allOperatorTypes.length;

  if (opCount >= 5) return "standard";
  if (opCount >= 3) return "standard";

  return "basic";
}

/**
 * Score complexity (0-100) for more granular control.
 */
export function scoreComplexity(prompt: string): number {
  const lower = prompt.toLowerCase();
  let score = 0;

  // Structural complexity keywords
  const proKeywords = ["feedback", "loop", "solver", "simulation", "gpu", "compute",
    "reaction", "diffusion", "raymarch", "pathtrace", "fluid", "sph", "boids",
    "flocking", "instancing", "pipeline", "multi-pass", "particle"];
  const medKeywords = ["shader", "glsl", "composite", "blend", "bloom", "glow",
    "trail", "kaleidoscope", "edge", "chroma", "audio", "displace", "transform"];

  for (const kw of proKeywords) {
    if (lower.includes(kw)) score += 12;
  }
  for (const kw of medKeywords) {
    if (lower.includes(kw)) score += 6;
  }

  // Operator count increases complexity
  const resolved = resolvePrompt(prompt);
  score += Math.min(resolved.allOperatorTypes.length * 5, 30);

  return Math.min(score, 100);
}

// ─── Pre-Turn Context Injection ────────────────────────────────────────────

/**
 * Gather pre-turn context: knowledge hits, templates, recipes, operator resolution.
 * This is injected into the planning phase so the LLM has everything it needs.
 */
export async function gatherPreTurnContext(prompt: string): Promise<PreTurnContext> {
  // Resolve operator types
  const resolved = resolvePrompt(prompt);

  // Search knowledge base
  let knowledgeHits: Array<{ title: string; snippet: string }> = [];
  try {
    const searchResults = await searchKnowledge(prompt, 4);
    knowledgeHits = ((searchResults as any)?.results || []).map((r: any) => ({
      title: r.title || r.name || "",
      snippet: r.snippet || r.summary || r.content?.substring(0, 200) || "",
    }));
  } catch {
    // Knowledge base might not be built yet — that's OK
  }

  // Find matching templates
  const templateMatches = searchTemplates(prompt).map((t: any) => t.name || "");
  const recipeMatches = searchRecipes(prompt).map((r: any) => r.name || "");

  return {
    templates: templateMatches.slice(0, 3),
    recipes: recipeMatches.slice(0, 3),
    knowledgeHits: knowledgeHits.slice(0, 4),
    resolvedOps: resolved.allOperatorTypes.map((o: any) => ({
      opType: o.opType || o.type || "",
      label: o.label || o.name || "",
    })),
    bestFamily: resolved.family || "TOP",
    complexityScore: scoreComplexity(prompt),
  };
}

// ─── Patch Plan ────────────────────────────────────────────────────────────

/**
 * Plan a patch with pre-turn context injection.
 * Higher tier → more tokens, more knowledge context, more thorough planning.
 */
export async function planPatch(
  client: TDClient,
  prompt: string,
  targetPath: string = "/",
): Promise<PatchPlan> {
  const tier = detectComplexityTier(prompt);
  const preContext = await gatherPreTurnContext(prompt);

  // Build an enriched prompt with pre-turn context
  let enrichedPrompt = prompt;

  if (preContext.templates.length > 0) {
    enrichedPrompt += `\n\nRelevant templates: ${preContext.templates.join(", ")}`;
  }
  if (preContext.recipes.length > 0) {
    enrichedPrompt += `\n\nRelevant recipes: ${preContext.recipes.join(", ")}`;
  }
  if (preContext.resolvedOps.length > 0) {
    enrichedPrompt += `\n\nResolved operators: ${preContext.resolvedOps.map(o => o.opType).join(", ")}`;
  }

  // Plan the network graph (uses LLM when available)
  const result = await planNetworkGraph({
    td: client,
    prompt: enrichedPrompt,
    targetPath,
    useLlm: tier === "pro" || tier === "standard", // Use LLM for non-trivial plans
    apply: false, // Dry-run — we'll preview first
  });

  const graph = result.graph!;
  const patchId = `patch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    patchId,
    description: prompt,
    tier,
    graph,
    preContext,
  };
}

// ─── Patch Preview ─────────────────────────────────────────────────────────

/**
 * Generate a human-readable preview of what the patch will do.
 * Shows exactly what nodes will be created and how they'll be connected.
 */
export function previewPatch(plan: PatchPlan): PatchPreview {
  const warnings: string[] = [];
  let riskLevel: "low" | "medium" | "high" = "low";

  // Assess risk
  if (plan.tier === "pro") {
    riskLevel = "high";
    warnings.push("Complex system with feedback/simulation — verify after application");
  } else if (plan.graph.nodes.length > 8) {
    riskLevel = "medium";
    warnings.push(`Large network (${plan.graph.nodes.length} nodes) — consider building incrementally`);
  } else if (plan.tier === "standard") {
    riskLevel = "medium";
  }

  // Check for known risky patterns
  const nodeTypes = plan.graph.nodes.map(n => n.opType);
  if (nodeTypes.some(t => t.includes("feedback"))) {
    warnings.push("Feedback TOP requires 'top' parameter set to the target source");
  }
  if (nodeTypes.some(t => t.includes("particle"))) {
    warnings.push("Particle POP requires Target Feedback Loop POP parameter to be set");
  }
  if (nodeTypes.some(t => t.includes("glsl"))) {
    warnings.push("GLSL operators need uniforms set via Values page, not direct wires");
  }

  // Check for unconnected nodes
  const connectedIds = new Set<string>();
  for (const c of plan.graph.connections) {
    connectedIds.add(c.from);
    connectedIds.add(c.to);
  }
  const unconnected = plan.graph.nodes.filter(n => !connectedIds.has(n.id));
  if (unconnected.length > 0) {
    warnings.push(`${unconnected.length} node(s) have no connections: ${unconnected.map(n => n.label).join(", ")}`);
  }

  return {
    patchId: plan.patchId,
    nodesWillCreate: plan.graph.nodes.map(n => ({
      opType: n.opType,
      label: n.label,
      parent: n.parentPath,
    })),
    connectionsWillMake: plan.graph.connections.map(c => ({
      from: plan.graph.nodes.find(n => n.id === c.from)?.label || c.from,
      to: plan.graph.nodes.find(n => n.id === c.to)?.label || c.to,
      inputIndex: c.inputIndex,
    })),
    estimatedNodeCount: plan.graph.nodes.length,
    riskLevel,
    warnings,
  };
}

// ─── Patch Apply (with Auto-Rollback) ──────────────────────────────────────

/**
 * Apply a patch WITH auto-rollback on failure.
 *
 * Process:
 * 1. Snapshot errors before
 * 2. Start TD undo block
 * 3. Create all nodes
 * 4. Wire all connections
 * 5. End undo block
 * 6. Snapshot errors after
 * 7. If errors INCREASED → undo rollback
 * 8. Validate
 */
export async function applyPatch(
  client: TDClient,
  plan: PatchPlan,
): Promise<PatchResult> {
  const patchId = plan.patchId;
  const created: string[] = [];
  const connectedList: string[] = [];
  const errors: string[] = [];
  let rolledBack = false;

  // Step 1: Snapshot errors before
  let errorsBefore = 0;
  try {
    const healthBefore = await client.healthcheck(plan.graph.targetPath, true);
    errorsBefore = (healthBefore as any)?.issueCount ?? 0;
  } catch {
    // Healthcheck might fail if path doesn't exist yet
  }

  // Step 2: Start undo block
  try {
    await client.execute(
      "ui.undo.startBlock('MCP Patch: ' + repr('" + plan.description.replace(/'/g, "\\'") + "'))",
      "/",
    );
  } catch (e: any) {
    errors.push(`Undo block start failed: ${e.message}`);
  }

  // Step 3 & 4: Create nodes + wire connections
  const pathMap = new Map<string, string>();

  // Create all nodes
  for (const node of plan.graph.nodes) {
    try {
      const result = await client.createOperator(
        node.opType,
        node.label,
        node.parentPath,
        node.x,
        node.y,
      );
      const tdPath = (result as any)?.path || `${node.parentPath}/${node.label}`;
      pathMap.set(node.id, tdPath);
      created.push(tdPath);
    } catch (e: any) {
      errors.push(`Create ${node.opType} "${node.label}": ${e.message}`);
    }
  }

  // Wire all connections
  for (const conn of plan.graph.connections) {
    const sourcePath = pathMap.get(conn.from);
    const targetPath = pathMap.get(conn.to);
    if (!sourcePath || !targetPath) continue;

    try {
      await client.connectNodes(sourcePath, targetPath, conn.inputIndex);
      connectedList.push(`${conn.from}→${conn.to}[${conn.inputIndex}]`);
    } catch (e: any) {
      errors.push(`Wire ${conn.from}→${conn.to}[${conn.inputIndex}]: ${e.message}`);
    }
  }

  // Step 5: End undo block
  try {
    await client.execute("ui.undo.endBlock()", "/");
  } catch {
    // Best effort
  }

  // Step 6: Snapshot errors after
  let errorsAfter = 0;
  try {
    const healthAfter = await client.healthcheck(plan.graph.targetPath, true);
    errorsAfter = (healthAfter as any)?.issueCount ?? 0;
  } catch {
    // Healthcheck might fail
  }

  // Step 7: Auto-rollback if errors increased
  if (errorsAfter > errorsBefore && errorsAfter > 0) {
    try {
      await client.execute("ui.undo.undo()", "/");
      rolledBack = true;
      errors.push(
        `AUTO-ROLLBACK: Errors increased from ${errorsBefore} to ${errorsAfter}. Changes reverted.`,
      );
    } catch (e: any) {
      errors.push(`Rollback failed: ${e.message}`);
    }
  }

  // Step 8: Validate
  let validation: PatchResult["validation"] | undefined;
  if (!rolledBack) {
    try {
      const verify = await buildVerifyFix({
        client,
        path: plan.graph.targetPath,
        autoFix: true,
        verifyConnections: true,
      });
      validation = {
        ok: verify.ok,
        issueCount: verify.issueCount,
        summary: verify.summary,
      };
    } catch (vErr: any) {
      errors.push(`Validation: ${vErr.message}`);
    }
  }

  return {
    patchId,
    success: !rolledBack && errors.length === 0,
    created,
    connected: connectedList,
    errors,
    rolledBack,
    validation,
  };
}

// ─── Patch Variations ──────────────────────────────────────────────────────

/**
 * Generate variations of a patch plan.
 * Useful for exploring different approaches to the same problem.
 */
export function generateVariations(plan: PatchPlan, count: number = 3): PatchVariation[] {
  const variations: PatchVariation[] = [];

  const strategies = [
    {
      name: "Minimal",
      description: "Simplest possible version with fewer nodes",
      nodeFilter: (nodes: any[]) => nodes.filter((_, i) => i % 2 === 0 || i === nodes.length - 1),
    },
    {
      name: "Alternative operators",
      description: "Using different operator types for the same effect",
      nodeMapper: (n: any) => {
        // Try alternatives based on opType
        const altMap: Record<string, string> = {
          "compositeTOP": "overTOP",
          "overTOP": "compositeTOP",
          "blurTOP": "antialiasTOP",
          "antialiasTOP": "blurTOP",
          "mathCHOP": "mathCHOP", // No good alternative, keep
          "levelTOP": "lookupTOP",
          "lookupTOP": "levelTOP",
        };
        const alt = altMap[n.opType];
        return alt ? { ...n, opType: alt, label: `Alt_${n.label}` } : n;
      },
    },
    {
      name: "Parallel chains",
      description: "Split into parallel processing chains",
      nodeMapper: (n: any, i: number) => ({
        ...n,
        label: `${n.label}_${i % 2 === 0 ? "A" : "B"}`,
        parentPath: n.parentPath,
      }),
    },
  ];

  for (let i = 0; i < Math.min(count, strategies.length); i++) {
    const strategy = strategies[i];
    const variantNodes = strategy.nodeFilter
      ? strategy.nodeFilter([...plan.graph.nodes])
      : strategy.nodeMapper
        ? [...plan.graph.nodes].map(strategy.nodeMapper)
        : [...plan.graph.nodes];

    const variantGraph: NetworkGraph = {
      description: `${plan.graph.description} (${strategy.name} variation)`,
      nodes: variantNodes,
      connections: plan.graph.connections.filter(c =>
        variantNodes.some(n => n.id === c.from) && variantNodes.some(n => n.id === c.to)
      ),
      targetPath: plan.graph.targetPath,
    };

    variations.push({
      patchId: `${plan.patchId}_v${i + 1}`,
      variationIndex: i + 1,
      description: strategy.description,
      graph: variantGraph,
      differences: [`Strategy: ${strategy.name}`, `${variantNodes.length} nodes (vs ${plan.graph.nodes.length} original)`],
    });
  }

  return variations;
}

// ─── Full Patch Workflow ───────────────────────────────────────────────────

export interface PatchWorkflowResult {
  plan: PatchPlan;
  preview: PatchPreview;
  result?: PatchResult;
  variations: PatchVariation[];
  /** Suggested next steps */
  nextSteps: string[];
}

/**
 * Run the complete patch workflow: plan → preview → apply → validate → variations.
 * This is the main entry point for complex system building.
 */
export async function runPatchWorkflow(
  client: TDClient,
  prompt: string,
  targetPath: string = "/",
  options: {
    /** Skip apply and just return plan + preview */
    dryRun?: boolean;
    /** Number of variations to generate */
    variationCount?: number;
    /** Force a specific tier */
    forceTier?: ComplexityTier;
  } = {},
): Promise<PatchWorkflowResult> {
  const { dryRun = false, variationCount = 3, forceTier } = options;

  // Phase 1: Plan
  const plan = await planPatch(client, prompt, targetPath);
  if (forceTier) plan.tier = forceTier;

  // Phase 2: Preview
  const preview = previewPatch(plan);

  // Phase 3: Apply (if not dry run)
  let result: PatchResult | undefined;
  if (!dryRun) {
    result = await applyPatch(client, plan);
  }

  // Phase 4: Variations
  const variations = generateVariations(plan, variationCount);

  // Phase 5: Next steps
  const nextSteps: string[] = [];
  if (result?.rolledBack) {
    nextSteps.push("⚠️ Patch was rolled back due to errors. Review the errors and try a variation.");
    nextSteps.push("Try td_patch_variations to see alternative approaches.");
  } else if (result?.success) {
    nextSteps.push("✅ Patch applied successfully.");
    if (result.validation && !result.validation.ok) {
      nextSteps.push(`🔧 Run td_validate to fix ${result.validation.issueCount} remaining issues.`);
    }
    nextSteps.push("Run td_get_screenshot to see the result.");
  } else if (dryRun) {
    nextSteps.push("📋 This was a dry run. Set dryRun=false to apply.");
    nextSteps.push(`Preview shows ${preview.estimatedNodeCount} nodes, risk level: ${preview.riskLevel}.`);
    if (preview.warnings.length > 0) {
      nextSteps.push(`⚠️ ${preview.warnings.length} warning(s) to review.`);
    }
    nextSteps.push("Use td_patch_apply to execute this plan.");
  }

  return {
    plan,
    preview,
    result,
    variations,
    nextSteps,
  };
}
