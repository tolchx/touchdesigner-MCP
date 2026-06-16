/**
 * Network Planner Graph — Topology-Aware Network Planning
 *
 * Replaces the linear-chain planner with a graph-based approach that:
 *   1. Understands operator input/output topology (multi-input, branching, feedback)
 *   2. Uses LLM for complex planning (with deterministic fallback)
 *   3. Generates structured graphs with nodes + connections (including input indices)
 *   4. Applies plans to TouchDesigner with iterative build-verify-fix
 *
 * Level 1 — Core graph planner with LLM integration.
 */

import type { TDClient } from "td-api";
import { ensureKnowledgeLoaded, getOpsMap, getPopsMap, getSearchIndex } from "./knowledgeCache.js";
import { createLlmClientFromEnv, type LlmInput } from "./llm.js";
import { buildVerifyFix, verifyAndFixConnections } from "./buildVerifyFix.js";

// Re-export for backward compatibility
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GraphNode {
  /** Unique ID within this graph (e.g., "n0", "noise_src") */
  id: string;
  /** TD operator type (e.g., "noiseTOP", "compositeTOP", "particlePOP") */
  opType: string;
  /** Human-readable label */
  label: string;
  /** Parent path in TD */
  parentPath: string;
  /** Optional position */
  x?: number;
  y?: number;
  /** Key parameters to set after creation */
  parameters?: Record<string, unknown>;
}

export interface GraphConnection {
  /** Source node ID */
  from: string;
  /** Target node ID */
  to: string;
  /** Target input index (default: 0) */
  inputIndex: number;
  /** Optional source output name */
  sourceOutput?: string;
}

export interface NetworkGraph {
  /** Human description of what this graph does */
  description: string;
  /** Nodes to create */
  nodes: GraphNode[];
  /** Connections to wire after creation */
  connections: GraphConnection[];
  /** Target container path */
  targetPath: string;
  /** Optional container name */
  containerName?: string;
}

export interface PlanResult {
  success: boolean;
  graph?: NetworkGraph;
  message?: string;
  error?: string;
  /** Number of nodes created */
  createdCount?: number;
  /** Number of connections wired */
  connectedCount?: number;
}

// ─── Operator Topology Data ────────────────────────────────────────────────

interface OpTopology {
  opType: string;
  family: string;
  label: string;
  /** Number of inputs the operator accepts */
  inputCount: number;
  /** Descriptions of each input */
  inputs: Array<{ index: number; description: string; accepts?: string }>;
  /** Types of outputs produced */
  outputs: Array<{ name: string; type: string }>;
  /** Common operators this connects to */
  connectsTo: string[];
  /** Is this a multi-input operator? */
  isMultiInput: boolean;
  /** Warning: needs specific setup (e.g., feedback target) */
  warnings: string[];
  /** Common combinations from the knowledge base */
  commonCombinations: Array<{ operators: string[]; description: string }>;
}

// ─── Topology data path resolution ─────────────────────────────────────────

function getTopologyDataDir(): string {
  // When running from dist/, data is at ../data relative to the source
  // When running compiled, it's ../data relative to dist/
  try {
    const { resolve, dirname } = require("node:path") as typeof import("node:path");
    // Try dist/ first (compiled), then src/ (dev)
    const candidates = [
      resolve(__dirname ?? ".", "../data"),
      resolve(__dirname ?? ".", "../../data"),
      resolve(process.cwd(), "data"),
    ];
    const fs = require("node:fs") as typeof import("node:fs");
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } catch { /* fallthrough */ }
  // Fallback: relative to process
  return "./data";
}

// ─── Topology inference ────────────────────────────────────────────────────

/**
 * Input count inference by family and type.
 * Many operators accept unlimited inputs (maxInputs === -1 means "many").
 * This is conservative — assumes 1 unless we know otherwise.
 */
