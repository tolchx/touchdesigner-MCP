/**
 * Deterministic Fallback Planner — Plans networks without LLM
 *
 * Extracted from networkPlannerGraph.ts. Provides a keyword-matching
 * topology-aware planner used when LLM is unavailable.
 */
// ─── Cross-Family Compatibility ────────────────────────────────────────────
/**
 * Returns true only if a connection between two operator families is valid
 * WITHOUT an explicit adapter operator (toPOP, toTOP, choptoTOP, etc.).
 *
 * In TouchDesigner, a connection between two operators of the same family
 * (TOP→TOP, CHOP→CHOP, POP→POP, SOP→SOP, DAT→DAT) is always valid. Cross-
 * family connections (POP→TOP, CHOP→POP, TOP→CHOP, etc.) are NOT valid
 * unless an adapter operator is used; the deterministic planner does not
 * insert adapters, so such connections would silently fail in TD.
 *
 * Exported so the rule can be unit-tested and reused by callers.
 */
export function isFamilyCompatible(sourceFamily, targetFamily) {
    return sourceFamily === targetFamily;
}
// ─── Deterministic Planning ───────────────────────────────────────────────
/**
 * Deterministic network planner that understands basic topology.
 * Much better than the old linear chain — handles multi-input, branching, etc.
 */
export function deterministicPlan(prompt, catalog, targetPath) {
    const words = prompt.toLowerCase().split(/\s+/);
    const nodes = [];
    const connections = [];
    let nodeIdx = 0;
    // 1. Find matching operators from the catalog
    const matched = [];
    catalog.forEach((topo, opType) => {
        const lower = opType.toLowerCase();
        const labelLower = topo.label.toLowerCase();
        let score = 0;
        // Score by keyword match
        for (const word of words) {
            if (word.length < 3)
                continue;
            if (lower.includes(word) || labelLower.includes(word))
                score += 2;
            if (word === "audio" && (topo.family === "CHOP" || lower.includes("audio")))
                score += 3;
            if (word === "particle" && topo.family === "POP")
                score += 3;
            if (word === "feedback" && lower.includes("feedback"))
                score += 3;
            if (word === "blur" && lower.includes("blur"))
                score += 2;
            if (word === "composite" && lower.includes("composite"))
                score += 2;
        }
        // Family bonus
        if (words.some(w => ["top", "texture", "image", "video"].includes(w)) && topo.family === "TOP")
            score += 1;
        if (words.some(w => ["chop", "audio", "sound", "music", "signal"].includes(w)) && topo.family === "CHOP")
            score += 1;
        if (words.some(w => ["pop", "particle", "point"].includes(w)) && topo.family === "POP")
            score += 2;
        if (score > 0) {
            matched.push({ topo, score });
        }
    });
    // Sort by score
    matched.sort((a, b) => b.score - a.score);
    // 2. Pick the best operators (max 15 for reasonable graphs)
    const selected = matched.slice(0, 15);
    // Add an output null if not already present
    const hasNull = selected.some(s => s.topo.opType.includes("null"));
    if (!hasNull && selected.length > 0) {
        const mainFamily = selected[0].topo.family;
        const nullType = mainFamily === "CHOP" ? "nullCHOP"
            : mainFamily === "POP" ? "nullPOP"
                : mainFamily === "SOP" ? "nullSOP"
                    : "nullTOP";
        const nullTopo = catalog.get(nullType) || {
            opType: nullType,
            family: mainFamily,
            label: "Output",
            inputCount: 1,
            inputs: [{ index: 0, description: "Input", accepts: mainFamily }],
            outputs: [{ name: "output", type: mainFamily }],
            connectsTo: [],
            isMultiInput: false,
            warnings: [],
            commonCombinations: [],
        };
        selected.push({ topo: nullTopo, score: 100 });
    }
    // 3. Build nodes
    for (const { topo } of selected) {
        const id = `n${nodeIdx}`;
        const node = {
            id,
            opType: topo.opType,
            label: topo.label,
            parentPath: targetPath,
            x: nodeIdx * 180,
            y: 0,
        };
        nodes.push(node);
        nodeIdx++;
    }
    // 4. Build connections — smart topology-aware wiring
    let lastInFamily = new Map();
    for (const node of nodes) {
        const topo = catalog.get(node.opType)
            || selected.find(s => s.topo.opType === node.opType)?.topo;
        const family = topo?.family || "TOP";
        const prevId = lastInFamily.get(family);
        if (prevId) {
            connections.push({
                from: prevId,
                to: node.id,
                inputIndex: 0,
            });
        }
        // If this is multi-input, also connect from other families — but ONLY
        // when the families are compatible. Cross-family connections (POP→TOP,
        // CHOP→POP, etc.) are invalid in TD without explicit adapter operators
        if (topo?.isMultiInput && lastInFamily.size > 1) {
            let inputIdx = 1;
            lastInFamily.forEach((otherId, otherFamily) => {
                if (otherFamily !== family
                    && inputIdx <= 3
                    && isFamilyCompatible(otherFamily, family)) {
                    connections.push({
                        from: otherId,
                        to: node.id,
                        inputIndex: inputIdx,
                    });
                    inputIdx++;
                }
            });
        }
        lastInFamily.set(family, node.id);
    }
    return {
        description: prompt,
        nodes,
        connections,
        targetPath,
    };
}
