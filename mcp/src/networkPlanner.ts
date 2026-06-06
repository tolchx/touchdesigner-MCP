import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import type { TDClient } from "td-api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// @ts-nocheck - This module works with dynamic JSON data structures

// ── Knowledge Base Loaders ──────────────────────────────────────────

let opsCache: Record<string, any> | null = null;
let popsCache: Record<string, any> | null = null;

/** Index map for O(1) lookups by pageSlug, tdOpTypeGuess, and pageTitle */
let searchIndex: Map<string, { name: string; label: string; family: string; operator: any }> | null = null;

let knowledgeLoaded = false;
let knowledgeLoadError: Error | null = null;

function getDataDir(): string {
  const candidates = [
    resolve(__dirname, "../data"),
    resolve(__dirname, "../../data"),
    resolve(__dirname, "../../../data"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return resolve(__dirname, "../data");
}

/** Levenshtein distance for fuzzy search scoring */
function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[] = [];
  for (let i = 0; i <= bn; i++) matrix[i] = i;
  for (let i = 1; i <= an; i++) {
    let prev = i;
    for (let j = 1; j <= bn; j++) {
      const temp = matrix[j - 1];
      matrix[j - 1] = prev;
      prev =
        a[i - 1] === b[j - 1]
          ? temp
          : Math.min(temp, matrix[j], prev) + 1;
    }
    matrix[bn] = prev;
  }
  return matrix[bn];
}

/**
 * Build the unified search index from the loaded ops and pops caches.
 * Call after both caches are populated.
 */
function buildSearchIndex(): void {
  searchIndex = new Map();
  const allCaches = [opsCache, popsCache];
  for (const cache of allCaches) {
    if (!cache) continue;
    for (const [key, op] of Object.entries(cache)) {
      // Determine family from the operator data or key suffix
      const family = op.family || (key.endsWith("POP") ? "POP" : key.endsWith("TOP") ? "TOP" : key.endsWith("CHOP") ? "CHOP" : key.endsWith("SOP") ? "SOP" : key.endsWith("DAT") ? "DAT" : key.endsWith("COMP") ? "COMP" : "unknown");
      const label = op.label || op.pageTitle || key;
      const name = op.pageSlug || key;
      const entry = { name, label, family, operator: op };

      // Index by pageSlug
      if (op.pageSlug) {
        searchIndex.set(op.pageSlug.toLowerCase(), entry);
      }
      // Index by tdOpTypeGuess (e.g. "addTOP")
      if (op.tdOpTypeGuess) {
        searchIndex.set(op.tdOpTypeGuess.toLowerCase(), entry);
      }
      // Index by pageTitle
      if (op.pageTitle) {
        searchIndex.set(op.pageTitle.toLowerCase().replace(/\s+/g, "_"), entry);
        searchIndex.set(op.pageTitle.toLowerCase(), entry);
      }
      // Index by the key itself
      if (key) {
        searchIndex.set(key.toLowerCase(), entry);
      }
      // Index by name (if different from key)
      if (op.name) {
        searchIndex.set(op.name.toLowerCase(), entry);
      }
    }
  }
}

/** Load both ops and pops knowledge and build the search index. Idempotent. */
export function ensureKnowledgeLoaded(): void {
  if (knowledgeLoaded) return;
  try {
    loadOpsKnowledge();
    loadPopsKnowledge();
    buildSearchIndex();
    knowledgeLoaded = true;
    knowledgeLoadError = null;
  } catch (e: any) {
    knowledgeLoadError = e;
    console.warn("[networkPlanner] Failed to load knowledge base:", e.message || String(e));
  }
}

function loadOpsKnowledge(): Record<string, any> {
  if (opsCache) return opsCache;
  const dataDir = getDataDir();
  const opsIndexPath = resolve(dataDir, "ops/index.json");
  try {
    if (existsSync(opsIndexPath)) {
      const indexRaw = readFileSync(opsIndexPath, "utf-8");
      const index = JSON.parse(indexRaw);
      opsCache = {};
      // Handle both array format (new) and Record format (old)
      if (Array.isArray(index)) {
        for (const op of index) {
          opsCache[op.pageSlug || op.name || op.tdOpTypeGuess || ""] = op;
        }
      } else if (index.operators && Array.isArray(index.operators)) {
        for (const op of index.operators) {
          opsCache[op.pageSlug || op.name || op.tdOpTypeGuess || ""] = op;
        }
      } else {
        // Legacy Record<string, path> format
        for (const [name, path] of Object.entries(index)) {
          try {
            const opPath = resolve(dataDir, "ops", path as string);
            if (existsSync(opPath)) {
              const data = JSON.parse(readFileSync(opPath, "utf-8"));
              opsCache[name] = data;
            }
          } catch {
            // skip individual operator load errors
          }
        }
      }
      return opsCache;
    }
  } catch {
    // fall through
  }
  opsCache = {};
  return opsCache;
}

function loadPopsKnowledge(): Record<string, any> {
  if (popsCache) return popsCache;
  const dataDir = getDataDir();
  const popsIndexPath = resolve(dataDir, "pops/index.json");
  try {
    if (existsSync(popsIndexPath)) {
      const indexRaw = readFileSync(popsIndexPath, "utf-8");
      const index = JSON.parse(indexRaw);
      popsCache = {};
      // Handle both array format (new) and Record format (old)
      if (Array.isArray(index)) {
        for (const op of index) {
          popsCache[op.pageSlug || op.name || ""] = op;
        }
      } else if (index.operators && Array.isArray(index.operators)) {
        for (const op of index.operators) {
          popsCache[op.pageSlug || op.name || ""] = op;
        }
      } else {
        // Legacy Record<string, path> format
        for (const [name, path] of Object.entries(index)) {
          try {
            const opPath = resolve(dataDir, "pops", path as string);
            if (existsSync(opPath)) {
              const data = JSON.parse(readFileSync(opPath, "utf-8"));
              popsCache[name] = data;
            }
          } catch {
            // skip
          }
        }
      }
      return popsCache;
    }
  } catch {
    // fall through
  }
  popsCache = {};
  return popsCache;
}

// ── Fuzzy Search ─────────────────────────────────────────────────────

export interface FuzzySearchResult {
  name: string;
  label: string;
  score: number;
  family: string;
}

/**
 * Fuzzy search over the loaded operator knowledge base.
 * Scoring: exact match = 100, prefix match = 80, substring match = 60, levenshtein < 3 = 40
 * Uses the in-memory index for O(1) lookups.
 */
export function fuzzySearchOperators(query: string, limit: number = 10): FuzzySearchResult[] {
  // Ensure knowledge is loaded (idempotent)
  ensureKnowledgeLoaded();

  if (!searchIndex || searchIndex.size === 0) {
    return [];
  }

  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: FuzzySearchResult[] = [];

  // Iterate over all unique operators (track by name to avoid duplicates from multiple index entries)
  const seen = new Set<string>();

  for (const [, entry] of searchIndex) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);

    const nameLower = entry.name.toLowerCase();
    const labelLower = entry.label.toLowerCase();
    const searchText = nameLower + " " + labelLower;

    let score = 0;

    // Exact match
    if (nameLower === q || labelLower === q) {
      score = 100;
    }
    // Prefix match
    else if (nameLower.startsWith(q) || labelLower.startsWith(q)) {
      score = 80;
    }
    // Substring match
    else if (searchText.includes(q)) {
      score = 60;
    }
    // Levenshtein distance < 3
    else {
      const ld = levenshteinDistance(q, nameLower.substring(0, Math.min(nameLower.length, q.length + 3)));
      if (ld < 3) {
        score = 40;
      }
    }

    if (score > 0) {
      results.push({
        name: entry.name,
        label: entry.label,
        score,
        family: entry.family,
      });
    }
  }

  // Sort by score descending, then alphabetically by label
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });

  return results.slice(0, limit);
}