const MULTI_INPUT_PATTERNS: Record<string, { min: number; max: number }> = {
  // TOPs
  compositeTOP: { min: 2, max: -1 },
  addTOP: { min: 2, max: -1 },
  overTOP: { min: 2, max: -1 },
  multiplyTOP: { min: 2, max: -1 },
  subtractTOP: { min: 2, max: -1 },
  differenceTOP: { min: 2, max: -1 },
  matteTOP: { min: 2, max: -1 },
  insideTOP: { min: 2, max: -1 },
  outsideTOP: { min: 2, max: -1 },
  switchTOP: { min: 1, max: -1 },
  layoutTOP: { min: 1, max: -1 },
  // CHOPs
  mathCHOP: { min: 1, max: -1 },
  mergeCHOP: { min: 2, max: -1 },
  switchCHOP: { min: 1, max: -1 },
  // SOPs
  mergeSOP: { min: 2, max: -1 },
  switchSOP: { min: 1, max: -1 },
  // DATs
  mergeDAT: { min: 2, max: -1 },
  switchDAT: { min: 1, max: -1 },
  // POPs
  mergePOP: { min: 2, max: -1 },
  blendPOP: { min: 2, max: -1 },
  feedbackPOP: { min: 1, max: 1 },
  particlePOP: { min: 1, max: 1 },
  copyPOP: { min: 2, max: -1 },
  deletePOP: { min: 1, max: 1 },
  limitPOP: { min: 1, max: 1 },
  neighborPOP: { min: 1, max: 1 },
  switchPOP: { min: 1, max: -1 },
  attributePOP: { min: 1, max: 1 },
  colorPOP: { min: 1, max: 1 },
  analyzePOP: { min: 1, max: 1 },
  normalizePOP: { min: 1, max: 1 },
  transformPOP: { min: 1, max: 1 },
  fieldPOP: { min: 1, max: 1 },
  sprinklePOP: { min: 1, max: 1 },
};

const SINGLE_INPUT_PATTERNS = new Set([
  "blurTOP", "levelTOP", "transformTOP", "lookupTOP", "displaceTOP",
  "rampTOP", "cropTOP", "edgeTOP", "cornerPinTOP", "tileTOP",
  "glslTOP", "feedbackTOP", "cacheTOP", "chromaKeyTOP", "lumakeyerTOP",
  "hsvadjustTOP", "hsvTOP", "monoTOP", "rgbkeyTOP", "thresholdTOP",
  "reorderTOP", "resolutionTOP", "constantTOP", "noiseTOP",
  "textTOP", "moviefileinTOP", "moviefileoutTOP", "nullTOP",
  "outTOP", "inTOP", "infoTOP", "selectTOP",
  "lagCHOP", "filterCHOP", "audioCHOP", "audiofileinCHOP",
  "audioDeviceInCHOP", "oscCHOP", "noiseCHOP", "constantCHOP",
  "lfoCHOP", "countCHOP", "speedCHOP", "timerCHOP",
  "nullCHOP", "outCHOP", "inCHOP", "selectCHOP",
  "noiseSOP", "gridSOP", "sphereSOP", "circleSOP", "tubeSOP",
  "boxSOP", "textSOP", "transformSOP", "nullSOP",
  "textDAT", "tableDAT", "scriptDAT", "executeDAT",
  "nullDAT", "selectDAT",
  "gridPOP", "spherePOP", "noisePOP", "forcePOP",
  "forceRadialPOP", "turbulencePOP", "dragPOP", "colorPOP",
  "spritePOP", "trailPOP", "lookupPOP",
  "glslPOP", "glslCreatePOP", "glslAdvancedPOP",
  "patternPOP", "attributePOP", "analyzePOP",
  "nullPOP", "outPOP", "inPOP", "selectPOP",
  "renderPOP", "cachePOP",
  "transformPOP", "normalizePOP", "sortPOP",
  "copyPOP", "deletePOP", "limitPOP", "blendPOP",
  "sprinklePOP", "boxPOP", "circlePOP", "tubePOP",
  "torusPOP", "linePOP", "pointPOP",
  "glslCreatePOP", "glslAdvancedPOP",
]);

/**
 * Infer topology data for a given operator from the knowledge base
 * and pattern tables.
 */
