/**
 * Topology Data — Types, pattern tables, inference, and catalog builder
 *
 * Extracted from networkPlannerGraph.ts to separate data/logic from planning.
 */
import { ensureKnowledgeLoaded, getOpsMap, getPopsMap } from "./knowledgeCache.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// ─── Topology data path resolution ─────────────────────────────────────────
const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));
function getTopologyDataDir() {
    const candidates = [
        resolve(thisDir, "../data"),
        resolve(thisDir, "../../data"),
        resolve(process.cwd(), "data"),
    ];
    for (const p of candidates) {
        if (existsSync(p))
            return p;
    }
    return resolve(thisDir, "../data");
}
// ─── Topology inference ────────────────────────────────────────────────────
/**
 * Input count inference by family and type.
 * Many operators accept unlimited inputs (maxInputs === -1 means "many").
 * This is conservative — assumes 1 unless we know otherwise.
 */
export const MULTI_INPUT_PATTERNS = {
    // TOPs
    compositeTOP: { min: 2, max: -1 },
    addTOP: { min: 2, max: -1 },
    overTOP: { min: 2, max: -1 },
    multiplyTOP: { min: 2, max: -1 },
    subtractTOP: { min: 2, max: -1 },
    differenceTOP: { min: 2, max: -1 },
    matteTOP: { min: 2, max: -1 },
    insideTOP: { min: 2, max: -1 },
    outsideTOP: { min: 2, max: -1 },
    switchTOP: { min: 1, max: -1 },
    layoutTOP: { min: 1, max: -1 },
    // CHOPs
    mathCHOP: { min: 1, max: -1 },
    mergeCHOP: { min: 2, max: -1 },
    switchCHOP: { min: 1, max: -1 },
    // SOPs
    mergeSOP: { min: 2, max: -1 },
    switchSOP: { min: 1, max: -1 },
    // DATs
    mergeDAT: { min: 2, max: -1 },
    switchDAT: { min: 1, max: -1 },
    // POPs
    mergePOP: { min: 2, max: -1 },
    blendPOP: { min: 2, max: -1 },
    feedbackPOP: { min: 1, max: 1 },
    particlePOP: { min: 1, max: 1 },
    copyPOP: { min: 2, max: -1 },
    deletePOP: { min: 1, max: 1 },
    limitPOP: { min: 1, max: 1 },
    neighborPOP: { min: 1, max: 1 },
    switchPOP: { min: 1, max: -1 },
    attributePOP: { min: 1, max: 1 },
    colorPOP: { min: 1, max: 1 },
    analyzePOP: { min: 1, max: 1 },
    normalizePOP: { min: 1, max: 1 },
    transformPOP: { min: 1, max: 1 },
    fieldPOP: { min: 1, max: 1 },
    sprinklePOP: { min: 1, max: 1 },
};
export const SINGLE_INPUT_PATTERNS = new Set([
    "blurTOP", "levelTOP", "transformTOP", "lookupTOP", "displaceTOP",
    "rampTOP", "cropTOP", "edgeTOP", "cornerPinTOP", "tileTOP",
    "glslTOP", "feedbackTOP", "cacheTOP", "chromaKeyTOP", "lumakeyerTOP",
    "hsvadjustTOP", "hsvTOP", "monoTOP", "rgbkeyTOP", "thresholdTOP",
    "reorderTOP", "resolutionTOP", "constantTOP", "noiseTOP",
    "textTOP", "moviefileinTOP", "moviefileoutTOP", "nullTOP",
    "outTOP", "inTOP", "infoTOP", "selectTOP",
    "lagCHOP", "filterCHOP", "audioCHOP", "audiofileinCHOP",
    "audioDeviceInCHOP", "oscCHOP", "noiseCHOP", "constantCHOP",
    "lfoCHOP", "countCHOP", "speedCHOP", "timerCHOP",
    "nullCHOP", "outCHOP", "inCHOP", "selectCHOP",
    "noiseSOP", "gridSOP", "sphereSOP", "circleSOP", "tubeSOP",
    "boxSOP", "textSOP", "transformSOP", "nullSOP",
    "textDAT", "tableDAT", "scriptDAT", "executeDAT",
    "nullDAT", "selectDAT",
    "gridPOP", "spherePOP", "noisePOP", "forcePOP",
    "forceRadialPOP", "turbulencePOP", "dragPOP", "colorPOP",
    "spritePOP", "trailPOP", "lookupPOP",
    "glslPOP", "glslCreatePOP", "glslAdvancedPOP",
    "patternPOP", "attributePOP", "analyzePOP",
    "nullPOP", "outPOP", "inPOP", "selectPOP",
    "renderPOP", "cachePOP",
    "transformPOP", "normalizePOP", "sortPOP",
    "copyPOP", "deletePOP", "limitPOP", "blendPOP",
    "sprinklePOP", "boxPOP", "circlePOP", "tubePOP",
    "torusPOP", "linePOP", "pointPOP",
    "glslCreatePOP", "glslAdvancedPOP",
]);
/**
 * Infer topology data for a given operator from the knowledge base
 * and pattern tables.
 */
