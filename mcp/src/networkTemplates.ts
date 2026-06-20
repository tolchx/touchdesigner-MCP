/**
 * Network Templates — Template storage, retrieval, and search
 *
 * Templates are loaded from data/templates/builtin-templates.json.
 * NL→TD resolution (TYPE_SYNONYMS, FAMILY_HINTS, resolveOperatorType, getBestFamily)
 * lives in semantic.ts — this module re-exports them for backward compatibility.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TemplateOperator {
  id: string;
  opType: string;
  label: string;
  purpose: string;
}

export interface TemplateConnection {
  from: string;
  to: string;
  inputIndex: number;
  note: string;
}

export interface TemplateParameter {
  opId: string;
  paramName: string;
  value: unknown;
  note: string;
}

export interface NetworkTemplate {
  name: string;
  description: string;
  tags: string[];
  complexity: "simple" | "medium" | "advanced";
  operators: TemplateOperator[];
  connections: TemplateConnection[];
  parameters: TemplateParameter[];
  pythonBuilder: string;
}

// ─── Re-export semantic resolution from semantic.ts (single source) ─────────

import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  TYPE_SYNONYMS,
  FAMILY_HINTS,
  type FamilyHintEntry,
  resolveOperatorType,
  resolveAllOperatorTypes,
  getBestFamily,
  getAllFamilies,
  resolveSemanticTerms,
  type SemanticResolution,
} from "./semantic.js";

// Re-export all semantic resolution for backward compatibility
export {
  TYPE_SYNONYMS,
  FAMILY_HINTS,
  type FamilyHintEntry,
  resolveOperatorType,
  resolveAllOperatorTypes,
  getBestFamily,
  getAllFamilies,
  resolveSemanticTerms,
  type SemanticResolution,
};

// ─── Prompt Resolution (combines templates + semantic resolution) ───────────

export interface PromptResolution {
  prompt: string;
  operatorType: string;
  allOperatorTypes: Array<{ opType: string; score: number }>;
  family: string;
  allFamilies: Array<{ family: string; score: number }>;
  matchingTemplates: NetworkTemplate[];
}

/**
 * Fully resolve a natural-language prompt: operator type, family, templates.
 * This is the convenience entry point for the MCP server.
 */
export function resolvePrompt(prompt: string): PromptResolution {
  return {
    prompt,
    operatorType: resolveOperatorType(prompt),
    allOperatorTypes: resolveAllOperatorTypes(prompt, 10),
    family: getBestFamily(prompt),
    allFamilies: getAllFamilies(prompt).map((f) => ({
      family: f.family,
      score: f.score,
    })),
    matchingTemplates: searchTemplates(prompt),
  };
}

// ─── Template Loading ──────────────────────────────────────────────────────

/**
 * Load builtin templates from the JSON file.
 */
function loadBuiltinTemplates(): NetworkTemplate[] {
  try {
    // Use import.meta.url for reliable path resolution in both ESM and CJS contexts
    const thisDir = typeof __dirname !== "undefined"
      ? __dirname
      : dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(thisDir, "../data/templates/builtin-templates.json"),
      resolve(thisDir, "../../data/templates/builtin-templates.json"),
      resolve(process.cwd(), "data/templates/builtin-templates.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
        return (raw.templates || []) as NetworkTemplate[];
      }
    }
  } catch { /* JSON not found or invalid */ }
  return [];
}

// ─── All Network Templates ────────────────────────────────────────────────

/**
 * The built-in (non-POP-chain) templates.
 */
export const NETWORK_TEMPLATES: NetworkTemplate[] = loadBuiltinTemplates();

/**
 * All network templates. Currently identical to NETWORK_TEMPLATES
 * (POP chain templates removed in Fix #5 simplification).
 */
export const ALL_NETWORK_TEMPLATES: NetworkTemplate[] = NETWORK_TEMPLATES;

// ─── Template Lookup ────────────────────────────────────────────────────────

/**
 * Find a network template by name (exact match).
 */
export function getTemplateByName(name: string): NetworkTemplate | undefined {
  return NETWORK_TEMPLATES.find((t) => t.name === name);
}

/**
 * Search templates by tag or description substring.
 */
export function searchTemplates(query: string): NetworkTemplate[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...NETWORK_TEMPLATES];

  const scored = NETWORK_TEMPLATES.map((t) => {
    let score = 0;
    if (t.tags.some((tag) => tag.toLowerCase() === q)) score += 100;
    if (t.tags.some((tag) => tag.toLowerCase().startsWith(q))) score += 50;
    if (t.description.toLowerCase().includes(q)) score += 30;
    if (t.name.toLowerCase().includes(q)) score += 20;
    if (t.tags.some((tag) => tag.toLowerCase().includes(q))) score += 10;
    return { template: t, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.template);
}

/**
 * List all available template names.
 */
export function listTemplateNames(): string[] {
  return NETWORK_TEMPLATES.map((t) => t.name);
}

/**
 * List all unique tags across all templates.
 */
export function listAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const t of NETWORK_TEMPLATES) {
    for (const tag of t.tags) {
      tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}