function inferOpTopology(
  opType: string,
  opData: any,
): OpTopology {
  const family = opData?.family
    || (opType.endsWith("TOP") ? "TOP"
      : opType.endsWith("CHOP") ? "CHOP"
      : opType.endsWith("SOP") ? "SOP"
      : opType.endsWith("DAT") ? "DAT"
      : opType.endsWith("POP") ? "POP"
      : opType.endsWith("COMP") ? "COMP"
      : "unknown");

  const label = opData?.pageTitle || opData?.label || opType;

  // Determine input count
  let inputCount = 1;
  let isMultiInput = false;
  const pattern = MULTI_INPUT_PATTERNS[opType];
  if (pattern) {
    inputCount = pattern.min;
    isMultiInput = pattern.max === -1 || pattern.max > 2;
  } else if (SINGLE_INPUT_PATTERNS.has(opType)) {
    inputCount = 1;
    isMultiInput = false;
  } else if (opType.includes("merge") || opType.includes("composite") || opType.includes("switch")) {
    inputCount = 2;
    isMultiInput = true;
  }

  // Build input descriptions
  const inputs: Array<{ index: number; description: string; accepts?: string }> = [];
  for (let i = 0; i < inputCount; i++) {
    inputs.push({
      index: i,
      description: i === 0 ? "Primary input" : `Input ${i}`,
      accepts: family,
    });
  }
  if (isMultiInput) {
    inputs.push({
      index: inputCount,
      description: `Additional inputs supported`,
      accepts: family,
    });
  }

  // Determine outputs
  const outputs: Array<{ name: string; type: string }> = [
    { name: "output", type: family },
  ];

  // Common combinations from operator doc
  const commonCombinations: Array<{ operators: string[]; description: string }> =
    (opData?.commonCombinations || []).map((cc: any) => ({
      operators: Array.isArray(cc.operators)
        ? cc.operators
        : (cc.with || []),
      description: cc.description || cc.why || "",
    }));

  // Warnings
  const warnings: string[] = [];
  if (opType === "feedbackTOP") {
    warnings.push("Needs 'top' parameter set to reference the feedback source");
  }
  if (opType === "particlePOP") {
    warnings.push("Requires a Null POP as feedback target via particlesupdatepop parameter");
  }
  if (opType === "feedbackPOP") {
    warnings.push("Needs target POP set to the downstream Null POP");
  }
  if (opType === "noisePOP") {
    warnings.push("Requires an input connection — cannot run standalone");
  }
  if (opType === "glslPOP" || opType === "glslCreatePOP" || opType === "glslAdvancedPOP") {
    warnings.push("Requires matching attribute declarations (P, Vel, Cd) in GLSL shader");
  }
  if (opType === "neighborPOP") {
    warnings.push("Performance-sensitive — limit neighbor count for large point clouds");
  }
  if (opType === "fieldPOP") {
    warnings.push("Requires proximity to source geometry — place near attractor/repulsor");
  }
  if (opType === "copyPOP") {
    warnings.push("Needs a source geometry (input 0) and template geometry (input 1)");
  }

  // Connects-to inference
  const connectsTo: string[] = [];
  // From common combinations
  for (const cc of commonCombinations) {
    for (const o of cc.operators) {
      if (o !== opType && !connectsTo.includes(o)) {
        connectsTo.push(o);
      }
    }
  }

  return {
    opType,
    family,
    label,
    inputCount,
    inputs,
    outputs,
    connectsTo,
    isMultiInput,
    warnings,
    commonCombinations,
  };
}

// ─── Build topology catalog ────────────────────────────────────────────────

/**
 * Build a full topology catalog from the knowledge base AND topology.json.
 * Returns a map of opType → OpTopology.
 * Priority: topology.json > knowledge base inference > pattern tables.
 */
