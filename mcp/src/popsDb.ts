/**
 * POPs Knowledge Database
 *
 * Loads and queries the local POP operator index and detailed operator docs.
 */
import fs from "node:fs/promises";
import { z } from "zod";

// ─── Schemas ────────────────────────────────────────────────────────────────

const PopsOperatorIndexItemSchema = z.object({
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  experimental: z.boolean().default(false),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
});

export const PopsIndexSchema = z.object({
  generatedAt: z.string(),
  source: z.object({
    categoryUrl: z.string().url(),
  }),
  operators: z.array(PopsOperatorIndexItemSchema),
});

export const PopsOperatorDocSchema = z.object({
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  experimental: z.boolean().default(false),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
  inputs: z
    .array(z.object({
      index: z.number().int().nonnegative(),
      description: z.string().optional(),
    }))
    .default([]),
  parameters: z
    .array(z.object({
      page: z.string().optional(),
      label: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    }))
    .default([]),
  attributes: z
    .array(z.object({
      name: z.string(),
      type: z.string().optional(),
      description: z.string().optional(),
    }))
    .default([]),
  localNotes: z
    .array(z.object({
      source: z.string(),
      excerpt: z.string(),
    }))
    .default([]),
  useCases: z.array(z.string()).default([]),
  examples: z
    .array(z.object({
      title: z.string(),
      description: z.string().optional(),
      steps: z.array(z.string()).default([]),
    }))
    .default([]),
  commonCombinations: z
    .array(z.object({
      with: z.array(z.string()),
      why: z.string().optional(),
    }))
    .default([]),
  troubleshooting: z
    .array(z.object({
      problem: z.string(),
      cause: z.string().optional(),
      fix: z.string().optional(),
    }))
    .default([]),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type PopsIndex = z.infer<typeof PopsIndexSchema>;
export type PopsOperatorDoc = z.infer<typeof PopsOperatorDocSchema>;

export interface PopsIndexItem {
  pageTitle: string;
  pageSlug: string;
  url: string;
  experimental: boolean;
  tdOpTypeGuess?: string;
  summary?: string;
}

export interface QueryPopsOptions {
  search?: string;
  pageSlug?: string;
  limit?: number;
}

export interface QueryPopsResult {
  kind: "operator" | "search";
  operator?: PopsOperatorDoc;
  results?: PopsIndexItem[];
  total?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dataRootFromHere(): URL {
  return new URL("../data/pops/", import.meta.url);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function loadPopsIndex(): Promise<PopsIndex> {
  const indexUrl = new URL("./index.json", dataRootFromHere());
  const raw = await fs.readFile(indexUrl, "utf8");
  return PopsIndexSchema.parse(JSON.parse(raw));
}

export async function loadPopsOperatorDoc(
  pageSlug: string
): Promise<PopsOperatorDoc> {
  const safe = pageSlug.replaceAll("..", "").replaceAll("\\", "/");
  const docUrl = new URL(`./operators/${safe}.json`, dataRootFromHere());
  const raw = await fs.readFile(docUrl, "utf8");
  return PopsOperatorDocSchema.parse(JSON.parse(raw));
}

export async function queryPops(
  options: QueryPopsOptions
): Promise<QueryPopsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by slug
  if (options.pageSlug) {
    const operator = await loadPopsOperatorDoc(options.pageSlug);
    return { kind: "operator", operator };
  }

  // Search across the index
  const index = await loadPopsIndex();
  const q = (options.search ?? "").trim().toLowerCase();
  if (!q) {
    return {
      kind: "search",
      results: index.operators.slice(0, limit),
      total: index.operators.length,
    };
  }

  const scored = index.operators
    .map((op) => {
      const hay =
        `${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
          .toLowerCase()
          .trim();
      const idx = hay.indexOf(q);
      const score = idx === -1 ? -1 : 1000 - idx;
      return { op, score };
    })
    .filter((x): x is { op: PopsIndexItem; score: number } => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.op);

  return { kind: "search", results: scored.slice(0, limit), total: scored.length };
}
