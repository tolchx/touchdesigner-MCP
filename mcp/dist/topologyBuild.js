#!/usr/bin/env node
/**
 * Build operator topology data from the knowledge base.
 *
 * Reads ops and pops data, infers input/output topology for each operator,
 * and writes a combined topology.json file.
 *
 * Usage:
 *   node dist/topologyBuild.js
 *
 * This generates data/topology.json which is consumed by the graph planner.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "..", "data");
// ─── Family detection ──────────────────────────────────────────────────────
export function detectFamily(name, opData) {
    if (opData?.family)
        return opData.family;
    const upper = name.toUpperCase();
    if (upper.endsWith("TOP"))
        return "TOP";
    if (upper.endsWith("CHOP"))
        return "CHOP";
    if (upper.endsWith("SOP"))
        return "SOP";
    if (upper.endsWith("DAT"))
        return "DAT";
    if (upper.endsWith("POP"))
        return "POP";
    if (upper.endsWith("COMP"))
        return "COMP";
    if (upper.endsWith("MAT"))
        return "MAT";
    return "unknown";
}
// Multi-input operators (accepts 2+ connections)
export const MULTI_INPUT = {
    compositeTOP: -1, addTOP: -1, overTOP: -1, multiplyTOP: -1,
    subtractTOP: -1, differenceTOP: -1, matteTOP: -1, insideTOP: -1,
    outsideTOP: -1, switchTOP: -1, layoutTOP: -1, panelTOP: -1,
    mathCHOP: -1, mergeCHOP: -1, switchCHOP: -1, joinCHOP: -1,
    mergeSOP: -1, switchSOP: -1,
    mergeDAT: -1, switchDAT: -1,
    mergePOP: -1, switchPOP: -1,
};
// Operators with 0 inputs (generators/sources)
export const ZERO_INPUT = new Set([
    "constanttop", "noisetop", "ramptop", "texttop",
    "moviefileintop", "moviefileouttop",
    "constantchop", "noisechop", "lfochop",
    "audiofileinchop", "audiodeviceinchop", "oscchop",
    "gridsop", "spheresop", "boxsop", "circlesop", "tubesop", "textsop",
    "textdat", "tabledat",
    "gridpop", "spherepop", "sprinklepop",
]);
// Operators with 1 input (most filters/transforms)
// Everything not in MULTI_INPUT or ZERO_INPUT defaults to 1
export function getInputCount(opType, opData) {
    const key = opType.toLowerCase();
    if (ZERO_INPUT.has(key))
        return 0;
    // Check multi-input
    for (const [pattern, count] of Object.entries(MULTI_INPUT)) {
        if (key.includes(pattern.toLowerCase()))
            return Math.abs(count);
    }
    // Check operator doc inputs
    if (opData?.inputs && Array.isArray(opData.inputs)) {
        const docInputs = opData.inputs.filter((i) => i.description && i.description !== "-");
        if (docInputs.length > 0)
            return docInputs.length;
    }
    return 1; // Default: single input
}
export function isMultiInput(opType) {
    const key = opType.toLowerCase();
    for (const [pattern, count] of Object.entries(MULTI_INPUT)) {
        if (key.includes(pattern.toLowerCase()) && count < 0)
            return true;
    }
    return false;
}
// ─── Connect-to inference ──────────────────────────────────────────────────
/**
 * Known common connection patterns from real TD projects.
 * Format: sourceFamily → targetFamily (typical flow direction)
 */