function buildTopologyCatalog(): Map<string, OpTopology> {
  ensureKnowledgeLoaded();
  const opsMap = getOpsMap();
  const popsMap = getPopsMap();
  const allOps = { ...opsMap, ...popsMap };

  const catalog = new Map<string, OpTopology>();

  // ── First pass: load from topology.json if it exists ──
  let topologyJson: Record<string, any> | null = null;
  try {
  const dataDir = getTopologyDataDir();
  const topoPath = `${dataDir}/topology.json`;
  // @ts-ignore — dynamic require for runtime resolution
  const nodeFs: any = require("node:fs");
  if (nodeFs.existsSync(topoPath)) {
    topologyJson = JSON.parse(nodeFs.readFileSync(topoPath, "utf-8"))?.operators || null;
  }
  } catch { /* topology.json doesn't exist yet */ }

  if (topologyJson) {
    for (const [opType, topoData] of Object.entries(topologyJson)) {
      const td = topoData as { opType?: string; family?: string; label?: string; inputCount?: number; inputs?: Array<{ index: number; description: string; accepts?: string }>; outputs?: Array<{ name: string; type: string }>; connectsTo?: string[]; isMultiInput?: boolean; warnings?: string[]; commonCombinations?: Array<{ operators: string[]; description: string }> };
      catalog.set(opType, {
        opType: td.opType || opType,
        family: td.family || "unknown",
        label: td.label || opType,
        inputCount: td.inputCount ?? 1,
        inputs: td.inputs || [{ index: 0, description: "Input", accepts: td.family }],
        outputs: td.outputs || [{ name: "output", type: td.family || "TOP" }],
        connectsTo: td.connectsTo || [],
        isMultiInput: td.isMultiInput || false,
        warnings: td.warnings || [],
        commonCombinations: td.commonCombinations || [],
      });
    }
    // If topology.json is comprehensive enough, skip inference
    if (catalog.size > 50) return catalog;
  }

  // ── Second pass: infer from knowledge base ──

  for (const [key, opData] of Object.entries(allOps)) {
    // Determine the canonical opType
    let opType = opData?.tdOpTypeGuess || opData?.pageSlug || key;
    // Remove _TOP, _CHOP etc suffix and lowercase first char for TD convention
    if (opType.match(/^[A-Z].*(_TOP|_CHOP|_SOP|_DAT|_POP)$/)) {
      opType = opType
        .replace(/_(TOP|CHOP|SOP|DAT|POP)$/, "$1")
        .replace(/^[A-Z]/, (c: string) => c.toUpperCase())
        .replace(/(?<=[a-z])([A-Z])/g, "_$1")
        .toLowerCase();
    }
    // Normalize: ensure it's in camelCase with family suffix
    if (!opType.endsWith("TOP") && !opType.endsWith("CHOP")
      && !opType.endsWith("SOP") && !opType.endsWith("DAT")
      && !opType.endsWith("POP") && !opType.endsWith("COMP")) {
      // Try to guess from key
      if (key.endsWith("TOP")) opType = key.charAt(0).toLowerCase() + key.slice(1);
      else if (key.endsWith("CHOP")) opType = key.charAt(0).toLowerCase() + key.slice(1);
      else if (key.endsWith("POP")) opType = key.charAt(0).toLowerCase() + key.slice(1);
      else continue; // Skip unknown
    }

    if (!catalog.has(opType)) {
      catalog.set(opType, inferOpTopology(opType, opData));
    }
  }

  // Add common operators that might not be in the KB
  const COMMON_EXTRAS: Array<[string, string]> = [
    ["noiseTOP", "TOP"], ["constantTOP", "TOP"], ["blurTOP", "TOP"],
    ["levelTOP", "TOP"], ["transformTOP", "TOP"], ["compositeTOP", "TOP"],
    ["nullTOP", "TOP"], ["outTOP", "TOP"], ["moviefileinTOP", "TOP"],
    ["moviefileoutTOP", "TOP"], ["overTOP", "TOP"], ["switchTOP", "TOP"],
    ["feedbackTOP", "TOP"], ["rampTOP", "TOP"], ["textTOP", "TOP"],
    ["glslTOP", "TOP"], ["layoutTOP", "TOP"], ["infoTOP", "TOP"],
    ["mathCHOP", "CHOP"], ["noiseCHOP", "CHOP"], ["lfoCHOP", "CHOP"],
    ["constantCHOP", "CHOP"], ["mergeCHOP", "CHOP"], ["nullCHOP", "CHOP"],
    ["selectCHOP", "CHOP"], ["lagCHOP", "CHOP"], ["filterCHOP", "CHOP"],
    ["audiofileinCHOP", "CHOP"], ["audioDeviceInCHOP", "CHOP"],
    ["audiospectrumCHOP", "CHOP"], ["trailCHOP", "CHOP"],
    ["choptoTOP", "TOP"],
    ["noiseSOP", "SOP"], ["gridSOP", "SOP"], ["sphereSOP", "SOP"],
    ["boxSOP", "SOP"], ["transformSOP", "SOP"], ["nullSOP", "SOP"],
    ["mergeSOP", "SOP"],
    ["textDAT", "DAT"], ["tableDAT", "DAT"], ["nullDAT", "DAT"],
    ["containerCOMP", "COMP"], ["geometryCOMP", "COMP"],
    ["cameraCOMP", "COMP"], ["lightCOMP", "COMP"], ["windowCOMP", "COMP"],    ["particlePOP", "POP"], ["noisePOP", "POP"], ["forcePOP", "POP"],
    ["forceRadialPOP", "POP"], ["turbulencePOP", "POP"], ["dragPOP", "POP"],
    ["colorPOP", "POP"], ["spritePOP", "POP"], ["trailPOP", "POP"],
    ["feedbackPOP", "POP"], ["nullPOP", "POP"], ["renderPOP", "POP"],
    ["mergePOP", "POP"], ["glslPOP", "POP"], ["gridPOP", "POP"],
    ["spherePOP", "POP"], ["lookupPOP", "POP"],
    ["cachePOP", "POP"], ["cacheSelectPOP", "POP"],
    ["neighborPOP", "POP"], ["sortPOP", "POP"], ["fieldPOP", "POP"], ["sprinklePOP", "POP"],
    ["copyPOP", "POP"], ["deletePOP", "POP"], ["limitPOP", "POP"], ["blendPOP", "POP"],
    ["attributePOP", "POP"], ["analyzePOP", "POP"], ["normalizePOP", "POP"],
    ["transformPOP", "POP"], ["glslCreatePOP", "POP"], ["glslAdvancedPOP", "POP"],
    ["patternPOP", "POP"], ["boxPOP", "POP"], ["circlePOP", "POP"],
    ["tubePOP", "POP"], ["torusPOP", "POP"], ["linePOP", "POP"], ["pointPOP", "POP"],
  ];

  for (const [type, family] of COMMON_EXTRAS) {
    if (!catalog.has(type)) {
      catalog.set(type, {
        opType: type,
        family,
        label: type,
        inputCount: SINGLE_INPUT_PATTERNS.has(type) ? 1
          : MULTI_INPUT_PATTERNS[type]?.min || 1,
        inputs: [{ index: 0, description: "Input", accepts: family }],
        outputs: [{ name: "output", type: family }],
        connectsTo: [],
        isMultiInput: (MULTI_INPUT_PATTERNS[type]?.max || 1) > 2,
        warnings: [],
        commonCombinations: [],
      });
    }
  }

  return catalog;
}

