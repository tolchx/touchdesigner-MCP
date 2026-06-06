#!/usr/bin/env node

/**
 * POPs Build — Build or update the POP operator knowledge base index.
 *
 * Usage:
 *   node dist/popsBuild.js [--rebuild]
 *
 * This script reads the individual POP JSON files in data/pops/operators/
 * and rebuilds data/pops/index.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "..", "data", "pops");
const OPERATORS_DIR = path.join(DATA_ROOT, "operators");
const INDEX_PATH = path.join(DATA_ROOT, "index.json");

interface PopsEntry {
  pageTitle: string;
  pageSlug: string;
  url: string;
  experimental: boolean;
  tdOpTypeGuess?: string;
  summary?: string;
}

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  if (rebuild) {
    console.log("[popsBuild] Rebuild mode: will overwrite existing index");
  }

  console.log(`[popsBuild] Scanning: ${OPERATORS_DIR}`);

  const files = await fs.readdir(OPERATORS_DIR);
  const operators: PopsEntry[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(OPERATORS_DIR, file);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const doc = JSON.parse(raw);
      const pageSlug = path.basename(file, ".json");
      // Read experimental status from JSON field, fallback to filename heuristic
      const isExperimental: boolean =
        typeof doc.experimental === "boolean"
          ? doc.experimental
          : file.includes("Experimental");

      operators.push({
        pageTitle: doc.pageTitle ?? pageSlug,
        pageSlug,
        url: doc.url ?? `https://docs.derivative.ca/${pageSlug}`,
        experimental: isExperimental,
        tdOpTypeGuess: doc.tdOpTypeGuess,
        summary: doc.summary,
      });
    } catch (err) {
      console.error(`[popsBuild] Error reading ${filePath}:`, err);
    }
  }

  // Write index
  const index = {
    generatedAt: new Date().toISOString(),
    source: {
      categoryUrl: "https://docs.derivative.ca/Category:POP",
    },
    operators,
  };

  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  console.log(`[popsBuild] Index written: ${INDEX_PATH}`);
  console.log(`[popsBuild] Total POPs indexed: ${operators.length}`);
}

main().catch((error) => {
  console.error("[popsBuild] Fatal error:", error);
  process.exitCode = 1;
});
