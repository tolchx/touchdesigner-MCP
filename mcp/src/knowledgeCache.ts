/**
 * Unified Knowledge Cache
 *
 * Single source of truth for ops and pops knowledge base data.
 * Loads from disk once (idempotent), then serves cached data to all consumers:
 *   - networkPlannerGraph.ts  (fuzzy search, network planning)
 *   - opsDb.ts           (typed ops index, operator docs)
 *   - popsDb.ts          (typed pops index, operator docs)
 *
 * Replaces the separate caches in networkPlannerGraph.ts (opsCache/popsCache)
 * and the uncached loads in opsDb.ts/popsDb.ts (loadOpsIndex/loadPopsIndex).
 */
import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Schemas (TdFamilySchema exported; others private, used for z.infer types) ─

export const TdFamilySchema = z.enum(["TOP", "CHOP", "SOP", "DAT", "POP", "COMP", "MAT"]);

const OpsOperatorIndexItemSchema = z.object({
  family: TdFamilySchema,
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
});

const OpsIndexSchema = z.object({
  generatedAt: z.string(),
  source: z.object({
    categories: z.record(TdFamilySchema, z.string().url()),
  }),
  operators: z.array(OpsOperatorIndexItemSchema),
});

const OpsOperatorDocSchema = z.object({
  family: TdFamilySchema,
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
  inputs: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        description: z.string().optional(),
      })
    )
    .default([]),
  parameters: z
    .array(
      z.object({
        page: z.string().optional(),
        label: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
  attributes: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
  localNotes: z
    .array(
      z.object({
        source: z.string(),
        excerpt: z.string(),
      })
    )
    .default([]),
  useCases: z.array(z.string()).default([]),
  examples: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        steps: z.array(z.string()).default([]),
      })
    )
    .default([]),
  commonCombinations: z
    .array(
      z.object({
        with: z.array(z.string()),
        why: z.string().optional(),
      })
    )
    .default([]),
  troubleshooting: z
    .array(
      z.object({
        problem: z.string(),
        cause: z.string().optional(),
        fix: z.string().optional(),
      })
    )
    .default([]),
});

const PopsOperatorIndexItemSchema = z.object({
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  experimental: z.boolean().default(false),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
});

const PopsIndexSchema = z.object({
  generatedAt: z.string(),
  source: z.object({
    categoryUrl: z.string().url(),
  }),
  operators: z.array(PopsOperatorIndexItemSchema),
});