// ─── LLM Graph Planner ─────────────────────────────────────────────────────

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
    for (const op of ops.slice(0, 30)) {// Limit per family
      const inputStr = op.isMultiInput
        ? `${op.inputCount}+ inputs`
        : `${op.inputCount} input(s)`;
      const warns = op.warnings.length > 0
        ? ` ⚠️ ${op.warnings.join("; ")}`
        : "";
      lines.push(`- **${op.opType}** (${op.label}): ${inputStr}${warns}`);

      // Show common combinations if available
      if (op.commonCombinations.length > 0) {
        for (const cc of op.commonCombinations.slice(0, 2)) {
          lines.push(`  - Commonly used with: ${cc.operators.join(" → ")} (${cc.description})`);
        }
      }
    }
  });

  return lines.join("\n");
}

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

/**
 * Plan a network graph using the LLM.
 * Falls back to deterministic planning if LLM is unavailable.
 */
async function llmPlanNetwork(
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
    // Fallback to deterministic planner if LLM fails
    console.warn(`[networkPlannerGraph] LLM planning failed: ${e.message}. Using deterministic fallback.`);
    return deterministicPlan(prompt, catalog, targetPath);
  }
}

// ─── Deterministic Fallback Planner ────────────────────────────────────────

/**
 * Deterministic network planner that understands basic topology.
 * Much better than the old linear chain — handles multi-input, branching, etc.
 */
