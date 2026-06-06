/**
 * Templates Database
 *
 * Searches reusable patterns inside Toe_Expand markdown documentation.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QueryTemplatesOptions {
  search: string;
  project?: string;
  limit?: number;
}

export interface TemplateResult {
  project: string;
  file: string;
  fullPath: string;
  score: number;
  excerpt: string;
}

export interface QueryTemplatesResult {
  kind: "template_search";
  query: string;
  total: number;
  results: TemplateResult[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function repoRootFromHere(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    ".."
  );
}

const WALK_MAX_FILES = 200;
const WALK_MAX_DEPTH = 5;

async function walkMarkdown(
  root: string,
  acc: string[] = [],
  depth = 0
): Promise<string[]> {
  if (depth > WALK_MAX_DEPTH) return acc;
  if (acc.length >= WALK_MAX_FILES) return acc;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (acc.length >= WALK_MAX_FILES) break;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "Analisis_Maestro") continue;
      await walkMarkdown(full, acc, depth + 1);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      acc.push(full);
    }
  }
  return acc;
}

function buildExcerpt(text: string, idx: number, length = 260): string {
  const start = Math.max(0, idx - 120);
  const end = Math.min(text.length, idx + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function queryTemplates(
  options: QueryTemplatesOptions
): Promise<QueryTemplatesResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? 10));
  const repoRoot = repoRootFromHere();
  const toeExpand = path.join(repoRoot, "Toe_Expand");
  const files = await walkMarkdown(toeExpand);
  const q = options.search.toLowerCase().trim();
  const results: TemplateResult[] = [];

  for (const file of files) {
    if (
      options.project &&
      !file.toLowerCase().includes(options.project.toLowerCase())
    )
      continue;

    const text = await fs.readFile(file, "utf8");
    const hay = text.toLowerCase();
    const idx = hay.indexOf(q);

    if (idx === -1) continue;

    const rel = path.relative(toeExpand, file).split(path.sep);
    const project = rel[0] ?? "unknown";

    results.push({
      project,
      file: path.basename(file),
      fullPath: file,
      score: 1000 - idx,
      excerpt: buildExcerpt(text, idx),
    });
  }

  results.sort((a, b) => b.score - a.score);

  return {
    kind: "template_search",
    query: options.search,
    total: results.length,
    results: results.slice(0, limit),
  };
}