const PopsOperatorDocSchema = z.object({
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  experimental: z.boolean().default(false),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
  inputs: z
    .array(
      z.object({
        index: z.number().int().nonnegative(),
        description: z.string().optional(),
      })
    )
    .default([]),
  parameters: z
    .array(
      z.object({
        page: z.string().optional(),
        label: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
  attributes: z
    .array(
      z.object({
        name: z.string(),
        type: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),
  localNotes: z
    .array(
      z.object({
        source: z.string(),
        excerpt: z.string(),
      })
    )
    .default([]),
  useCases: z.array(z.string()).default([]),
  examples: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        steps: z.array(z.string()).default([]),
      })
    )
    .default([]),
  commonCombinations: z
    .array(
      z.object({
        with: z.array(z.string()),
        why: z.string().optional(),
      })
    )
    .default([]),
  troubleshooting: z
    .array(
      z.object({
        problem: z.string(),
        cause: z.string().optional(),
        fix: z.string().optional(),
      })
    )
    .default([]),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type TdFamily = z.infer<typeof TdFamilySchema>;
export type OpsIndex = z.infer<typeof OpsIndexSchema>;
export type OpsOperatorDoc = z.infer<typeof OpsOperatorDocSchema>;
export type PopsIndex = z.infer<typeof PopsIndexSchema>;
export type PopsOperatorDoc = z.infer<typeof PopsOperatorDocSchema>;

// ─── Family detection (lightweight, avoids importing topologyBuild.ts) ─────

function detectFamilyFromKey(key: string): string {
  const upper = key.toUpperCase();
  if (upper.endsWith("TOP")) return "TOP";
  if (upper.endsWith("CHOP")) return "CHOP";
  if (upper.endsWith("SOP")) return "SOP";
  if (upper.endsWith("DAT")) return "DAT";
  if (upper.endsWith("POP")) return "POP";
  if (upper.endsWith("COMP")) return "COMP";
  if (upper.endsWith("MAT")) return "MAT";
  return "unknown";
}

// ─── Directory resolution ───────────────────────────────────────────────────

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

// ─── Cache state ────────────────────────────────────────────────────────────

/** Typed parsed ops index (for opsDb consumers). */
let _opsIndex: OpsIndex | null = null;

/** Typed parsed pops index (for popsDb consumers). */
let _popsIndex: PopsIndex | null = null;

/** Raw operator map keyed by pageSlug (for networkPlanner consumers). */
let _opsMap: Record<string, any> | null = null;

/** Raw POP operator map keyed by pageSlug (for networkPlanner consumers). */
let _popsMap: Record<string, any> | null = null;

/** Unified search index built from both ops and pops maps. */
let _searchIndex: Map<
  string,
  { name: string; label: string; family: string; operator: any }
> | null = null;

let _loaded = false;
let _loadError: Error | null = null;

// ─── Synchronous load (startup) ─────────────────────────────────────────────

/**
 * Load both ops and pops knowledge from disk and build all caches.
 * Uses synchronous reads (intentional: startup-only, called once, non-blocking is fine).
 * Idempotent — safe to call multiple times.
 */
export function ensureKnowledgeLoaded(): void {
  if (_loaded) return;
  try {
    const dataDir = getDataDir();

    // ── Load ops index (typed + raw map) ──
    const opsIndexPath = resolve(dataDir, "ops/index.json");
    if (existsSync(opsIndexPath)) {
      const raw = readFileSync(opsIndexPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Build typed index for opsDb consumers
      _opsIndex = OpsIndexSchema.parse(parsed);

      // Build raw map for networkPlanner consumers
      _opsMap = buildRawMap(parsed, "ops", dataDir);
    } else {
      _opsIndex = { generatedAt: "", source: { categories: {} }, operators: [] };
      _opsMap = {};
    }

    // ── Load pops index (typed + raw map) ──
    const popsIndexPath = resolve(dataDir, "pops/index.json");
    if (existsSync(popsIndexPath)) {
      const raw = readFileSync(popsIndexPath, "utf-8");
      const parsed = JSON.parse(raw);

      // Build typed index for popsDb consumers
      _popsIndex = PopsIndexSchema.parse(parsed);

      // Build raw map for networkPlanner consumers
      _popsMap = buildRawMap(parsed, "pops", dataDir);
    } else {
      _popsIndex = {
        generatedAt: "",
        source: { categoryUrl: "" },
        operators: [],
      };
      _popsMap = {};
    }

    // ── Build unified search index ──
    _searchIndex = buildSearchIndex(_opsMap, _popsMap);

    _loaded = true;
    _loadError = null;
  } catch (e: any) {
    _loadError = e;
    console.warn(
      "[knowledgeCache] Failed to load knowledge base:",
      e.message || String(e)
    );
    // Initialize empty defaults so consumers don't NPE
    if (!_opsIndex)
      _opsIndex = {
        generatedAt: "",
        source: { categories: {} },
        operators: [],
      };
    if (!_popsIndex)
      _popsIndex = {
        generatedAt: "",
        source: { categoryUrl: "" },
        operators: [],
      };
    if (!_opsMap) _opsMap = {};
    if (!_popsMap) _popsMap = {};
    if (!_searchIndex) _searchIndex = new Map();
    _loaded = true; // prevent re-attempts
  }
}

/**
 * Build a raw operator map from either array or Record format index data.
 * Handles legacy Record<string, path> format by loading individual files.
 *
 * Exported for unit testing (pure function — no module-level state).
 */
export function buildRawMap(
  parsed: any,
  family: string,
  dataDir: string
): Record<string, any> {
  const map: Record<string, any> = {};

  if (Array.isArray(parsed)) {
    for (const op of parsed) {
      map[op.pageSlug || op.name || op.tdOpTypeGuess || ""] = op;
    }
  } else if (parsed.operators && Array.isArray(parsed.operators)) {
    for (const op of parsed.operators) {
      map[op.pageSlug || op.name || op.tdOpTypeGuess || ""] = op;
    }
  } else {
    // Legacy Record<string, path> format
    for (const [name, path] of Object.entries(parsed)) {
      try {
        const opPath = resolve(dataDir, family, path as string);
        if (existsSync(opPath)) {
          map[name] = JSON.parse(readFileSync(opPath, "utf-8"));
        }
      } catch {
        // skip individual operator load errors
      }
    }
  }

  return map;
}

// ─── Async load (for consumers that prefer async) ───────────────────────────

/**
 * Ensure knowledge is loaded, returning a Promise.
 * Since the underlying load is sync (startup-only), this simply calls the sync version.
 */
export async function ensureKnowledgeLoadedAsync(): Promise<void> {
  ensureKnowledgeLoaded();
}

// ─── Public accessors ───────────────────────────────────────────────────────

/** Get the typed ops index. Loads if needed. */
export function getOpsIndex(): OpsIndex {
  ensureKnowledgeLoaded();
  return _opsIndex!;
}

/** Get the typed pops index. Loads if needed. */
export function getPopsIndex(): PopsIndex {
  ensureKnowledgeLoaded();
  return _popsIndex!;
}

/** Get the raw ops map (pageSlug → operator data). Loads if needed. */
export function getOpsMap(): Record<string, any> {
  ensureKnowledgeLoaded();
  return _opsMap!;
}

/** Get the raw pops map (pageSlug → operator data). Loads if needed. */
export function getPopsMap(): Record<string, any> {
  ensureKnowledgeLoaded();
  return _popsMap!;
}

/** Get the unified search index. Loads if needed. */
export function getSearchIndex(): Map<
  string,
  { name: string; label: string; family: string; operator: any }
> {
  ensureKnowledgeLoaded();
  return _searchIndex!;
}

/** Check if knowledge base loaded successfully. */
export function isKnowledgeLoaded(): boolean {
  return _loaded;
}

/** Get the load error if any. */
export function getKnowledgeLoadError(): Error | null {
  return _loadError;
}

// ─── Search index builder ───────────────────────────────────────────────────

export function buildSearchIndex(
  opsMap: Record<string, any>,
  popsMap: Record<string, any>
): Map<string, { name: string; label: string; family: string; operator: any }> {
  const index = new Map<
    string,
    { name: string; label: string; family: string; operator: any }
  >();

  const allMaps = [opsMap, popsMap];
  for (const map of allMaps) {
    for (const [key, op] of Object.entries(map)) {
      const family = op.family || detectFamilyFromKey(key);
      const label = op.label || op.pageTitle || key;
      const name = op.pageSlug || key;
      const entry = { name, label, family, operator: op };

      if (op.pageSlug)
        index.set(op.pageSlug.toLowerCase(), entry);
      if (op.tdOpTypeGuess)
        index.set(op.tdOpTypeGuess.toLowerCase(), entry);
      if (op.pageTitle) {
        index.set(op.pageTitle.toLowerCase().replace(/\s+/g, "_"), entry);
        index.set(op.pageTitle.toLowerCase(), entry);
      }
      if (key) index.set(key.toLowerCase(), entry);
      if (op.name) index.set(op.name.toLowerCase(), entry);
    }
  }

  return index;
}

// ─── Doc loaders (single-file reads, not cached — they're per-query) ────────

/** Load a single ops operator doc by family + pageSlug. */
export async function loadOpsOperatorDoc(
  family: TdFamily,
  pageSlug: string
): Promise<OpsOperatorDoc> {
  const safe = pageSlug.replaceAll("..", "").replaceAll("\\", "/");
  const dataDir = getDataDir();
  const raw = await readFile(
    resolve(dataDir, `ops/operators/${family}/${safe}.json`),
    "utf8"
  );
  return OpsOperatorDocSchema.parse(JSON.parse(raw));
}

/** Load a single pops operator doc by pageSlug. */
export async function loadPopsOperatorDoc(
  pageSlug: string
): Promise<PopsOperatorDoc> {
  const safe = pageSlug.replaceAll("..", "").replaceAll("\\", "/");
  const dataDir = getDataDir();
  const raw = await readFile(
    resolve(dataDir, `pops/operators/${safe}.json`),
    "utf8"
  );
  return PopsOperatorDocSchema.parse(JSON.parse(raw));
}