// ── Network Planning ────────────────────────────────────────────────

interface PlanOptions {
  td: TDClient;
  prompt: string;
  targetPath?: string;
  containerName?: string;
  apply: boolean;
}

interface PlanResult {
  success: boolean;
  plan?: any;
  message?: string;
  error?: string;
}

export async function createNetworkPlan(options: PlanOptions): Promise<PlanResult> {
  const { td, prompt, targetPath, containerName, apply } = options;
  // Ensure knowledge is loaded once (idempotent)
  ensureKnowledgeLoaded();
  const allOps = { ...(opsCache || {}), ...(popsCache || {}) };
  const maxNodes = 20;

  const plan = {
    description: prompt,
    targetPath: targetPath || "/",
    containerName: containerName || "generated_network",
    nodes: [] as any[],
    connections: [] as any[],
  };

  // Parse the description to extract operator references
  const words = prompt.toLowerCase().split(/\s+/);
  const matchedOps: string[] = [];

  for (const opName of Object.keys(allOps)) {
    const lower = opName.toLowerCase();
    if (
      words.some((w: string) => lower.includes(w) || w.includes(lower)) &&
      matchedOps.length < maxNodes
    ) {
      matchedOps.push(opName);
    }
  }

  // Build nodes
  for (let i = 0; i < matchedOps.length; i++) {
    const opName = matchedOps[i];
    const op = allOps[opName];
    plan.nodes.push({
      id: `op_${i}`,
      label: op?.label || opName,
      type: opName,
      category: op?.category || "unknown",
      path: plan.targetPath + "/" + (op?.label || opName),
    });
  }

  // Build chain connections
  for (let i = 0; i < plan.nodes.length - 1; i++) {
    plan.connections.push({
      from: plan.nodes[i].path,
      to: plan.nodes[i + 1].path,
    });
  }

  // If apply mode, create the operators in TD
  if (apply && td) {
    try {
      for (const node of plan.nodes) {
        await td.createOperator(node.type, node.label, plan.targetPath);
      }
      for (const conn of plan.connections) {
        await td.connectNodes(conn.from, conn.to);
      }
      return { success: true, plan, message: `Created ${plan.nodes.length} nodes and applied connections.` };
    } catch (e: any) {
      return { success: false, plan, error: (e as any).message || String(e), message: "Plan created but application failed." };
    }
  }

  return { success: true, plan, message: `Dry-run: found ${plan.nodes.length} operators. Set apply=true to create them in TD.` };
}

export const generateNetworkPlan = createNetworkPlan;
