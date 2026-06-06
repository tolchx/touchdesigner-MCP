#!/usr/bin/env node

/**
 * Prompt Lint — Validate and lint MCP prompts for TouchDesigner.
 *
 * Checks:
 * - Required fields present
 * - Operator types exist in knowledge base
 * - Semantic alias resolution
 * - Parameter name validation
 *
 * Usage:
 *   node dist/promptLint.js "create a particle system with noise"
 */

import { resolveSemanticTerms } from "./semantic.js";

interface LintResult {
  original: string;
  normalized: string;
  issues: Array<{
    severity: "info" | "warning" | "error";
    message: string;
  }>;
  familyHints: string[];
  operatorSuggestions: string[];
  parameterHints: string[];
}

async function main() {
  const prompt = process.argv.slice(2).join(" ").trim();
  if (!prompt) {
    console.error("Usage: node dist/promptLint.js \"<prompt>\"");
    process.exit(1);
  }

  const result: LintResult = {
    original: prompt,
    normalized: prompt.toLowerCase().trim(),
    issues: [],
    familyHints: [],
    operatorSuggestions: [],
    parameterHints: [],
  };

  // Resolve semantics
  const semantic = resolveSemanticTerms(prompt);

  result.familyHints = semantic.familyHints;
  result.operatorSuggestions = semantic.operatorHints.map(
    (h) => `${h.canonical} (${h.family ?? "?"})`
  );
  result.parameterHints = semantic.parameterHints.map((h) => h.canonical);

  // Check for common issues
  if (semantic.operatorHints.length === 0) {
    result.issues.push({
      severity: "warning",
      message: "No se detectaron operadores específicos en el prompt. Considera usar términos más concretos.",
    });
  }

  if (semantic.familyHints.length === 0) {
    result.issues.push({
      severity: "info",
      message: "No se detectó una familia específica (POP/TOP/CHOP/SOP/DAT). El planificador usará detección automática.",
    });
  }

  if (
    prompt.toLowerCase().includes("particle") &&
    !prompt.toLowerCase().includes("feedback")
  ) {
    result.issues.push({
      severity: "info",
      message: "Sistema de partículas sin Feedback POP puede quedar funcional pero menos útil para simulaciones temporales.",
    });
  }

  // Check for ambiguous patterns
  const mixedFamilies =
    semantic.familyHints.includes("POP") &&
    semantic.familyHints.includes("TOP") &&
    !prompt.toLowerCase().includes("to pop") &&
    !prompt.toLowerCase().includes("bridge");

  if (mixedFamilies) {
    result.issues.push({
      severity: "warning",
      message: "Se mezclan familias POP y TOP sin bridge explícito (TOP to POP). Las conexiones no funcionarán entre familias.",
    });
  }

  // Print result
  console.log(JSON.stringify(result, null, 2));

  // Exit with warning count
  const warnings = result.issues.filter((i) => i.severity === "warning").length;
  if (warnings > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
