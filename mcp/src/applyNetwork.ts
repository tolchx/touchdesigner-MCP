/**
 * Apply Network Graph — Push a planned graph to TouchDesigner
 *
 * Creates nodes, wires connections, and runs post-build verification.
 * Extracted from networkPlannerGraph.ts for single-responsibility.
 */

import type { TDClient } from "td-api";
import { buildVerifyFix, verifyAndFixConnections } from "./buildVerifyFix.js";
import { validatePopParameters } from "./popsValidate.js";
import { verifyWiring, type WiringCheckResult } from "./tools/wiringCheck.js";
import type { GraphConnection, NetworkGraph } from "./topologyData.js";

export type ApplyResult = {
  success: boolean;
  created: number;
  connected: number;
  errors: string[];
  warnings: string[];
  /** Automatic post-build wiring verification (td_verify_wiring semantics,
   *  AGENTS.md rule 16) with the expected-edge spec embedded from the graph.
   *  `{ skipped }` when the client cannot read connections. */
  wiring?: WiringCheckResult | { skipped: string };
};

/**
 * Detect dynamic-input slot collisions BEFORE building (AGENTS.md rule 12,
 * NEG3 evidence): on dynamic-input ops (mergePOP, compositeTOP, ...),
 * `tgt.inputConnectors[i].connect(src)` REPLACES the wire already occupying
 * slot i instead of appending. Two expected edges `(a→d, i)` and `(b→d, i)`
 * with a≠b cannot both exist after the build: the second connect silently
 * overwrites the first, and only the post-build /connections edge-set check
 * (rule 16 / td_verify_wiring) would notice.
 *
 * Returns one warning per colliding slot, naming the edges that share it.
 */
export function detectSlotCollisions(graph: NetworkGraph): string[] {
  const warnings: string[] = [];
  const byDest = new Map<string, GraphConnection[]>();
  for (const conn of graph.connections) {
    const list = byDest.get(conn.to) ?? [];
    list.push(conn);
    byDest.set(conn.to, list);
  }
  for (const [destId, conns] of byDest) {
    const bySlot = new Map<number, GraphConnection[]>();
    for (const conn of conns) {
      const slot = conn.inputIndex ?? 0;
      const list = bySlot.get(slot) ?? [];
      list.push(conn);
      bySlot.set(slot, list);
    }
    for (const [slot, slotConns] of bySlot) {
      if (slotConns.length > 1) {
        const edges = slotConns
          .map((c) => `${c.from}→${c.to}[${c.inputIndex ?? 0}]`)
          .join(", ");
        warnings.push(
          `Slot collision on ${destId} input ${slot}: ${edges}. ` +
            `Dynamic-input ops (mergePOP, compositeTOP) REPLACE the wire occupying a slot instead of appending ` +
            `(AGENTS.md rule 12), so only the last connection will survive. Use distinct input slots per source ` +
            `or let the op auto-assign by connecting through outputConnectors.`,
        );
      }
    }
  }
  return warnings;
}

/**
 * Apply a network graph to TouchDesigner: create nodes, then wire connections.
 * Creates nodes first (all must succeed), then wires in topological order
 * (sources first, then targets).
 */
export async function applyNetworkGraph(
  client: TDClient,
  graph: NetworkGraph,
): Promise<ApplyResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let created = 0;
  let connected = 0;

  // Guard BEFORE building (AGENTS.md rule 12, NEG3): two expected edges on the
  // same destination input slot cannot both survive on dynamic-input ops.
  // Building anyway would silently replace earlier wires and report success.
  const collisions = detectSlotCollisions(graph);
  if (collisions.length > 0) {
    warnings.push(...collisions);
    return {
      success: false,
      created: 0,
      connected: 0,
      errors: [
        `Blocked before build: ${collisions.length} dynamic-input slot collision(s). ` +
          "Fix the graph connections and retry — building would silently REPLACE earlier wires.",
      ],
      warnings,
    };
  }

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
          const names = Object.keys(node.parameters);
          // Never set parameters blindly: check names against the live-validated
          // POP knowledge base first (skipped for types it doesn't cover).
          const pv = validatePopParameters(node.opType, names);
          if (!pv.ok) {
            errors.push(
              `Params for ${node.id} (${node.opType}): ${pv.unknown
                .map(
                  (u) =>
                    `'${u.name}'` +
                    (u.suggestions.length > 0
                      ? ` (did you mean: ${u.suggestions.join(", ")}?)`
                      : ""),
                )
                .join(", ")} — parameters were NOT set. Read real names with td_pars_get.`,
            );
          } else {
            const updates = Object.entries(node.parameters).map(([name, value]) => ({
              name,
              value,
            }));
            await client.setParameters(tdPath, updates);
          }
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

  // Phase 3.5: automatic post-build wiring verification (AGENTS.md rule 16):
  // the expected-edge spec is embedded from the graph itself — verification
  // happens without the agent asking. Uses the same verifyWiring engine as
  // the td_verify_wiring MCP tool, against real /connections edges.
  let wiring: WiringCheckResult | { skipped: string };
  const connClient = client as TDClient & {
    getConnections?: (path: string, recurse: boolean) => Promise<{
      connections?: Array<{ from: string; to: string; input: number }>;
    }>;
  };
  if (
    typeof connClient.getConnections === "function" &&
    graph.connections.length > 0
  ) {
    const expected: Array<{ from: string; to: string; input: number }> = [];
    for (const conn of graph.connections) {
      const fromPath = pathMap.get(conn.from);
      const toPath = pathMap.get(conn.to);
      if (!fromPath || !toPath) continue; // already reported as a connect error
      expected.push({
        from: fromPath.split("/").pop() ?? fromPath,
        to: toPath.split("/").pop() ?? toPath,
        input: conn.inputIndex ?? 0,
      });
    }
    const conn = await connClient.getConnections(graph.targetPath, true);
    wiring = verifyWiring(graph.targetPath, expected, conn.connections ?? []);
    if (!wiring.ok) {
      errors.push(
        `Wiring mismatch after build: missing=[${wiring.missing.join(", ")}] ` +
          `unexpected=[${wiring.unexpected.join(", ")}]` +
          (wiring.replacementHint ? ` — ${wiring.replacementHint}` : ""),
      );
    }
  } else {
    wiring = {
      skipped: "client lacks getConnections — run td_verify_wiring manually (rule 16)",
    };
    warnings.push("Wiring verification skipped: " + wiring.skipped);
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
    warnings,
    wiring,
  };
}
