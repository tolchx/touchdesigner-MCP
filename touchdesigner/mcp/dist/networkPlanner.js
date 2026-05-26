import { loadOpsIndex } from "./opsDb.js";
import { loadPopsIndex } from "./popsDb.js";
import { resolveSemanticTerms } from "./semantic.js";
let planningCatalogPromise = null;
const FAMILY_NAMES = ["POP", "TOP", "CHOP", "SOP", "DAT"];
const POP_BOOTSTRAP_SLUG = "Point_POP";
const POP_SOURCE_SLUGS = new Set(["Point_POP", "Point_File_In_POP"]);
const POP_INPUT_REQUIRED_SLUGS = new Set(["Particle_POP", "Feedback_POP", "Field_POP", "Limit_POP", "Noise_POP"]);
const POP_NON_CHAIN_SOURCE_SLUGS = new Set(["TOP_to_POP", "SOP_to_POP"]);
const BRIDGE_RULES = [
    { from: "TOP", to: "POP", bridgeSlug: "TOP_to_POP" },
    { from: "SOP", to: "POP", bridgeSlug: "SOP_to_POP" },
];
const BRIDGE_INPUT_PARAMETER = {
    TOP_to_POP: "input0top",
    SOP_to_POP: "sop",
};
function sanitizeName(input, fallback, index) {
    const base = (input || fallback)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return `${base || fallback}${index + 1}`;
}
function baseTitle(pageTitle, familySuffix) {
    return pageTitle.replace(/^Experimental:\s*/i, "").replace(new RegExp(`\\s*${familySuffix ?? ""}$`), "").trim();
}
function normalizeText(input) {
    return input.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeTdToken(token, isFirst) {
    if (!token)
        return "";
    const lower = token.toLowerCase();
    if (isFirst)
        return lower;
    if (lower === "to")
        return "to";
    return lower[0].toUpperCase() + lower.slice(1);
}
function buildTdOpTypeGuess(baseName, family) {
    const words = baseName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0)
        return undefined;
    const base = words.map((word, index) => normalizeTdToken(word, index === 0)).join("");
    return `${base}${family}`;
}
function normalizeTdOpTypeGuess(pageTitle, family, guess) {
    const expected = buildTdOpTypeGuess(baseTitle(pageTitle, family), family);
    if (!expected)
        return guess;
    if (!guess)
        return expected;
    const normalizedGuess = guess.toLowerCase();
    const normalizedExpected = expected.toLowerCase();
    if (normalizedGuess === normalizedExpected)
        return expected;
    const compactBase = baseTitle(pageTitle, family).replace(/\s+/g, "").toLowerCase();
    if (compactBase && normalizedGuess === `${compactBase}${family.toLowerCase()}`)
        return expected;
    return guess;
}
function trailingFamilyOfPhrase(phrase) {
    const tokens = normalizeText(phrase).split(" ").filter(Boolean);
    const last = tokens[tokens.length - 1];
    return FAMILY_NAMES.find((family) => family.toLowerCase() === last) ?? null;
}
function stripTrailingFamily(phrase) {
    const tokens = normalizeText(phrase).split(" ").filter(Boolean);
    const last = tokens[tokens.length - 1];
    if (FAMILY_NAMES.some((family) => family.toLowerCase() === last)) {
        return tokens.slice(0, -1).join(" ");
    }
    return normalizeText(phrase);
}
function explicitFamiliesForRequested(normalizedPrompt, requested) {
    const families = new Set();
    const normalizedRequested = normalizeText(requested);
    for (const family of FAMILY_NAMES) {
        const familyToken = family.toLowerCase();
        const patterns = [
            new RegExp(`\\b${normalizedRequested}\\s+${familyToken}\\b`, "i"),
            new RegExp(`\\b${familyToken}\\s+${normalizedRequested}\\b`, "i"),
        ];
        if (patterns.some((pattern) => pattern.test(normalizedPrompt))) {
            families.add(family);
        }
    }
    return families;
}
function pushMapValue(map, key, value) {
    const existing = map.get(key);
    if (existing)
        existing.push(value);
    else
        map.set(key, [value]);
}
function uniqueOrdered(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        if (!value || seen.has(value))
            continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}
