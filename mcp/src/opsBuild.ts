#!/usr/bin/env node

/**
 * Ops Build — Build or update the operator knowledge base index
 * from the Derivative wiki JSON data files.
 *
 * Usage:
 *   node dist/opsBuild.js [--rebuild]
 *
 * This script reads the individual operator JSON files in data/ops/operators/
 * and rebuilds data/ops/index.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { TdFamily } from "./opsDb.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "..", "data", "ops");
const OPERATORS_DIR = path.join(DATA_ROOT, "operators");
const INDEX_PATH = path.join(DATA_ROOT, "index.json");

interface OperatorEntry {
  family: TdFamily;
  pageTitle: string;
  pageSlug: string;
  url: string;
  tdOpTypeGuess?: string;
  summary?: string;
}

async function main() {
  const rebuild = process.argv.includes("--rebuild");
  if (rebuild) {
    console.log("[opsBuild] Rebuild mode: will overwrite existing index");
  }

  console.log(`[opsBuild] Scanning: ${OPERATORS_DIR}`);

  const families = ["CHOP", "DAT", "SOP", "TOP"] as const;
  const operators: OperatorEntry[] = [];

  for (const family of families) {
    const familyDir = path.join(OPERATORS_DIR, family);
    try {
      const files = await fs.readdir(familyDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(familyDir, file);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          const doc = JSON.parse(raw);
          const pageSlug = path.basename(file, ".json");

          operators.push({
            family,
            pageTitle: doc.pageTitle ?? pageSlug,
            pageSlug,
            url: doc.url ?? `https://docs.derivative.ca/${pageSlug}`,
            tdOpTypeGuess: doc.tdOpTypeGuess,
            summary: doc.summary,
          });
        } catch (err) {
          console.error(`[opsBuild] Error reading ${filePath}:`, err);
        }
      }
    } catch (err) {
      console.error(`[opsBuild] Error reading family dir ${familyDir}:`, err);
    }
  }

  // Write index
  const index = {
    generatedAt: new Date().toISOString(),
    source: {
      categories: {
        CHOP: "https://docs.derivative.ca/Category:CHOP",
        DAT: "https://docs.derivative.ca/Category:DAT",
        SOP: "https://docs.derivative.ca/Category:SOP",
        TOP: "https://docs.derivative.ca/Category:TOP",
      } as Record<TdFamily, string>,
    },
    operators,
  };

  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  console.log(`[opsBuild] Index written: ${INDEX_PATH}`);
  console.log(`[opsBuild] Total operators indexed: ${operators.length}`);

  // Summary by family
  const counts: Record<string, number> = {};
  for (const op of operators) {
    counts[op.family] = (counts[op.family] ?? 0) + 1;
  }
  for (const [family, count] of Object.entries(counts)) {
    console.log(`[opsBuild]   ${family}: ${count}`);
  }
}

main().catch((error) => {
  console.error("[opsBuild] Fatal error:", error);
  process.exitCode = 1;
});