export function inferOpTopology(opType, opData) {
    const family = opData?.family
        || (opType.endsWith("TOP") ? "TOP"
            : opType.endsWith("CHOP") ? "CHOP"
                : opType.endsWith("SOP") ? "SOP"
                    : opType.endsWith("DAT") ? "DAT"
                        : opType.endsWith("POP") ? "POP"
                            : opType.endsWith("COMP") ? "COMP"
                                : "unknown");
    const label = opData?.pageTitle || opData?.label || opType;
    // Determine input count
    let inputCount = 1;
    let isMultiInput = false;
    const pattern = MULTI_INPUT_PATTERNS[opType];
    if (pattern) {
        inputCount = pattern.min;
        isMultiInput = pattern.max === -1 || pattern.max > 2;
    }
    else if (SINGLE_INPUT_PATTERNS.has(opType)) {
        inputCount = 1;
        isMultiInput = false;
    }
    else if (opType.includes("merge") || opType.includes("composite") || opType.includes("switch")) {
        inputCount = 2;
        isMultiInput = true;
    }
    // Build input descriptions
    const inputs = [];
    for (let i = 0; i < inputCount; i++) {
        inputs.push({
            index: i,
            description: i === 0 ? "Primary input" : `Input ${i}`,
            accepts: family,
        });
    }
    if (isMultiInput) {
        inputs.push({
            index: inputCount,
            description: `Additional inputs supported`,
            accepts: family,
        });
    }
    // Determine outputs
    const outputs = [
        { name: "output", type: family },
    ];
    // Common combinations from operator doc
    const commonCombinations = (opData?.commonCombinations || []).map((cc) => ({
        operators: Array.isArray(cc.operators)
            ? cc.operators
            : (cc.with || []),
        description: cc.description || cc.why || "",
    }));
    // Warnings
    const warnings = [];
    if (opType === "feedbackTOP") {
        warnings.push("Needs 'top' parameter set to reference the feedback source");
    }
    if (opType === "particlePOP") {
        warnings.push("Requires a Null POP as feedback target via particlesupdatepop parameter");
    }
    if (opType === "feedbackPOP") {
        warnings.push("Needs target POP set to the downstream Null POP");
    }
    if (opType === "noisePOP") {
        warnings.push("Requires an input connection — cannot run standalone");
    }
    if (opType === "glslPOP" || opType === "glslCreatePOP" || opType === "glslAdvancedPOP") {
        warnings.push("Requires matching attribute declarations (P, Vel, Cd) in GLSL shader");
    }
    if (opType === "neighborPOP") {
        warnings.push("Performance-sensitive — limit neighbor count for large point clouds");
    }
    if (opType === "fieldPOP") {
        warnings.push("Requires proximity to source geometry — place near attractor/repulsor");
    }
    if (opType === "copyPOP") {
        warnings.push("Needs a source geometry (input 0) and template geometry (input 1)");
    }
    // Connects-to inference
    const connectsTo = [];
    for (const cc of commonCombinations) {
        for (const o of cc.operators) {
            if (o !== opType && !connectsTo.includes(o)) {
                connectsTo.push(o);
            }
        }
    }
    return {
        opType,
        family,
        label,
        inputCount,
        inputs,
        outputs,
        connectsTo,
        isMultiInput,
        warnings,
        commonCombinations,
    };
}
// ─── Build topology catalog ────────────────────────────────────────────────
/**
 * Build a full topology catalog from the knowledge base AND topology.json.
 * Returns a map of opType → OpTopology.
 * Priority: topology.json > knowledge base inference > pattern tables.
 */
