/**
 * Network Planner Graph — Topology-Aware Network Planning
 *
 * Thin orchestrator that re-exports from the split modules:
 *   - topologyData.ts: types, pattern tables, inference, catalog builder
 *   - plannerLlm.ts: LLM-based network planning
 *   - plannerDeterministic.ts: deterministic fallback planner
 */

import type { TDClient } from "td-api";
import { buildVerifyFix, verifyAndFixConnections } from "./buildVerifyFix.js";

// Re-export from split modules
export { ensureKnowledgeLoaded } from "./knowledgeCache.js";
export { isFamilyCompatible, deterministicPlan } from "./plannerDeterministic.js";
export {
  buildTopologyCatalog,
  inferOpTopology,
  type GraphNode,
  type GraphConnection,
  type NetworkGraph,
  type OpTopology,
  type PlanResult,
} from "./topologyData.js";

// Import what we need for apply + orchestrator
import type { NetworkGraph, PlanResult } from "./topologyData.js";
import { buildTopologyCatalog } from "./topologyData.js";
import { llmPlanNetwork } from "./plannerLlm.js";
import { deterministicPlan } from "./plannerDeterministic.js";

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