function deterministicPlan(
  prompt: string,
  catalog: Map<string, OpTopology>,
  targetPath: string,
): NetworkGraph {
  const words = prompt.toLowerCase().split(/\s+/);
  const nodes: GraphNode[] = [];
  const connections: GraphConnection[] = [];
  let nodeIdx = 0;

  // 1. Find matching operators from the catalog
  const matched: Array<{ topo: OpTopology; score: number }> = [];
  catalog.forEach((topo: OpTopology, opType: string) => {
    const lower = opType.toLowerCase();
    const labelLower = topo.label.toLowerCase();
    let score = 0;

    // Score by keyword match
    for (const word of words) {
      if (word.length < 3) continue;
      if (lower.includes(word) || labelLower.includes(word)) score += 2;
      if (word === "audio" && (topo.family === "CHOP" || lower.includes("audio"))) score += 3;
      if (word === "particle" && topo.family === "POP") score += 3;
      if (word === "feedback" && lower.includes("feedback")) score += 3;
      if (word === "blur" && lower.includes("blur")) score += 2;
      if (word === "composite" && lower.includes("composite")) score += 2;
    }

    // Family bonus
    if (words.some(w => ["top", "texture", "image", "video"].includes(w)) && topo.family === "TOP") score += 1;
    if (words.some(w => ["chop", "audio", "sound", "music", "signal"].includes(w)) && topo.family === "CHOP") score += 1;
    if (words.some(w => ["pop", "particle", "point"].includes(w)) && topo.family === "POP") score += 2;

    if (score > 0) {
      matched.push({ topo, score });
    }
  });

  // Sort by score
  matched.sort((a, b) => b.score - a.score);

  // 2. Pick the best operators (max 15 for reasonable graphs)
  const selected = matched.slice(0, 15);

  // Add an output null if not already present
  const hasNull = selected.some(s => s.topo.opType.includes("null"));
  if (!hasNull && selected.length > 0) {
    const mainFamily = selected[0].topo.family;
    const nullType = mainFamily === "CHOP" ? "nullCHOP"
      : mainFamily === "POP" ? "nullPOP"
      : mainFamily === "SOP" ? "nullSOP"
      : "nullTOP";
    const nullTopo = catalog.get(nullType) || {
      opType: nullType,
      family: mainFamily,
      label: "Output",
      inputCount: 1,
      inputs: [{ index: 0, description: "Input", accepts: mainFamily }],
      outputs: [{ name: "output", type: mainFamily }],
      connectsTo: [],
      isMultiInput: false,
      warnings: [],
      commonCombinations: [],
    };
    selected.push({ topo: nullTopo, score: 100 });
  }

  // 3. Build nodes
  const nodeMap = new Map<string, GraphNode>();
  for (const { topo } of selected) {
    const id = `n${nodeIdx}`;
    const node: GraphNode = {
      id,
      opType: topo.opType,
      label: topo.label,
      parentPath: targetPath,
      x: nodeIdx * 180,
      y: 0,
    };
    nodes.push(node);
    nodeMap.set(id, node);
    nodeIdx++;
  }

  // 4. Build connections — smart topology-aware wiring
  // Separate nodes by family for clean chains
  const families = ["POP", "TOP", "CHOP", "SOP", "DAT"];
  let lastInFamily = new Map<string, string>(); // family → last node id

  for (const node of nodes) {
    const topo = catalog.get(node.opType)
      || selected.find(s => s.topo.opType === node.opType)?.topo;

    const family = topo?.family || "TOP";
    const prevId = lastInFamily.get(family);

    if (prevId) {
      // Connect from previous node in same family → this node input 0
      connections.push({
        from: prevId,
        to: node.id,
        inputIndex: 0,
      });
    }

    // If this is multi-input, also connect from other families
    if (topo?.isMultiInput && lastInFamily.size > 1) {
      let inputIdx = 1;
      lastInFamily.forEach((otherId: string, otherFamily: string) => {
        if (otherFamily !== family && inputIdx <= 3) {
          connections.push({
            from: otherId,
            to: node.id,
            inputIndex: inputIdx,
          });
          inputIdx++;
        }
      });
    }

    lastInFamily.set(family, node.id);
  }

  return {
    description: prompt,
    nodes,
    connections,
    targetPath,
  };
}

// ─── Apply Network Graph to TouchDesigner ──────────────────────────────────

/**
 * Apply a network graph to TouchDesigner: create nodes, then wire connections.
 * Creates nodes first (all must succeed), then wires in topological order
 * (sources first, then targets).
 */
