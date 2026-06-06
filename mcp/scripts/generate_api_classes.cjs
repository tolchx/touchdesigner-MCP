#!/usr/bin/env node
/**
 * generate_api_classes.js
 * Reads ops/index.json + pops/index.json and their individual operator JSON files,
 * then produces a comprehensive python-api-classes.json with all 609+
 * TouchDesigner Python classes, their parameters, inputs, and descriptions.
 *
 * Usage: node generate_api_classes.js [--full]
 *   --full : read individual operator JSONs for detailed params (slower)
 *   (default) : use only index data for speed; no detailed params
 *
 * Output: prints JSON to stdout, or writes to data/reference/python-api-classes.json
 *   if --write is passed (or by default when not piped)
 */

const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..');
const DATA_DIR = path.join(BASE, 'data');
const OPS_INDEX = path.join(DATA_DIR, 'ops', 'index.json');
const POPS_INDEX = path.join(DATA_DIR, 'pops', 'index.json');
const OPS_OPERATORS_DIR = path.join(DATA_DIR, 'ops', 'operators');
const POPS_OPERATORS_DIR = path.join(DATA_DIR, 'pops', 'operators');
const OUTPUT_FILE = path.join(DATA_DIR, 'reference', 'python-api-classes.json');

// Parse args
const args = process.argv.slice(2);
const FULL_MODE = args.includes('--full');
const WRITE_MODE = args.includes('--write') || !process.stdout.isTTY;

/**
 * Extract a clean description from the summary field.
 * The summary often has "[ edit ]" prefix, wiki table-of-contents, etc.
 */
function extractDescription(summary) {
  if (!summary) return '';
  // Remove leading "[  edit  ]\n"
  let desc = summary.replace(/^\[\s*edit\s*\]\s*/i, '');
  // Remove the "_Class" marker and everything after "Contents\n"
  const contentsIdx = desc.search(/\n\s*Contents?\s*\n/i);
  if (contentsIdx !== -1) {
    desc = desc.substring(0, contentsIdx);
  }
  // Also remove trailing "ClassName_Class\n" pattern
  desc = desc.replace(/\n[a-zA-Z]+TOP_Class|_CHOP_Class|_SOP_Class|_DAT_Class|_COMP_Class|_POP_Class.*$/, '');
  // Clean up
  desc = desc.replace(/\s+/g, ' ').trim();
  return desc;
}

/**
 * Convert tdOpTypeGuess to Python-style class name.
 * e.g. "addTOP" -> "NoiseTOP" (but we keep the tdOpTypeGuess as the class name in TD Python)
 * Actually in TouchDesigner Python, you use: op('/').create(td.addTOP)
 * The class name is capitalized: e.g. addTOP -> AddTOP
 */
function guessClassName(tdOpTypeGuess) {
  if (!tdOpTypeGuess) return '';
  // Capitalize first letter properly
  // addTOP -> AddTOP, noiseTOP -> NoiseTOP, timerCHOP -> TimerCHOP
  // The convention is: the type guess is camelCase with type suffix capitalized
  // We just capitalize the first letter
  return tdOpTypeGuess.charAt(0).toUpperCase() + tdOpTypeGuess.slice(1);
}

/**
 * Read a single operator JSON file.
 */
function readOperatorFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`  [WARN] Failed to read ${filePath}: ${e.message}`, { filePath });
    return null;
  }
}

/**
 * Format parameters for the output, stripping verbose data.
 */
function formatParameters(params) {
  if (!params || !Array.isArray(params) || params.length === 0) return [];
  return params.map(p => ({
    name: p.name || '',
    label: p.label || '',
    page: p.page || '',
    description: (p.description || '').replace(/\s+/g, ' ').trim(),
    type: p.type || null,
    default: p.default !== undefined ? p.default : null
  }));
}

/**
 * Format inputs for the output.
 */
function formatInputs(inputs) {
  if (!inputs || !Array.isArray(inputs) || inputs.length === 0) return [];
  return inputs.map(inp => ({
    index: inp.index,
    description: (inp.description || '').replace(/\s+/g, ' ').trim()
  }));
}

/**
 * Main generator
 */
