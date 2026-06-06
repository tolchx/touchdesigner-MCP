import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TDClient } from "td-api";
import { z } from "zod";
import { ok, err } from "../helpers.js";

// ── In-memory undo history ───────────────────────────────────────────

interface HistoryEntry {
  id: number;
  path: string;
  action: string;
  timestamp: string;
  snapshot: any; // snapshot_scene JSON before the change
}

const MAX_HISTORY = 100;
const history: HistoryEntry[] = [];
let nextId = 1;

/**
 * Record a change in the history log.
 * Called internally by tools that modify operators.
 */
export async function recordChange(
  client: TDClient,
  path: string,
  action: string,
): Promise<void> {
  try {
    const snapshot = await client.snapshotScene(path);
    history.push({
      id: nextId++,
      path,
      action,
      timestamp: new Date().toISOString(),
      snapshot,
    });
    // Trim oldest entries if exceeding max
    while (history.length > MAX_HISTORY) {
      history.shift();
    }
  } catch {
    // Silently skip recording if snapshot fails
  }
}

// ── Registered tools ────────────────────────────────────────────────

export function registerHistoryTools(server: McpServer, client: TDClient) {
  // ---------------------------------------------------------------------------
  // td_history_list
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_history_list",
    {
      title: "List Change History",
      description:
        "List the last N recorded changes (history entries) stored in memory. Each entry shows the operator path, action, and timestamp. Does NOT call into TouchDesigner.",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Max entries to return (1-100, default 20)"),
      },
    },
    async ({ limit }) => {
      try {
        const count = limit ?? 20;
        const entries = history.slice(-count).reverse();
        return ok({
          total: history.length,
          entries,
        });
      } catch (e: any) {
        return err(e);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // td_history_undo
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_history_undo",
    {
      title: "Undo Last Change",
      description:
        "Revert the most recent recorded change by restoring the operator's parameters from its pre-change snapshot. Only affects in-memory history; uses snapshot_scene + setParameters.",
      inputSchema: {},
    },
    async () => {
      try {
        if (history.length === 0) {
          return ok({ message: "No history entries to undo." });
        }
        const entry = history.pop()!;
        const snapshot = entry.snapshot;
        if (!snapshot || !snapshot.snapshot) {
          return ok({
            message: `History entry #${entry.id} (${entry.action} @ ${entry.path}) has no snapshot data. Cannot undo.`,
            entry,
          });
        }
        // Restore parameters from snapshot
        const root = snapshot.snapshot;
        const restored: string[] = [];
        const failed: string[] = [];

        async function restoreNode(node: any): Promise<void> {
          if (!node || !node.path || !node.pars) return;
          const pars = node.pars as Record<string, { val: any; mode: string; expr: string | null }>;
          const updates: Array<{ name: string; value?: any; expr?: string | null }> = [];
          for (const [parName, parData] of Object.entries(pars)) {
            if (parData.expr && parData.expr !== "None") {
              updates.push({ name: parName, expr: parData.expr });
            } else {
              updates.push({ name: parName, value: parData.val });
            }
          }
          if (updates.length > 0) {
            try {
              await client.setParameters(node.path, updates, false);
              restored.push(node.path);
            } catch {
              failed.push(node.path);
            }
          }
          // Recurse into children
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) {
              await restoreNode(child);
            }
          }
        }

        await restoreNode(root);

        return ok({
          message: `Undone: ${entry.action} @ ${entry.path}`,
          entry: {
            id: entry.id,
            action: entry.action,
            path: entry.path,
            timestamp: entry.timestamp,
          },
          restored,
          failed,
        });
      } catch (e: any) {
        return err(e);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // td_history_clear
  // ---------------------------------------------------------------------------
  server.registerTool(
    "td_history_clear",
    {
      title: "Clear Change History",
      description:
        "Clear all in-memory history entries. This does NOT affect TouchDesigner — only discards the local undo log.",
      inputSchema: {},
    },
    async () => {
      try {
        const count = history.length;
        history.length = 0;
        nextId = 1;
        return ok({
          message: `Cleared ${count} history entries.`,
          cleared: count,
        });
      } catch (e: any) {
        return err(e);
      }
    },
  );
}