export function buildTopologyCatalog() {
    ensureKnowledgeLoaded();
    const opsMap = getOpsMap();
    const popsMap = getPopsMap();
    const allOps = { ...opsMap, ...popsMap };
    const catalog = new Map();
    // ── First pass: load from topology.json if it exists ──
    let topologyJson = null;
    try {
        const dataDir = getTopologyDataDir();
        const topoPath = `${dataDir}/topology.json`;
        if (existsSync(topoPath)) {
            topologyJson = JSON.parse(readFileSync(topoPath, "utf-8"))?.operators || null;
        }
    }
    catch { /* topology.json doesn't exist yet */ }
    if (topologyJson) {
        for (const [opType, topoData] of Object.entries(topologyJson)) {
            const td = topoData;
            catalog.set(opType, {
                opType: td.opType || opType,
                family: td.family || "unknown",
                label: td.label || opType,
                inputCount: td.inputCount ?? 1,
                inputs: td.inputs || [{ index: 0, description: "Input", accepts: td.family }],
                outputs: td.outputs || [{ name: "output", type: td.family || "TOP" }],
                connectsTo: td.connectsTo || [],
                isMultiInput: td.isMultiInput || false,
                warnings: td.warnings || [],
                commonCombinations: td.commonCombinations || [],
            });
        }
        // If topology.json is comprehensive enough, skip inference
        if (catalog.size > 50)
            return catalog;
    }
    // ── Second pass: infer from knowledge base ──
    for (const [key, opData] of Object.entries(allOps)) {
        let opType = opData?.tdOpTypeGuess || opData?.pageSlug || key;
        if (opType.match(/^[A-Z].*(_TOP|_CHOP|_SOP|_DAT|_POP)$/)) {
            opType = opType
                .replace(/_(TOP|CHOP|SOP|DAT|POP)$/, "$1")
                .replace(/^[A-Z]/, (c) => c.toUpperCase())
                .replace(/(?<=[a-z])([A-Z])/g, "_$1")
                .toLowerCase();
        }
        if (!opType.endsWith("TOP") && !opType.endsWith("CHOP")
            && !opType.endsWith("SOP") && !opType.endsWith("DAT")
            && !opType.endsWith("POP") && !opType.endsWith("COMP")) {
            if (key.endsWith("TOP"))
                opType = key.charAt(0).toLowerCase() + key.slice(1);
            else if (key.endsWith("CHOP"))
                opType = key.charAt(0).toLowerCase() + key.slice(1);
            else if (key.endsWith("POP"))
                opType = key.charAt(0).toLowerCase() + key.slice(1);
            else
                continue;
        }
        if (!catalog.has(opType)) {
            catalog.set(opType, inferOpTopology(opType, opData));
        }
    }
    // Add common operators that might not be in the KB
    const COMMON_EXTRAS = [
        ["noiseTOP", "TOP"], ["constantTOP", "TOP"], ["blurTOP", "TOP"],
        ["levelTOP", "TOP"], ["transformTOP", "TOP"], ["compositeTOP", "TOP"],
        ["nullTOP", "TOP"], ["outTOP", "TOP"], ["moviefileinTOP", "TOP"],
        ["moviefileoutTOP", "TOP"], ["overTOP", "TOP"], ["switchTOP", "TOP"],
        ["feedbackTOP", "TOP"], ["rampTOP", "TOP"], ["textTOP", "TOP"],
        ["glslTOP", "TOP"], ["layoutTOP", "TOP"], ["infoTOP", "TOP"],
        ["mathCHOP", "CHOP"], ["noiseCHOP", "CHOP"], ["lfoCHOP", "CHOP"],
        ["constantCHOP", "CHOP"], ["mergeCHOP", "CHOP"], ["nullCHOP", "CHOP"],
        ["selectCHOP", "CHOP"], ["lagCHOP", "CHOP"], ["filterCHOP", "CHOP"],
        ["audiofileinCHOP", "CHOP"], ["audioDeviceInCHOP", "CHOP"],
        ["audiospectrumCHOP", "CHOP"], ["trailCHOP", "CHOP"],
        ["choptoTOP", "TOP"],
        ["noiseSOP", "SOP"], ["gridSOP", "SOP"], ["sphereSOP", "SOP"],
        ["boxSOP", "SOP"], ["transformSOP", "SOP"], ["nullSOP", "SOP"],
        ["mergeSOP", "SOP"],
        ["textDAT", "DAT"], ["tableDAT", "DAT"], ["nullDAT", "DAT"],
        ["containerCOMP", "COMP"], ["geometryCOMP", "COMP"],
        ["cameraCOMP", "COMP"], ["lightCOMP", "COMP"], ["windowCOMP", "COMP"],
        ["particlePOP", "POP"], ["noisePOP", "POP"], ["forcePOP", "POP"],
        ["forceRadialPOP", "POP"], ["turbulencePOP", "POP"], ["dragPOP", "POP"],
        ["colorPOP", "POP"], ["spritePOP", "POP"], ["trailPOP", "POP"],
        ["feedbackPOP", "POP"], ["nullPOP", "POP"], ["renderPOP", "POP"],
        ["mergePOP", "POP"], ["glslPOP", "POP"], ["gridPOP", "POP"],
        ["spherePOP", "POP"], ["lookupPOP", "POP"],
        ["cachePOP", "POP"], ["cacheSelectPOP", "POP"],
        ["neighborPOP", "POP"], ["sortPOP", "POP"], ["fieldPOP", "POP"], ["sprinklePOP", "POP"],
        ["copyPOP", "POP"], ["deletePOP", "POP"], ["limitPOP", "POP"], ["blendPOP", "POP"],
        ["attributePOP", "POP"], ["analyzePOP", "POP"], ["normalizePOP", "POP"],
        ["transformPOP", "POP"], ["glslCreatePOP", "POP"], ["glslAdvancedPOP", "POP"],
        ["patternPOP", "POP"], ["boxPOP", "POP"], ["circlePOP", "POP"],
        ["tubePOP", "POP"], ["torusPOP", "POP"], ["linePOP", "POP"], ["pointPOP", "POP"],
    ];
    for (const [type, family] of COMMON_EXTRAS) {
        if (!catalog.has(type)) {
            catalog.set(type, {
                opType: type,
                family,
                label: type,
                inputCount: SINGLE_INPUT_PATTERNS.has(type) ? 1
                    : MULTI_INPUT_PATTERNS[type]?.min || 1,
                inputs: [{ index: 0, description: "Input", accepts: family }],
                outputs: [{ name: "output", type: family }],
                connectsTo: [],
                isMultiInput: (MULTI_INPUT_PATTERNS[type]?.max || 1) > 2,
                warnings: [],
                commonCombinations: [],
            });
        }
    }
    return catalog;
}
