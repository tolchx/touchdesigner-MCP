/**
 * POP Knowledge — offline access to the validated POP knowledge base.
 *
 * Sources (built from live probes + 102 real .toe projects, see
 * docs/POPs_KNOWLEDGE.md):
 *   data/pops/knowledge/pop_operators.json — 101 POP types with the REAL
 *     parameter names from build 2025.32460 (`live_params`), inputs/outputs,
 *     and wiki↔eval param mapping.
 *   data/pops/patterns.json                — POP→POP edges/chains from the corpus.
 *   data/pops/param_usage.json             — which params are actually written.
 *   data/pops/validation.json              — what is confirmed vs wiki drift.
 *
 * This module is pure offline data access (no TouchDesigner connection), so it
 * is unit-testable without a live TD instance.
 */
import fs from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
function resolveKnowledgePath() {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        // dist/ → ../data (repo-root data dir, mirrored for the MCP package)
        resolve(thisDir, "../data/pops/knowledge/pop_operators.json"),
        resolve(thisDir, "../../data/pops/knowledge/pop_operators.json"),
        resolve(process.cwd(), "data/pops/knowledge/pop_operators.json"),
        resolve(process.cwd(), "mcp/data/pops/knowledge/pop_operators.json"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    return null;
}
let cachedKnowledge = null;
/**
 * Load (and memoize) the POP knowledge base keyed by lowercased type name
 * (e.g. "circlepop"). Aliases: the corpus short name ("circle") also resolves.
 * Returns an empty map if the knowledge file is missing — callers must
 * degrade gracefully (skip validation) instead of blocking all writes.
 */
export function loadPopKnowledge() {
    if (cachedKnowledge)
        return cachedKnowledge;
    const map = new Map();
    const path = resolveKnowledgePath();
    if (!path) {
        console.warn("[popKnowledge] pop_operators.json not found — parameter validation against the knowledge base is disabled");
        return map;
    }
    try {
        const raw = JSON.parse(fs.readFileSync(path, "utf-8"));
        const entries = Array.isArray(raw?.operators)
            ? raw.operators
            : [];
        for (const e of entries) {
            if (!e?.type || !Array.isArray(e.live_params))
                continue;
            const info = {
                type: e.type,
                name: e.name ?? e.type.toLowerCase(),
                family: e.family ?? "POP",
                createdLive: Boolean(e.created_live),
                inputs: Number(e.inputs ?? 0),
                outputs: Number(e.outputs ?? 0),
                paramCount: Number(e.param_count ?? e.live_params.length),
                liveParams: e.live_params,
                validationCategory: e.validation_category ?? null,
                recommendedForNetworks: Boolean(e.recommended_for_networks),
            };
            map.set(e.type.toLowerCase(), info);
            // Corpus short-name alias: "circlePOP" → "circle". (The JSON `name`
            // field is just the lowercased type, so derive the short name.)
            const lowerType = e.type.toLowerCase();
            const short = e.type.endsWith("POP")
                ? e.type.slice(0, -3).toLowerCase()
                : lowerType;
            if (short && short !== lowerType && !map.has(short)) {
                map.set(short, info);
            }
        }
    }
    catch (err) {
        console.warn("[popKnowledge] Failed to load pop_operators.json:", err instanceof Error ? err.message : err);
    }
    cachedKnowledge = map;
    return map;
}
/** Look up a POP type ("circlePOP", "circlepop" or corpus short name "circle"). */
export function getPopInfo(opType) {
    if (!opType)
        return undefined;
    return loadPopKnowledge().get(opType.toLowerCase());
}
/** All known POP type names (canonical, e.g. "circlePOP"). */
export function listPopTypes() {
    const types = new Set();
    for (const info of loadPopKnowledge().values())
        types.add(info.type);
    return [...types].sort();
}
// ─── Fuzzy suggestions ──────────────────────────────────────────────────────
/** Classic Levenshtein edit distance (small strings only — param names). */
function levenshtein(a, b) {
    if (a === b)
        return 0;
    if (!a.length)
        return b.length;
    if (!b.length)
        return a.length;
    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++)
        prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}
/**
 * Suggest the closest real parameter names for an unknown name.
 * Pure function — exported for direct unit testing.
 */
export function suggestParameterNames(knownNames, badName, max = 5) {
    const needle = badName.toLowerCase();
    if (!needle)
        return [];
    const scored = knownNames.map((name) => {
        const lower = name.toLowerCase();
        let score = levenshtein(needle, lower);
        if (lower.startsWith(needle) || lower.includes(needle))
            score -= 2;
        return { name, score };
    });
    scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
    // Only suggest genuinely close names (avoid nonsense for typos like "xyz").
    const best = scored[0];
    const cutoff = Math.max(2, Math.ceil(needle.length * 0.6));
    return scored
        .filter((s) => s.score <= Math.min(best.score, cutoff))
        .slice(0, max)
        .map((s) => s.name);
}
/**
 * Human-readable error for unknown parameters, including suggestions.
 */
export function formatUnknownParameterError(opType, invalid, validCount) {
    const parts = invalid.map((i) => `'${i.name}'` +
        (i.suggestions.length > 0 ? ` (did you mean: ${i.suggestions.join(", ")}?)` : ""));
    return (`Unknown parameter(s) for ${opType}: ${parts.join(", ")}. ` +
        `The operator has ${validCount} parameters; read them first with ` +
        `td_pars_get or GET /parameters — never set parameters blindly. ` +
        `Names come from the live-validated POP knowledge base (TD 2025.32460).`);
}
/** Reset the memoized knowledge cache (used by tests). */
export function resetPopKnowledgeCache() {
    cachedKnowledge = null;
}
// ─── Matrix-evidence gating (only recommend ok_con_input POPs) ─────────────
/**
 * Canonical POP types classified ok_con_input by the live matrix — cooks
 * clean WITH a real source and produces geometry (numPoints() > 0). These
 * are the only POP types network builders should recommend by default.
 * Unknown-type names in the query are ignored (they simply don't match).
 */
export function listOkPopTypes() {
    return listPopTypes().filter((t) => {
        const info = getPopInfo(t);
        return info?.recommendedForNetworks === true;
    });
}
/** True when the type has live matrix evidence of ok_con_input behavior. */
export function isRecommendedForNetworks(opType) {
    return getPopInfo(opType)?.recommendedForNetworks === true;
}
/**
 * Non-blocking advisory message for a POP type the evidence says NOT to use
 * in generated networks (null when the type is ok or unknown to the KB).
 */
export function networkRecommendationWarning(opType) {
    const info = getPopInfo(opType);
    if (!info || info.recommendedForNetworks)
        return null;
    switch (info.validationCategory) {
        case "error_con_input":
            return (`${opType} reports TD errors() when cooked even WITH a correct source ` +
                `(live matrix evidence). Prefer a validated alternative; if you must ` +
                `use it, satisfy its documented requirement first.`);
        case "sin_geometria_con_input":
            return (`${opType} cooks clean but produces 0 points with a POP source ` +
                `(consumes another family or is an output node) — do not expect ` +
                `geometry from it in a generated chain.`);
        case "no_creable":
            return `${opType} cannot be created via create() in this TD build.`;
        default:
            return null;
    }
}