export const FAMILY_FLOW = {
    TOP: ["TOP", "CHOP"], // TOP → TOP or TOP → CHOP (CHOP to TOP)
    CHOP: ["CHOP", "TOP"], // CHOP → CHOP or CHOP → TOP
    SOP: ["SOP", "POP"], // SOP → SOP or SOP → POP
    POP: ["POP", "TOP"], // POP → POP (stays in GPU) or POP → TOP (render)
    DAT: ["DAT", "CHOP"], // DAT → DAT or DAT → CHOP
    COMP: ["COMP"],
    MAT: ["MAT"],
};
export function inferConnectsTo(opType, family, opData) {
    const results = new Set();
    // From commonCombinations in the operator doc
    if (opData?.commonCombinations && Array.isArray(opData.commonCombinations)) {
        for (const cc of opData.commonCombinations) {
            const ops = cc.operators || cc.with || [];
            for (const o of ops) {
                if (o !== opType && o !== opData.pageSlug) {
                    results.add(o);
                }
            }
        }
    }
    // Infer from family flow
    const allowedFamilies = FAMILY_FLOW[family] || [];
    if (family === "TOP") {
        if (opType.includes("render") || opType.includes("out")) {
            results.add("nullTOP");
            results.add("moviefileoutTOP");
        }
        else if (opType.includes("blur")) {
            results.add("compositeTOP");
            results.add("levelTOP");
            results.add("transformTOP");
            results.add("nullTOP");
        }
        else if (opType.includes("composite") || opType.includes("over")) {
            results.add("nullTOP");
            results.add("blurTOP");
            results.add("transformTOP");
        }
        else if (opType.includes("noise") || opType.includes("constant")) {
            results.add("compositeTOP");
            results.add("levelTOP");
            results.add("blurTOP");
            results.add("transformTOP");
            results.add("displaceTOP");
        }
        else if (opType.includes("glsl")) {
            results.add("nullTOP");
            results.add("blurTOP");
            results.add("compositeTOP");
        }
    }
    else if (family === "CHOP") {
        if (opType.includes("audio")) {
            results.add("audiospectrumCHOP");
            results.add("mathCHOP");
            results.add("lagCHOP");
            results.add("nullCHOP");
        }
        else if (opType.includes("math") || opType.includes("filter")) {
            results.add("nullCHOP");
            results.add("mergeCHOP");
            results.add("choptoTOP");
        }
        else if (opType.includes("merge")) {
            results.add("nullCHOP");
            results.add("choptoTOP");
        }
    }
    else if (family === "POP") {
        if (opType.includes("particle")) {
            results.add("noisePOP");
            results.add("forcePOP");
            results.add("forceRadialPOP");
            results.add("turbulencePOP");
            results.add("dragPOP");
            results.add("colorPOP");
            results.add("trailPOP");
            results.add("nullPOP");
            results.add("renderPOP");
            results.add("lookupPOP");
        }
        else if (opType.includes("force") || opType.includes("noise")) {
            results.add("nullPOP");
            results.add("particlePOP");
        }
        else if (opType.includes("null") || opType.includes("out")) {
            results.add("particlePOP");
            results.add("renderPOP");
        }
    }
    else if (family === "SOP") {
        if (opType.includes("grid") || opType.includes("sphere") || opType.includes("circle")) {
            results.add("noiseSOP");
            results.add("transformSOP");
            results.add("nullSOP");
        }
    }
    return [...results].slice(0, 10);
}
export function inferCommonCombinations(opType, family, connectsTo, opData) {
    const patterns = [];
    // From operator doc (most reliable)
    if (opData?.commonCombinations && Array.isArray(opData.commonCombinations)) {
        for (const cc of opData.commonCombinations) {
            patterns.push({
                operators: cc.operators || cc.with || [],
                description: cc.description || cc.why || "",
                frequency: 3,
            });
        }
    }
    // Infer basic patterns
    if (family === "TOP" && !patterns.length) {
        if (opType.includes("noise") || opType.includes("constant") || opType.includes("ramp")) {
            patterns.push({
                operators: [opType, "levelTOP", "compositeTOP", "nullTOP"],
                description: "Source → level adjustment → composite → output",
            });
        }
        if (opType.includes("blur")) {
            patterns.push({
                operators: ["noiseTOP", opType, "compositeTOP", "nullTOP"],
                description: "Source → blur → composite → output",
            });
        }
    }
    return patterns;
}
export function buildTopologyForOperator(opType, opData) {
    const family = detectFamily(opType, opData);
    const inputCount = getInputCount(opType, opData);
    const multi = isMultiInput(opType);
    const label = opData?.pageTitle || opData?.label || opType;
    // Build inputs
    const inputs = [];
    if (inputCount === 0) {
        // Generator — no inputs but add a note
        inputs.push({ index: -1, name: "none", accepts: "none", description: "Generator — no inputs" });
    }
    else {
        for (let i = 0; i < Math.max(inputCount, 1); i++) {
            inputs.push({
                index: i,
                name: i === 0 ? "input" : `input${i + 1}`,
                accepts: family,
                description: i === 0 ? "Primary input" : `Input ${i + 1}`,
            });
        }
        if (multi) {
            inputs.push({
                index: inputCount,
                name: "additional",
                accepts: family,
                description: "Additional inputs supported (multi-input operator)",
            });
        }
    }
    // Build outputs
    const outputs = [{
            name: "output",
            type: family,
        }];
    // Connects-to
    const connectsTo = inferConnectsTo(opType, family, opData);
    // Common combinations
    const commonCombinations = inferCommonCombinations(opType, family, connectsTo, opData);
    // Warnings
    const warnings = [];
    if (opType === "feedbackTOP") {
        warnings.push("Needs 'top' parameter set to reference the feedback source TOP");
    }
    if (opType === "particlePOP") {
        warnings.push("Requires Target Feedback Loop POP parameter set to downstream Null POP");
    }
    if (opType === "feedbackPOP") {
        warnings.push("Needs target POP parameter set");
    }
    if (opType === "glslTOP" || opType === "glslPOP") {
        warnings.push("GLSL uniforms configured via Values page, not direct input wires");
    }
    return {
        opType,
        family,
        label,
        inputCount: inputCount === 0 ? 0 : (multi ? -Math.abs(inputCount) : inputCount),
        isMultiInput: multi,
        inputs,
        outputs,
        connectsTo,
        commonCombinations,
        warnings,
        pageSlug: opData?.pageSlug,
    };
}
export async function main() {
    console.log("[topologyBuild] Building operator topology database...");
    const topology = {};
    // Load ops from OPS index
    const opsIndexPath = path.join(DATA_ROOT, "ops", "index.json");
    const popsIndexPath = path.join(DATA_ROOT, "pops", "index.json");
    let totalOps = 0;
    // Process OPS index
    if (fs.existsSync(opsIndexPath)) {
        const opsIndex = JSON.parse(fs.readFileSync(opsIndexPath, "utf-8"));
        const operators = opsIndex.operators || [];
        for (const op of operators) {
            let opType = op.tdOpTypeGuess || "";
            if (!opType) {
                // Derive from pageSlug
                opType = (op.pageSlug || "").replace(/_/g, "").replace(/^(.)/, (c) => c.toLowerCase());
                // Strip _TOP, _CHOP suffix
                opType = opType.replace(/(TOP|CHOP|SOP|DAT)$/, "$1");
                // Ensure camelCase ends with family
                if (!/TOP$|CHOP$|SOP$|DAT$/.test(opType)) {
                    const family = op.family || "TOP";
                    opType = opType + family;
                }
            }
            if (opType && !topology[opType]) {
                topology[opType] = buildTopologyForOperator(opType, op);
                totalOps++;
            }
        }
    }
    // Process POPS index
    if (fs.existsSync(popsIndexPath)) {
        const popsIndex = JSON.parse(fs.readFileSync(popsIndexPath, "utf-8"));
        const operators = popsIndex.operators || [];
        for (const op of operators) {
            let opType = op.tdOpTypeGuess || "";
            if (!opType) {
                opType = (op.pageSlug || "").replace(/_/g, "").replace(/^(.)/, (c) => c.toLowerCase());
                if (!/POP$/.test(opType))
                    opType = opType + "POP";
            }
            if (opType && !topology[opType]) {
                // Try to load full operator doc for richer data
                let fullDoc = null;
                const docPath = path.join(DATA_ROOT, "pops", "operators", `${op.pageSlug}.json`);
                if (fs.existsSync(docPath)) {
                    try {
                        fullDoc = JSON.parse(fs.readFileSync(docPath, "utf-8"));
                    }
                    catch { /* skip */ }
                }
                topology[opType] = buildTopologyForOperator(opType, fullDoc || op);
                totalOps++;
            }
        }
    }
    // Add essential operators that might be missing
    const ESSENTIAL = [
        ["noiseTOP", "TOP"], ["constantTOP", "TOP"], ["blurTOP", "TOP"],
        ["levelTOP", "TOP"], ["transformTOP", "TOP"], ["compositeTOP", "TOP"],
        ["nullTOP", "TOP"], ["outTOP", "TOP"], ["overTOP", "TOP"],
        ["feedbackTOP", "TOP"], ["rampTOP", "TOP"], ["textTOP", "TOP"],
        ["moviefileinTOP", "TOP"], ["moviefileoutTOP", "TOP"],
        ["mathCHOP", "CHOP"], ["noiseCHOP", "CHOP"], ["lfoCHOP", "CHOP"],
        ["constantCHOP", "CHOP"], ["mergeCHOP", "CHOP"], ["nullCHOP", "CHOP"],
        ["audiofileinCHOP", "CHOP"], ["audiospectrumCHOP", "CHOP"],
        ["choptoTOP", "TOP"],
        ["noiseSOP", "SOP"], ["gridSOP", "SOP"], ["sphereSOP", "SOP"],
        ["boxSOP", "SOP"], ["transformSOP", "SOP"], ["nullSOP", "SOP"],
        ["nullDAT", "DAT"], ["textDAT", "DAT"], ["tableDAT", "DAT"],
        ["containerCOMP", "COMP"], ["geometryCOMP", "COMP"],
        ["particlePOP", "POP"], ["noisePOP", "POP"], ["forcePOP", "POP"],
        ["forceRadialPOP", "POP"], ["turbulencePOP", "POP"], ["dragPOP", "POP"],
        ["colorPOP", "POP"], ["trailPOP", "POP"], ["feedbackPOP", "POP"],
        ["nullPOP", "POP"], ["renderPOP", "POP"], ["mergePOP", "POP"],
        ["glslPOP", "POP"], ["gridPOP", "POP"], ["spherePOP", "POP"],
        ["sprinklePOP", "POP"], ["lookupPOP", "POP"], ["neighborPOP", "POP"],
        ["sortPOP", "POP"], ["fieldPOP", "POP"], ["cachePOP", "POP"],
        ["copypop", "POP"],
    ];
    for (const [opType, family] of ESSENTIAL) {
        if (!topology[opType]) {
            topology[opType] = buildTopologyForOperator(opType, { family });
            totalOps++;
        }
    }
    // Write topology.json
    const outputPath = path.join(DATA_ROOT, "topology.json");
    const output = {
        generatedAt: new Date().toISOString(),
        totalOperators: totalOps,
        operators: topology,
    };
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
    console.log(`[topologyBuild] Written: ${outputPath}`);
    console.log(`[topologyBuild] Total operators with topology: ${totalOps}`);
    // Print summary by family
    const byFamily = {};
    for (const [, t] of Object.entries(topology)) {
        byFamily[t.family] = (byFamily[t.family] || 0) + 1;
    }
    for (const [fam, count] of Object.entries(byFamily).sort()) {
        console.log(`  ${fam}: ${count}`);
    }
}
// Only run main() when executed directly, not when imported as a module
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith("topologyBuild.js");
if (isMainModule) {
    main().catch((error) => {
        console.error("[topologyBuild] Fatal error:", error);
        process.exitCode = 1;
    });
}
