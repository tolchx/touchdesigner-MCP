/**
 * Layout Engine for TouchDesigner MCP
 * Anti-collision, left-to-right, top-to-bottom node positioning.
 *
 * Can be imported by the MCP server (index.ts) and used during
 * network planning to calculate collision-free node positions.
 */
// ─── Constants ──────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
    horizontalSpacing: 250,
    verticalSpacing: 250,
    nodeWidth: 130,
    nodeHeight: 90,
    startX: 0,
    startY: 0,
    padding: 20,
};
/** Color coding RGB values by node role */
export const ROLE_COLORS = {
    source: [0.2, 0.3, 0.6], // Blue
    bridge: [0.2, 0.5, 0.3], // Green
    modifier: [0.2, 0.5, 0.3], // Green
    solver: [0.2, 0.5, 0.3], // Green
    output: [0.7, 0.4, 0.1], // Orange
    control: [0.4, 0.2, 0.5], // Purple
};
/** Role assignment rules based on operator type patterns */
const ROLE_PATTERNS = [
    // Bridges (must come before sources to match toptoPOP etc.)
    { pattern: /^(topto|chopto|sopto|top2|chop2|sop2)/i, role: "bridge" },
    // Modifiers (must come before sources to match noisePOP etc.)
    { pattern: /^(noise|random|math|attribute|transform|delete|limit|normal|color|lookup|trail|attconvert|convert|connectivity|resample)/i, role: "modifier" },
    // Sources (noiseTOP/noiseCHOP are sources, noisePOP is modifier - handled above)
    { pattern: /^(moviefilein|audio|grid|sphere|box|circle|line|rectangle|torus|constant|beat|lfo|pattern)/i, role: "source" },
    // Solvers
    { pattern: /^(particle|feedback|field|solve|spring)/i, role: "solver" },
    // Outputs
    { pattern: /^(render|null|out|composite|level|blur|film|bloom|anti)/i, role: "output" },
    // Control
    { pattern: /^(select|table|merge|replicator|text|dat|exec|parexec|timer)/i, role: "control" },
];
// ─── Utility Functions ──────────────────────────────────────────────────────
/** Get AABB bounds for a node */
export function getNodeBounds(x, y, config) {
    return { x, y, width: config.nodeWidth, height: config.nodeHeight };
}
/** Check if two AABB bounds overlap */
export function boundsOverlap(a, b) {
    return (a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y);
}
/** Determine the role of a node based on its type */
export function getRoleForType(opType) {
    const lower = opType.toLowerCase();
    for (const { pattern, role } of ROLE_PATTERNS) {
        if (pattern.test(lower))
            return role;
    }
    return "modifier"; // default
}
/** Get RGB color for a role */
export function getColorForRole(role) {
    return ROLE_COLORS[role] ?? [0.5, 0.5, 0.5];
}
// ─── LayoutEngine Class ─────────────────────────────────────────────────────
export class LayoutEngine {
    config;
    placedNodes = [];
    maxAttempts = 20;
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /** Check if new_bounds overlaps with any placed node */
    checkCollision(newBounds) {
        return this.placedNodes.some((placed) => boundsOverlap(newBounds, placed));
    }
    /**
     * Find a position that avoids all existing nodes.
     *
     * Algorithm:
     * 1. Calculate ideal position based on chain and index
     * 2. Check for collision with all placed nodes
     * 3. If collision, shift right by horizontalSpacing until clear
     */
    findSafePosition(chain, index) {
        let x = this.config.startX + index * this.config.horizontalSpacing;
        let y = this.config.startY + chain * this.config.verticalSpacing;
        let bounds = getNodeBounds(x, y, this.config);
        let attempts = 0;
        while (this.checkCollision(bounds) && attempts < this.maxAttempts) {
            x += this.config.horizontalSpacing;
            bounds = getNodeBounds(x, y, this.config);
            attempts++;
        }
        if (attempts >= this.maxAttempts) {
            // Fallback: place below all existing nodes
            const maxY = this.placedNodes.length > 0
                ? Math.max(...this.placedNodes.map((n) => n.y + n.height))
                : 0;
            y = maxY + this.config.verticalSpacing;
            bounds = getNodeBounds(x, y, this.config);
        }
        return { x, y };
    }
    /**
     * Place a node and record its bounds.
     * Returns the safe position (x, y).
     */
    placeNode(chain, index) {
        const { x, y } = this.findSafePosition(chain, index);
        const bounds = getNodeBounds(x, y, this.config);
        this.placedNodes.push(bounds);
        return { x, y };
    }
    /**
     * Plan a linear chain of nodes (left-to-right).
     * Returns list of PositionedNode.
     */
    planLinearChain(nodes, chain = 0, container = "/project_root") {
        const result = [];
        for (let i = 0; i < nodes.length; i++) {
            const { name, type } = nodes[i];
            const { x, y } = this.placeNode(chain, i);
            const role = getRoleForType(type);
            result.push({ name, type, x, y, role, color: getColorForRole(role) });
        }
        return result;
    }
    /**
     * Plan multiple parallel chains.
     * Each chain gets its own Y offset.
     */
    planParallelChains(chains, container = "/project_root") {
        const result = [];
        for (let chainIdx = 0; chainIdx < chains.length; chainIdx++) {
            const chainNodes = chains[chainIdx];
            for (let nodeIdx = 0; nodeIdx < chainNodes.length; nodeIdx++) {
                const { name, type } = chainNodes[nodeIdx];
                const { x, y } = this.placeNode(chainIdx, nodeIdx);
                const role = getRoleForType(type);
                result.push({ name, type, x, y, role, color: getColorForRole(role) });
            }
        }
        return result;
    }
    /**
     * Plan parallel chains that merge into a single output.
     * The merge node is placed to the right of the longest chain.
     */
    planWithMerge(chains, mergeNode, container = "/project_root") {
        const result = this.planParallelChains(chains, container);
        // Find the rightmost position across all chains
        let maxX = 0;
        for (const node of result) {
            maxX = Math.max(maxX, node.x + this.config.nodeWidth);
        }
        // Place merge node to the right of all chains
        let mergeX = maxX + this.config.horizontalSpacing;
        const mergeY = this.config.startY + Math.floor(chains.length / 2) * this.config.verticalSpacing;
        let bounds = getNodeBounds(mergeX, mergeY, this.config);
        while (this.checkCollision(bounds)) {
            mergeX += this.config.horizontalSpacing;
            bounds = getNodeBounds(mergeX, mergeY, this.config);
        }
        this.placedNodes.push(bounds);
        const role = getRoleForType(mergeNode.type);
        result.push({
            name: mergeNode.name,
            type: mergeNode.type,
            x: mergeX,
            y: mergeY,
            role,
            color: getColorForRole(role),
        });
        return result;
    }
    /**
     * Generate MCP tool commands for placing and connecting nodes.
     */
    generateMcpCommands(nodes, container = "/project_root", crossChainConnections) {
        const commands = [];
        // Create operators
        for (const node of nodes) {
            commands.push({
                tool: "td_create_operator",
                params: {
                    type: node.type,
                    name: node.name,
                    path: container,
                    position_x: node.x,
                    position_y: node.y,
                },
            });
        }
        // Connect sequential nodes within each chain (grouped by Y)
        const chains = new Map();
        for (const node of nodes) {
            const key = node.y;
            if (!chains.has(key))
                chains.set(key, []);
            chains.get(key).push(node);
        }
        for (const [, chainNodes] of chains) {
            chainNodes.sort((a, b) => a.x - b.x);
            for (let i = 0; i < chainNodes.length - 1; i++) {
                const source = chainNodes[i];
                const target = chainNodes[i + 1];
                commands.push({
                    tool: "td_connect_nodes",
                    params: {
                        source_path: `${container}/${source.name}`,
                        target_path: `${container}/${target.name}`,
                    },
                });
            }
        }
        // Connect cross-chain nodes (e.g., bridge output to noise input)
        if (crossChainConnections) {
            for (const [sourceName, targetName] of crossChainConnections) {
                commands.push({
                    tool: "td_connect_nodes",
                    params: {
                        source_path: `${container}/${sourceName}`,
                        target_path: `${container}/${targetName}`,
                    },
                });
            }
        }
        return commands;
    }
    /** Get all placed node bounds */
    getPlacedNodes() {
        return this.placedNodes;
    }
    /** Reset the layout engine for a new project */
    reset() {
        this.placedNodes = [];
    }
}
// ─── Convenience Functions ──────────────────────────────────────────────────
/**
 * Quick planning function: creates a layout engine, plans nodes,
 * and returns MCP commands ready to execute.
 */
export function planProject(chains, container = "/project_root", config) {
    const engine = new LayoutEngine(config);
    const nodes = engine.planParallelChains(chains, container);
    const commands = engine.generateMcpCommands(nodes, container);
    return { nodes, commands };
}
/**
 * Plan a particle system project (common pattern).
 */
export function planParticleSystem(sourceType = "spherePOP", container = "/project_root") {
    return planProject([
        [
            { name: "source", type: sourceType },
            { name: "noise", type: "noisePOP" },
            { name: "particles", type: "particlePOP" },
            { name: "render", type: "renderPOP" },
            { name: "output", type: "nullTOP" },
        ],
    ], container);
}
/**
 * Plan an audio-reactive project.
 */
export function planAudioReactive(container = "/project_root") {
    return planProject([
        [
            { name: "audio", type: "audioCHOP" },
            { name: "normalize", type: "mathCHOP" },
            { name: "bridge", type: "choptoPOP" },
        ],
        [
            { name: "source", type: "spherePOP" },
            { name: "noise", type: "noisePOP" },
        ],
    ], container);
}
