/**
 * Layout Engine for TouchDesigner MCP
 * Anti-collision, left-to-right, top-to-bottom node positioning.
 *
 * Can be imported by the MCP server (index.ts) and used during
 * network planning to calculate collision-free node positions.
 */
export interface NodeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface LayoutConfig {
    horizontalSpacing: number;
    verticalSpacing: number;
    nodeWidth: number;
    nodeHeight: number;
    startX: number;
    startY: number;
    padding: number;
}
export interface PositionedNode {
    name: string;
    type: string;
    x: number;
    y: number;
    role: NodeRole;
    color: [number, number, number];
}
export type NodeRole = "source" | "bridge" | "modifier" | "solver" | "output" | "control";
export interface McpCreateCommand {
    tool: "td_create_operator";
    params: {
        type: string;
        name: string;
        path: string;
        position_x: number;
        position_y: number;
    };
}
export interface McpConnectCommand {
    tool: "td_connect_nodes";
    params: {
        source_path: string;
        target_path: string;
    };
}
export type McpCommand = McpCreateCommand | McpConnectCommand;
export declare const DEFAULT_CONFIG: LayoutConfig;
/** Color coding RGB values by node role */
export declare const ROLE_COLORS: Record<NodeRole, [number, number, number]>;
/** Get AABB bounds for a node */
export declare function getNodeBounds(x: number, y: number, config: LayoutConfig): NodeBounds;
/** Check if two AABB bounds overlap */
export declare function boundsOverlap(a: NodeBounds, b: NodeBounds): boolean;
/** Determine the role of a node based on its type */
export declare function getRoleForType(opType: string): NodeRole;
/** Get RGB color for a role */
export declare function getColorForRole(role: NodeRole): [number, number, number];
export declare class LayoutEngine {
    private config;
    private placedNodes;
    private maxAttempts;
    constructor(config?: Partial<LayoutConfig>);
    /** Check if new_bounds overlaps with any placed node */
    checkCollision(newBounds: NodeBounds): boolean;
    /**
     * Find a position that avoids all existing nodes.
     *
     * Algorithm:
     * 1. Calculate ideal position based on chain and index
     * 2. Check for collision with all placed nodes
     * 3. If collision, shift right by horizontalSpacing until clear
     */
    findSafePosition(chain: number, index: number): {
        x: number;
        y: number;
    };
    /**
     * Place a node and record its bounds.
     * Returns the safe position (x, y).
     */
    placeNode(chain: number, index: number): {
        x: number;
        y: number;
    };
    /**
     * Plan a linear chain of nodes (left-to-right).
     * Returns list of PositionedNode.
     */
    planLinearChain(nodes: {
        name: string;
        type: string;
    }[], chain?: number, container?: string): PositionedNode[];
    /**
     * Plan multiple parallel chains.
     * Each chain gets its own Y offset.
     */
    planParallelChains(chains: {
        name: string;
        type: string;
    }[][], container?: string): PositionedNode[];
    /**
     * Plan parallel chains that merge into a single output.
     * The merge node is placed to the right of the longest chain.
     */
    planWithMerge(chains: {
        name: string;
        type: string;
    }[][], mergeNode: {
        name: string;
        type: string;
    }, container?: string): PositionedNode[];
    /**
     * Generate MCP tool commands for placing and connecting nodes.
     */
    generateMcpCommands(nodes: PositionedNode[], container?: string, crossChainConnections?: [string, string][]): McpCommand[];
    /** Get all placed node bounds */
    getPlacedNodes(): readonly NodeBounds[];
    /** Reset the layout engine for a new project */
    reset(): void;
}
/**
 * Quick planning function: creates a layout engine, plans nodes,
 * and returns MCP commands ready to execute.
 */
export declare function planProject(chains: {
    name: string;
    type: string;
}[][], container?: string, config?: Partial<LayoutConfig>): {
    nodes: PositionedNode[];
    commands: McpCommand[];
};
/**
 * Plan a particle system project (common pattern).
 */
export declare function planParticleSystem(sourceType?: string, container?: string): {
    nodes: PositionedNode[];
    commands: McpCommand[];
};
/**
 * Plan an audio-reactive project.
 */
export declare function planAudioReactive(container?: string): {
    nodes: PositionedNode[];
    commands: McpCommand[];
};
