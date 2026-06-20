/**
 * LLM Graph Planner — Uses LLM to plan TouchDesigner networks
 *
 * Extracted from networkPlannerGraph.ts. Uses the topology catalog
 * to generate structured network graphs via LLM, with deterministic
 * fallback on failure.
 */

import type { OpTopology, GraphNode, GraphConnection, NetworkGraph } from "./topologyData.js";
import { createLlmClientFromEnv, type LlmInput } from "./llm.js";
import { deterministicPlan } from "./plannerDeterministic.js";

// ─── LLM Prompt Formatting ────────────────────────────────────────────────

function formatTopologyForPrompt(catalog: Map<string, OpTopology>): string {
  const lines: string[] = [];
  const byFamily = new Map<string, OpTopology[]>();

  catalog.forEach((topo: OpTopology) => {
    const existing = byFamily.get(topo.family) || [];
    existing.push(topo);
    byFamily.set(topo.family, existing);
  });

  byFamily.forEach((ops: OpTopology[], family: string) => {
    lines.push(`\n## ${family} Operators`);
    for (const op of ops.slice(0, 30)) {
      const inputStr = op.isMultiInput
        ? `${op.inputCount}+ inputs`
        : `${op.inputCount} input(s)`;
      const warns = op.warnings.length > 0
        ? ` ⚠️ ${op.warnings.join("; ")}`
        : "";
      lines.push(`- **${op.opType}** (${op.label}): ${inputStr}${warns}`);

      if (op.commonCombinations.length > 0) {
        for (const cc of op.commonCombinations.slice(0, 2)) {
          lines.push(`  - Commonly used with: ${cc.operators.join(" → ")} (${cc.description})`);
        }
      }
    }
  });

  return lines.join("\n");
}

// ─── System Prompt ─────────────────────────────────────────────────────────

const NETWORK_PLAN_SYSTEM_PROMPT = `You are a TouchDesigner network planning expert. Given a natural language description and a catalog of available operators with their input/output topology, you must produce a valid network graph in JSON format.

## RULES
1. Every connection MUST specify the exact target input index (inputIndex).
2. Multi-input operators (compositeTOP, mergeCHOP, overTOP, mergePOP, blendPOP, copyPOP) need connections to DIFFERENT input indices.
3. Source nodes go LOW input indices → target nodes get HIGHER input indices.
4. A single source can branch to multiple targets.
5. Nodes that produce output (sources, textures) connect TO chains of filter/mix nodes.
6. The final node in a chain should typically be a nullTOP/nullCHOP/nullPOP.
7. Use the correct opType case (camelCase like noiseTOP, blurTOP, mathCHOP, particlePOP).
8. TOP chains typically follow: source → filter(s) → composite/blend → output.
9. CHOP chains typically follow: source → math/filter → merge → output.

## POP-SPECIFIC RULES (CRITICAL — follow exactly)
10. POP chains ALWAYS follow: source POP → forces → solver → output nullPOP.
    Example: spherePOP → noisePOP → particlePOP → trailPOP → nullPOP
11. particlePOP REQUIRES a feedback loop: particlePOP → nullPOP → feedbackPOP → particlePOP.
    Set particlePOP.particlesupdatepop to the nullPOP name.
12. POP→SOP connection requires renderPOP or geometryCOMP bridge — never connect POP directly to SOP.
13. GLSL POP requires matching attribute declarations (P, Vel, Cd) — ensure attributePOP initializes Vel before glslPOP.
14. Never connect POP directly to TOP/CHOP/DAT without adapter operators.
15. feedbackPOP target MUST be a nullPOP downstream, not a COMP or TOP.
16. For instancing: POP output connects to geometryCOMP → renderTOP, not directly to renderPOP.
17. noisePOP/forcePOP/turbulencePOP need input connections — they apply forces to existing point clouds.
18. copyPOP needs two inputs: source geometry (input 0) and template geometry (input 1).
19. neighborPOP is performance-sensitive — limit neighbor count for large point clouds (>100K points).
20. fieldPOP creates proximity fields — place near attractor/repulsor geometry.
21. deletePOP removes points by condition — connect to the chain after simulation, before render.
22. blendPOP blends two POP chains — use 'add' mode for additive trails, 'max' for maximum.

## OUTPUT FORMAT
Return ONLY valid JSON, no markdown, no explanation:
{
  "description": "What this network does",
  "nodes": [
    { "id": "unique_id", "opType": "noiseTOP", "label": "Noise", "parentPath": "/project1", "parameters": {} }
  ],
  "connections": [
    { "from": "noise_src", "to": "blur_fx", "inputIndex": 0 }
  ]
}`;

// ─── LLM Planning ─────────────────────────────────────────────────────────

/**
 * Plan a network graph using the LLM.
 * Falls back to deterministic planning if LLM is unavailable.
 */
export async function llmPlanNetwork(
  prompt: string,
  catalog: Map<string, OpTopology>,
  targetPath: string,
): Promise<NetworkGraph> {
  const topologyStr = formatTopologyForPrompt(catalog);

  const userPrompt = `Plan a TouchDesigner network for this request:

"${prompt}"

Target path: ${targetPath}

Available operators:
${topologyStr}

Generate the network graph JSON.`;

  try {
    const llm = createLlmClientFromEnv();
    const input: LlmInput = {
      system: NETWORK_PLAN_SYSTEM_PROMPT,
      user: userPrompt,
    };
    const result = await llm.generateText(input);

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = result.text.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const llmGraph = JSON.parse(jsonStr);

    // Validate and normalize
    const nodes: GraphNode[] = (llmGraph.nodes || []).map((n: any, i: number) => ({
      id: n.id || `n${i}`,
      opType: n.opType || "nullTOP",
      label: n.label || n.opType || `node_${i}`,
      parentPath: n.parentPath || targetPath,
      x: n.x,
      y: n.y,
      parameters: n.parameters || {},
    }));

    const connections: GraphConnection[] = (llmGraph.connections || []).map((c: any) => ({
      from: c.from,
      to: c.to,
      inputIndex: c.inputIndex ?? 0,
      sourceOutput: c.sourceOutput || "output",
    }));

    return {
      description: llmGraph.description || prompt,
      nodes,
      connections,
      targetPath,
    };
  } catch (e: any) {
    console.warn(`[plannerLlm] LLM planning failed: ${e.message}. Using deterministic fallback.`);
    return deterministicPlan(prompt, catalog, targetPath);
  }
}