async function main() {
  console.error(`[generate_api_classes] Starting...`);
  console.error(`[generate_api_classes] Full mode (read individual files): ${FULL_MODE}`);

  // 1. Load indices
  const opsIndex = JSON.parse(fs.readFileSync(OPS_INDEX, 'utf-8'));
  const popsIndex = JSON.parse(fs.readFileSync(POPS_INDEX, 'utf-8'));

  const allOps = opsIndex.operators || [];
  const allPops = popsIndex.operators || [];

  console.error(`[generate_api_classes] Loaded ${allOps.length} ops + ${allPops.length} pops = ${allOps.length + allPops.length} total`);

  // 2. Group by family
  const families = {
    'TOP': [],
    'CHOP': [],
    'SOP': [],
    'DAT': [],
    'COMP': [],
    'POP': []
  };

  // Process each operator from the index + optional individual files
  function processOperators(operators, opsOperatorsDir) {
    for (const op of operators) {
      let family = op.family || 'POP'; // POPs don't have family field, default to POP
      if (!families[family]) families[family] = [];

      const tdType = op.tdOpTypeGuess;
      if (!tdType) {
        console.error(`  [SKIP] No tdOpTypeGuess for ${op.pageTitle}`);
        continue;
      }

      // Build class entry
      const entry = {
        name: tdType,
        class: guessClassName(tdType),
        description: extractDescription(op.summary || ''),
        parameters: [],
        methods: [],
        inputs: [],
        url: op.url || ''
      };

      // In full mode, read the individual operator JSON for detailed params
      if (FULL_MODE && opsOperatorsDir) {
        // Look for the operator file: family/slug.json
        const slug = op.pageSlug;
        // POP operators are flat in opsOperatorsDir, others are in subdirectories
        let filePath;
        if (family === 'POP') {
          filePath = path.join(opsOperatorsDir, `${slug}.json`);
        } else {
          filePath = path.join(opsOperatorsDir, family, `${slug}.json`);
        }

        const opDetail = readOperatorFile(filePath);
        if (opDetail) {
          entry.parameters = formatParameters(opDetail.parameters);
          entry.inputs = formatInputs(opDetail.inputs);
          // POPs have 'description' field instead of 'summary'
          if (opDetail.description) {
            let desc = opDetail.description.replace(/\s+/g, ' ').trim();
            if (desc.length > entry.description.length) {
              entry.description = desc;
            }
          }
          // Also try summary from detail
          if (!entry.description && opDetail.summary) {
            entry.description = extractDescription(opDetail.summary);
          }
          // Last resort: use first useCase as description
          if (!entry.description && opDetail.useCases && opDetail.useCases.length > 0) {
            entry.description = opDetail.useCases[0];
          }
        } else {
          console.error(`  [MISS] No detail file for ${tdType} at ${filePath}`);
        }
      }

      families[family].push(entry);
    }
  }

  // Process OPs
  processOperators(allOps, OPS_OPERATORS_DIR);

  // Process POPs
  processOperators(allPops, POPS_OPERATORS_DIR);

  // Remove empty families
  const classes = {};
  for (const [family, ops] of Object.entries(families)) {
    if (ops.length > 0) {
      classes[family] = ops;
    }
  }

  // 3. Build output
  const totalClasses = Object.values(classes).reduce((sum, arr) => sum + arr.length, 0);
  const output = {
    generatedAt: new Date().toISOString().split('T')[0],
    totalClasses,
    classes
  };

  // 4. Output
  const json = JSON.stringify(output, null, 2);

  if (WRITE_MODE) {
    fs.writeFileSync(OUTPUT_FILE, json, 'utf-8');
    console.error(`[generate_api_classes] Done! Written to ${OUTPUT_FILE}`);
    console.error(`[generate_api_classes] Total classes: ${totalClasses}`);
    for (const [family, ops] of Object.entries(classes)) {
      console.error(`  ${family}: ${ops.length} classes`);
    }
    console.log(json);
  } else {
    console.log(json);
  }
}

main().catch(err => {
  console.error(`[generate_api_classes] Error: ${err.message}`);
  process.exit(1);
});
