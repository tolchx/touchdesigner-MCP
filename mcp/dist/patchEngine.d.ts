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
import { type NetworkGraph } from "./networkPlannerGraph.js";
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
    knowledgeHits: Array<{
        title: string;
        snippet: string;
    }>;
    /** Resolved operator types */
    resolvedOps: Array<{
        opType: string;
        label: string;
    }>;
    /** Best family guess */
    bestFamily: string;
    /** Complexity score (0-100) */
    complexityScore: number;
}
export interface PatchPreview {
    patchId: string;
    /** What will be created */
    nodesWillCreate: Array<{
        opType: string;
        label: string;
        parent: string;
    }>;
    /** What will be connected */
    connectionsWillMake: Array<{
        from: string;
        to: string;
        inputIndex: number;
    }>;
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
    created: string[];
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
/**
 * Detect complexity tier from a prompt.
 * Pro tier: multi-step, feedback, GPU compute, simulations.
 * Standard tier: shaders, composites, effects.
 * Basic tier: simple node creation, parameter changes.
 */
export declare function detectComplexityTier(prompt: string): ComplexityTier;
/**
 * Score complexity (0-100) for more granular control.
 */
export declare function scoreComplexity(prompt: string): number;
/**
 * Gather pre-turn context: knowledge hits, templates, recipes, operator resolution.
 * This is injected into the planning phase so the LLM has everything it needs.
 */
export declare function gatherPreTurnContext(prompt: string): Promise<PreTurnContext>;
/**
 * Plan a patch with pre-turn context injection.
 * Higher tier → more tokens, more knowledge context, more thorough planning.
 */
export declare function planPatch(client: TDClient, prompt: string, targetPath?: string): Promise<PatchPlan>;
/**
 * Generate a human-readable preview of what the patch will do.
 * Shows exactly what nodes will be created and how they'll be connected.
 */
export declare function previewPatch(plan: PatchPlan): PatchPreview;
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
export declare function applyPatch(client: TDClient, plan: PatchPlan): Promise<PatchResult>;
/**
 * Generate variations of a patch plan.
 * Useful for exploring different approaches to the same problem.
 */
export declare function generateVariations(plan: PatchPlan, count?: number): PatchVariation[];
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
export declare function runPatchWorkflow(client: TDClient, prompt: string, targetPath?: string, options?: {
    /** Skip apply and just return plan + preview */
    dryRun?: boolean;
    /** Number of variations to generate */
    variationCount?: number;
    /** Force a specific tier */
    forceTier?: ComplexityTier;
}): Promise<PatchWorkflowResult>;