async function applyNetworkGraph(
  client: TDClient,
  graph: NetworkGraph,
): Promise<{ success: boolean; created: number; connected: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let connected = 0;

  // Map node id → TD path
  const pathMap = new Map<string, string>();

  // Phase 1: Create all nodes
  for (const node of graph.nodes) {
    try {
      const result = await client.createOperator(
        node.opType,
        node.label,
        node.parentPath,
        node.x,
        node.y,
      );
      const tdPath = result.path || `${node.parentPath}/${node.label}`;
      pathMap.set(node.id, tdPath);
      created++;

      // Set parameters if provided
      if (node.parameters && Object.keys(node.parameters).length > 0) {
        try {
          const updates = Object.entries(node.parameters).map(([name, value]) => ({
            name,
            value,
          }));
          await client.setParameters(tdPath, updates);
        } catch (parErr: any) {
          errors.push(`Params for ${node.id} (${tdPath}): ${parErr.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`Create ${node.id} (${node.opType}): ${e.message}`);
    }
  }

  // Phase 2: Wire connections (topological order: sources first)
  // Sort connections so that connections between nodes with fewer dependencies come first
  const inDegree = new Map<string, number>();
  for (const conn of graph.connections) {
    inDegree.set(conn.to, (inDegree.get(conn.to) || 0) + 1);
  }

  const sortedConns = [...graph.connections].sort((a, b) => {
    const aDeg = inDegree.get(a.to) || 0;
    const bDeg = inDegree.get(b.to) || 0;
    return aDeg - bDeg;
  });

  for (const conn of sortedConns) {
    const sourcePath = pathMap.get(conn.from);
    const targetPath = pathMap.get(conn.to);

    if (!sourcePath || !targetPath) {
      errors.push(`Connect ${conn.from}→${conn.to}: missing path`);
      continue;
    }

    try {
      await client.connectNodes(sourcePath, targetPath, conn.inputIndex);
      connected++;
    } catch (e: any) {
      errors.push(`Connect ${conn.from}→${conn.to}[${conn.inputIndex}]: ${e.message}`);
    }
  }

  // Phase 3: Verify and fix connections that failed
  if (connected < graph.connections.length) {
    const connResults = await verifyAndFixConnections(
      client,
      sortedConns
        .filter(c => pathMap.has(c.from) && pathMap.has(c.to))
        .map(c => ({
          sourcePath: pathMap.get(c.from)!,
          targetPath: pathMap.get(c.to)!,
          inputIndex: c.inputIndex,
        })),
    );
    connected += connResults.fixed.length;
    for (const fix of connResults.fixed) {
      errors.push(`Re-wired: ${fix.fromPath}→${fix.toPath}[${fix.inputIndex}]`);
    }
  }

  // Phase 4: Run build-verify-fix on the target path
  try {
    const verify = await buildVerifyFix({
      client,
      path: graph.targetPath,
      autoFix: true,
      verifyConnections: true,
    });
    if (!verify.ok) {
      errors.push(`Post-build validation: ${verify.summary}`);
    }
  } catch (vErr: any) {
    errors.push(`Validation: ${vErr.message}`);
  }

  return {
    success: errors.length === 0,
    created,
    connected,
    errors,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface GraphPlanOptions {
  td: TDClient;
  prompt: string;
  targetPath?: string;
  containerName?: string;
  /** Use LLM for planning (falls back to deterministic if LLM unavailable) */
  useLlm?: boolean;
  /** Apply the plan to TD immediately */
  apply: boolean;
}

/**
 * Plan a network graph from a natural language prompt.
 * Uses LLM when available, falls back to deterministic matching.
 */
export async function planNetworkGraph(options: GraphPlanOptions): Promise<PlanResult> {
  const {
    td,
    prompt,
    targetPath = "/",
    containerName,
    useLlm = true,
    apply = false,
  } = options;

  try {
    const catalog = buildTopologyCatalog();

    // Plan the graph
    let graph: NetworkGraph;
    if (useLlm) {
      graph = await llmPlanNetwork(prompt, catalog, targetPath);
    } else {
      graph = deterministicPlan(prompt, catalog, targetPath);
    }

    if (containerName) {
      graph.containerName = containerName;
    }

    // Apply to TD if requested
    if (apply && td) {
      const result = await applyNetworkGraph(td, graph);
      return {
        success: result.success,
        graph,
        createdCount: result.created,
        connectedCount: result.connected,
        message: `Created ${result.created} nodes, wired ${result.connected} connections.`
          + (result.errors.length > 0 ? ` ${result.errors.length} errors.` : ""),
        error: result.errors.length > 0 ? result.errors.join("; ") : undefined,
      };
    }

    return {
      success: true,
      graph,
      message: `Dry-run: planned ${graph.nodes.length} nodes and ${graph.connections.length} connections. Set apply=true to create them.`,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || String(e),
      message: "Network planning failed.",
    };
  }
}

// ─── Backward-compatible exports ───────────────────────────────────────────

export {
  buildTopologyCatalog,
  inferOpTopology,
  type OpTopology,
};
