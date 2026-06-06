/**
 * Operator Knowledge Database (TOP/CHOP/SOP/DAT)
 *
 * Loads and queries the local operator index and detailed operator docs.
 */
import fs from "node:fs/promises";
import { z } from "zod";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const TdFamilySchema = z.enum(["TOP", "CHOP", "SOP", "DAT"]);

const OpsOperatorIndexItemSchema = z.object({
  family: TdFamilySchema,
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
  tdOpTypeGuess: z.string().optional(),
  summary: z.string().optional(),
});

export const OpsIndexSchema = z.object({
  generatedAt: z.string(),
  source: z.object({
    categories: z.record(TdFamilySchema, z.string().url()),
  }),
  operators: z.array(OpsOperatorIndexItemSchema),
});

export const OpsOperatorDocSchema = z.object({
  family: TdFamilySchema,
  pageTitle: z.string(),
  pageSlug: z.string(),
  url: z.string().url(),
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

export type TdFamily = z.infer<typeof TdFamilySchema>;
export type OpsIndex = z.infer<typeof OpsIndexSchema>;
export type OpsOperatorDoc = z.infer<typeof OpsOperatorDocSchema>;

export interface OpsIndexItem {
  family: TdFamily;
  pageTitle: string;
  pageSlug: string;
  url: string;
  tdOpTypeGuess?: string;
  summary?: string;
}

export interface QueryOpsOptions {
  search?: string;
  family?: TdFamily;
  pageSlug?: string;
  limit?: number;
}

export interface QueryOpsResult {
  kind: "operator" | "search";
  operator?: OpsOperatorDoc;
  results?: OpsIndexItem[];
  total?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function dataRootFromHere(): URL {
  return new URL("../data/ops/", import.meta.url);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function loadOpsIndex(): Promise<OpsIndex> {
  const indexUrl = new URL("./index.json", dataRootFromHere());
  const raw = await fs.readFile(indexUrl, "utf8");
  return OpsIndexSchema.parse(JSON.parse(raw));
}

export async function loadOpsOperatorDoc(
  family: TdFamily,
  pageSlug: string
): Promise<OpsOperatorDoc> {
  const safe = pageSlug.replaceAll("..", "").replaceAll("\\", "/");
  const docUrl = new URL(
    `./operators/${family}/${safe}.json`,
    dataRootFromHere()
  );
  const raw = await fs.readFile(docUrl, "utf8");
  return OpsOperatorDocSchema.parse(JSON.parse(raw));
}

export async function queryOps(
  options: QueryOpsOptions
): Promise<QueryOpsResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));

  // Direct operator lookup by family + slug
  if (options.family && options.pageSlug) {
    const operator = await loadOpsOperatorDoc(options.family, options.pageSlug);
    return { kind: "operator", operator };
  }

  // Search across the index
  const index = await loadOpsIndex();
  const pool = options.family
    ? index.operators.filter((o) => o.family === options.family)
    : index.operators;

  const q = (options.search ?? "").trim().toLowerCase();
  if (!q) {
    return { kind: "search", results: pool.slice(0, limit), total: pool.length };
  }

  const scored = pool
    .map((op) => {
      const hay =
        `${op.family} ${op.pageTitle} ${op.pageSlug} ${op.tdOpTypeGuess ?? ""} ${op.summary ?? ""}`
          .toLowerCase()
          .trim();
      const idx = hay.indexOf(q);
      const score = idx === -1 ? -1 : 1000 - idx;
      return { op, score };
    })
    .filter((x): x is { op: OpsIndexItem; score: number } => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.op);

  return { kind: "search", results: scored.slice(0, limit), total: scored.length };
}