function slugText(pageSlug) {
    return normalizeText(pageSlug.replaceAll("_", " "));
}
function familyPriority(family) {
    const order = ["TOP", "CHOP", "SOP", "DAT", "POP"];
    const index = order.indexOf(family);
    return index === -1 ? order.length : index;
}
function nodeRolePriority(node) {
    if (node.family === "POP") {
        if (node.pageSlug === "Point_POP")
            return 0;
        if (node.pageSlug === "Point_File_In_POP")
            return 1;
        if (node.pageSlug === "TOP_to_POP" || node.pageSlug === "SOP_to_POP")
            return 2;
        if (node.pageSlug === "Particle_POP")
            return 3;
        if (node.pageSlug === "Field_POP" || node.pageSlug === "Noise_POP")
            return 4;
        if (node.pageSlug === "Limit_POP")
            return 5;
        if (node.pageSlug === "Feedback_POP")
            return 9;
    }
    if (node.family === "TOP") {
        if (node.pageSlug === "Noise_TOP")
            return 2;
        if (node.pageSlug === "Feedback_TOP")
            return 8;
    }
    return 5;
}
function nodePromptPosition(node, normalizedPrompt, firstPopPosition) {
    if (node.autoGenerated && node.pageSlug === POP_BOOTSTRAP_SLUG && firstPopPosition !== null) {
        return Math.max(-1, firstPopPosition - 0.25);
    }
    const candidates = uniqueOrdered([
        normalizeText(node.pageTitle),
        normalizeText(baseTitle(node.pageTitle, node.family)),
        slugText(node.pageSlug),
    ]);
    const positions = candidates
        .map((candidate) => normalizedPrompt.indexOf(candidate))
        .filter((index) => index >= 0);
    return positions.length > 0 ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
}
function orderPlannedNodes(nodes, prompt) {
    const normalizedPrompt = normalizeText(prompt);
    const explicitPopPositions = nodes
        .filter((node) => node.family === "POP" && !node.autoGenerated)
        .map((node) => nodePromptPosition(node, normalizedPrompt, null))
        .filter((position) => Number.isFinite(position) && position !== Number.MAX_SAFE_INTEGER);
    const firstPopPosition = explicitPopPositions.length > 0 ? Math.min(...explicitPopPositions) : null;
    return nodes
        .map((node, index) => ({
        node,
        index,
        promptPosition: nodePromptPosition(node, normalizedPrompt, firstPopPosition),
        familyOrder: familyPriority(node.family),
        roleOrder: nodeRolePriority(node),
    }))
        .sort((a, b) => {
        if (a.promptPosition !== b.promptPosition)
            return a.promptPosition - b.promptPosition;
        if (a.familyOrder !== b.familyOrder)
            return a.familyOrder - b.familyOrder;
        if (a.roleOrder !== b.roleOrder)
            return a.roleOrder - b.roleOrder;
        return a.index - b.index;
    })
        .map((entry) => entry.node);
}
function hasValidFamilyBridge(nodes) {
    const families = new Set(nodes.map((node) => node.family));
    return BRIDGE_RULES.some((rule) => families.has(rule.from) && families.has(rule.to) && nodes.some((node) => node.pageSlug === rule.bridgeSlug));
}
function validatePlan(nodes) {
    const issues = [];
    const autoFixes = [];
    const hasParticle = nodes.some((node) => node.pageSlug === "Particle_POP");
    const hasFeedback = nodes.some((node) => node.pageSlug === "Feedback_POP");
    const hasPointBootstrap = nodes.some((node) => node.pageSlug === POP_BOOTSTRAP_SLUG);
    const hasTopBridge = nodes.some((node) => node.pageSlug === "TOP_to_POP");
    const hasSopBridge = nodes.some((node) => node.pageSlug === "SOP_to_POP");
    const hasTopFamily = nodes.some((node) => node.family === "TOP");
    const hasSopFamily = nodes.some((node) => node.family === "SOP");
    if (hasParticle && !hasFeedback) {
        issues.push({
            code: "particle-without-feedback",
            severity: "warning",
            message: "Particle POP sin Feedback POP puede quedar funcional pero menos util para simulaciones temporales.",
        });
    }
    if ((hasParticle || hasFeedback) && !hasPointBootstrap && !hasTopBridge && !hasSopBridge) {
        issues.push({
            code: "missing-pop-source",
            severity: "warning",
            message: "La cadena POP requiere una fuente inicial valida.",
        });
        autoFixes.push("Agregar Point POP como bootstrap inicial.");
    }
    if (hasTopFamily && nodes.some((node) => node.family === "POP") && hasTopBridge) {
        autoFixes.push("Enlazar TOP to POP al ultimo TOP detectado mediante el parametro input0top.");
    }
    if (hasSopFamily && nodes.some((node) => node.family === "POP") && hasSopBridge) {
        autoFixes.push("Enlazar SOP to POP al ultimo SOP detectado mediante el parametro sop.");
    }
    return {
        ok: !issues.some((issue) => issue.severity === "warning"),
        issues,
        autoFixes: uniqueOrdered(autoFixes),
    };
}
function createCatalogEntry(item, familySuffix) {
    const genericKey = normalizeText(baseTitle(item.pageTitle, familySuffix));
    const normalizedGuess = normalizeTdOpTypeGuess(item.pageTitle, item.family, item.tdOpTypeGuess);
    const exactKeys = uniqueOrdered([
        normalizeText(item.pageTitle),
        normalizeText(item.pageSlug),
        normalizeText(item.pageSlug.replaceAll("_", " ")),
        normalizeText(normalizedGuess ?? ""),
    ]);
    return {
        family: item.family,
        pageTitle: item.pageTitle,
        pageSlug: item.pageSlug,
        tdOpTypeGuess: normalizedGuess,
        genericKey,
        exactKeys,
    };
}
async function loadPlanningCatalog() {
    if (!planningCatalogPromise) {
        planningCatalogPromise = Promise.all([loadPopsIndex(), loadOpsIndex()]).then(([popsIndex, opsIndex]) => {
            const byExactKey = new Map();
            const byGenericKey = new Map();
            const entries = [
                ...popsIndex.operators.map((item) => createCatalogEntry({ ...item, family: "POP" }, "POP")),
                ...opsIndex.operators.map((item) => createCatalogEntry(item, item.family)),
            ];
            for (const entry of entries) {
                for (const key of entry.exactKeys) {
                    pushMapValue(byExactKey, key, entry);
                }
                pushMapValue(byGenericKey, entry.genericKey, entry);
            }
            return { byExactKey, byGenericKey };
        });
    }
    return planningCatalogPromise;
}
function collectPromptPhrases(normalizedPrompt, maxWords = 5) {
    const tokens = normalizedPrompt.split(" ").filter(Boolean);
    const phrases = [normalizedPrompt];
    for (let length = Math.min(maxWords, tokens.length); length >= 1; length -= 1) {
        for (let start = 0; start + length <= tokens.length; start += 1) {
            phrases.push(tokens.slice(start, start + length).join(" "));
        }
    }
    return uniqueOrdered(phrases);
}
function collectSemanticSeedPhrases(normalizedPrompt, semantic) {
    const seeds = [];
    const familyHintSet = new Set(semantic.familyHints);
    for (const hint of semantic.operatorHints) {
        const explicitFamilies = explicitFamiliesForRequested(normalizedPrompt, hint.requested);
        for (const variant of hint.canonical.split("/")) {
            const normalizedVariant = normalizeText(variant);
            const trailingFamily = trailingFamilyOfPhrase(normalizedVariant);
            if (trailingFamily && explicitFamilies.size > 0 && !explicitFamilies.has(trailingFamily)) {
                continue;
            }
            if (trailingFamily && familyHintSet.size > 0 && !familyHintSet.has(trailingFamily)) {
                continue;
            }
            seeds.push(normalizedVariant);
        }
    }
    for (const match of semantic.conceptMatches) {
        if (match.canonical === "particlesupdatepop") {
            if (!/\bfeedback top\b/.test(normalizedPrompt) && !/\bfeedback chop\b/.test(normalizedPrompt)) {
                seeds.push("feedback pop");
            }
        }
    }
    if (semantic.familyHints.includes("POP") && /\b(particle|particles|particula|particulas)\b/.test(normalizedPrompt)) {
        seeds.push("particle pop");
    }
    if (semantic.familyHints.includes("TOP") && /\b(feedback top|top feedback)\b/.test(normalizedPrompt)) {
        seeds.push("feedback top");
    }
    return uniqueOrdered(seeds);
}
function collectMatchesFromPrompt(prompt, catalog, semantic) {
    const normalizedPrompt = normalizeText(prompt);
    const found = [];
    const familyHintSet = new Set(semantic.familyHints);
    const phraseCandidates = uniqueOrdered([
        ...collectPromptPhrases(normalizedPrompt),
        ...collectSemanticSeedPhrases(normalizedPrompt, semantic),
    ]);
    const specificPhraseRoots = new Set(phraseCandidates
        .filter((phrase) => trailingFamilyOfPhrase(phrase))
        .map((phrase) => stripTrailingFamily(phrase))
        .filter(Boolean));
    const allowEntry = (entry, phrase, isGeneric) => {
        const trailingFamily = trailingFamilyOfPhrase(phrase);
        if (trailingFamily)
            return entry.family === trailingFamily;
        if (specificPhraseRoots.has(normalizeText(phrase)))
            return false;
        if (!isGeneric)
            return familyHintSet.size === 0 || familyHintSet.has(entry.family);
        return familyHintSet.size === 0 ? entry.family === "POP" : familyHintSet.has(entry.family);
    };
    const addEntry = (entry) => {
        found.push({
            family: entry.family,
            pageTitle: entry.pageTitle,
            pageSlug: entry.pageSlug,
            tdOpTypeGuess: entry.tdOpTypeGuess,
            name: sanitizeName(baseTitle(entry.pageTitle, entry.family), entry.family.toLowerCase(), found.length),
        });
    };
    for (const phrase of phraseCandidates) {
        for (const entry of catalog.byExactKey.get(phrase) ?? []) {
            if (allowEntry(entry, phrase, false))
                addEntry(entry);
        }
    }
    for (const phrase of phraseCandidates) {
        for (const entry of catalog.byGenericKey.get(phrase) ?? []) {
            if (allowEntry(entry, phrase, true))
                addEntry(entry);
        }
    }
    const dedup = new Map();
    for (const item of found) {
        const key = `${item.family}:${item.pageSlug}`;
        if (!dedup.has(key))
            dedup.set(key, item);
    }
    return Array.from(dedup.values());
}
function buildWarnings(nodes, prompt) {
    const warnings = [];
    const lower = prompt.toLowerCase();
    const hasParticle = nodes.some((n) => n.pageSlug === "Particle_POP");
    if (hasParticle && !lower.includes("feedback") && !lower.includes("particlesupdatepop")) {
        warnings.push("Se detecto Particle POP pero el prompt no menciona feedback loop o particlesupdatepop.");
    }
    const families = new Set(nodes.map((n) => n.family));
    if (families.size > 1 && !hasValidFamilyBridge(nodes)) {
        warnings.push("El plan mezcla familias; las conexiones automaticas solo se aplicaran entre operadores de la misma familia.");
    }
    if (nodes.length === 0) {
        warnings.push("No se detectaron operadores concretos en el prompt. Conviene resolver aliases o consultar templates primero.");
    }
    return warnings;
}
function ensurePopBootstrap(nodes) {
    const hasPopNodes = nodes.some((node) => node.family === "POP");
    if (!hasPopNodes)
        return nodes;
    const hasSource = nodes.some((node) => POP_SOURCE_SLUGS.has(node.pageSlug));
    const needsSource = nodes.some((node) => POP_INPUT_REQUIRED_SLUGS.has(node.pageSlug));
    if (hasSource || !needsSource)
        return nodes;
    const bootstrap = {
        family: "POP",
        pageTitle: "Point POP",
        pageSlug: POP_BOOTSTRAP_SLUG,
        tdOpTypeGuess: "pointPOP",
        name: sanitizeName("point", "pop", 0),
        autoGenerated: true,
    };
    const shifted = nodes.map((node, index) => ({
        ...node,
        name: sanitizeName(baseTitle(node.pageTitle, node.family), node.family.toLowerCase(), index + 1),
    }));
    return [bootstrap, ...shifted];
}
function generatePythonPlan(targetPath, containerName, nodes) {
    const lines = [];
    lines.push("target = op(%r)".replace("%r", JSON.stringify(targetPath)));
    lines.push("if target is None:");
    lines.push("    raise Exception('Target path not found: ' + %r)".replace("%r", JSON.stringify(targetPath)));
    lines.push("container = target.op(%r)".replace("%r", JSON.stringify(containerName)));
    lines.push("if container is None:");
    lines.push("    container = target.create(baseCOMP, %r)".replace("%r", JSON.stringify(containerName)));
    lines.push("prev_by_family = {}");
    lines.push("last_by_family = {}");
    lines.push("x = 0");
    lines.push("y = 0");
    lines.push("created = []");
    for (const node of nodes) {
        if (!node.tdOpTypeGuess)
            continue;
        const preservePrev = node.family === "POP" && POP_NON_CHAIN_SOURCE_SLUGS.has(node.pageSlug);
        lines.push(`node = container.op(${JSON.stringify(node.name)})`);
        lines.push("if node is None:");
        lines.push(`    node = container.create(${node.tdOpTypeGuess}, ${JSON.stringify(node.name)})`);
        lines.push("    node.nodeX = x");
        lines.push("    node.nodeY = y");
        lines.push("    x += 180");
        lines.push("created.append(node.path)");
        lines.push(`last_by_family[${JSON.stringify(node.family)}] = node`);
        lines.push(`prev = prev_by_family.get(${JSON.stringify(node.family)})`);
        lines.push("if prev is not None:");
        lines.push("    try:");
        lines.push("        node.inputConnectors[0].connect(prev)");
        lines.push("    except Exception:");
        lines.push("        pass");
        if (node.pageSlug === "TOP_to_POP") {
            lines.push("top_source = last_by_family.get('TOP')");
            lines.push("if top_source is not None:");
            lines.push("    try:");
            lines.push(`        node.par.${BRIDGE_INPUT_PARAMETER.TOP_to_POP} = top_source.path`);
            lines.push("    except Exception:");
            lines.push("        pass");
        }
        if (node.pageSlug === "SOP_to_POP") {
            lines.push("sop_source = last_by_family.get('SOP')");
            lines.push("if sop_source is not None:");
            lines.push("    try:");
            lines.push(`        node.par.${BRIDGE_INPUT_PARAMETER.SOP_to_POP} = sop_source.path`);
            lines.push("    except Exception:");
            lines.push("        pass");
        }
        if (!preservePrev) {
            lines.push(`prev_by_family[${JSON.stringify(node.family)}] = node`);
        }
    }
    lines.push("print({'container': container.path, 'created': created})");
    return lines.join("\n");
}
export async function createNetworkPlan(options) {
    const catalog = await loadPlanningCatalog();
    const semantic = resolveSemanticTerms(options.prompt);
    const targetPath = options.targetPath ?? "/project1";
    const containerName = options.containerName ?? "PromptSystem";
    const nodes = orderPlannedNodes(ensurePopBootstrap(collectMatchesFromPrompt(options.prompt, catalog, semantic)), options.prompt);
    const validation = validatePlan(nodes);
    const warnings = buildWarnings(nodes, options.prompt);
    const existing = await options.td.getOperators(targetPath).catch(() => ({ path: targetPath, operators: [] }));
    const collisions = existing.operators
        .filter((op) => op.name === containerName || nodes.some((n) => n.name === op.name))
        .map((op) => op.path ?? `${targetPath}/${op.name}`);
    const plan = {
        targetPath,
        containerName,
        semantic,
        nodes,
        validation,
        warnings,
        collisions,
        diff: {
            createContainer: !existing.operators.some((op) => op.name === containerName),
            createNodes: nodes.map((n) => ({
                name: n.name,
                tdOpTypeGuess: n.tdOpTypeGuess,
                family: n.family,
            })),
        },
    };
    if (!options.apply) {
        return { kind: "network_plan", applied: false, plan };
    }
    const python = generatePythonPlan(targetPath, containerName, nodes);
    const result = await options.td.execute(python, targetPath);
    return { kind: "network_plan", applied: true, plan, execution: result };
}
