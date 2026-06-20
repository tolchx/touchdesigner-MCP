/**
 * Topology Data — Types, pattern tables, inference, and catalog builder
 *
 * Extracted from networkPlannerGraph.ts to separate data/logic from planning.
 */
export interface GraphNode {
    /** Unique ID within this graph (e.g., "n0", "noise_src") */
    id: string;
    /** TD operator type (e.g., "noiseTOP", "compositeTOP", "particlePOP") */
    opType: string;
    /** Human-readable label */
    label: string;
    /** Parent path in TD */
    parentPath: string;
    /** Optional position */
    x?: number;
    y?: number;
    /** Key parameters to set after creation */
    parameters?: Record<string, unknown>;
}
export interface GraphConnection {
    /** Source node ID */
    from: string;
    /** Target node ID */
    to: string;
    /** Target input index (default: 0) */
    inputIndex: number;
    /** Optional source output name */
    sourceOutput?: string;
}
export interface NetworkGraph {
    /** Human description of what this graph does */
    description: string;
    /** Nodes to create */
    nodes: GraphNode[];
    /** Connections to wire after creation */
    connections: GraphConnection[];
    /** Target container path */
    targetPath: string;
    /** Optional container name */
    containerName?: string;
}
export interface PlanResult {
    success: boolean;
    graph?: NetworkGraph;
    message?: string;
    error?: string;
    /** Number of nodes created */
    createdCount?: number;
    /** Number of connections wired */
    connectedCount?: number;
}
export interface OpTopology {
    opType: string;
    family: string;
    label: string;
    /** Number of inputs the operator accepts */
    inputCount: number;
    /** Descriptions of each input */
    inputs: Array<{
        index: number;
        description: string;
        accepts?: string;
    }>;
    /** Types of outputs produced */
    outputs: Array<{
        name: string;
        type: string;
    }>;
    /** Common operators this connects to */
    connectsTo: string[];
    /** Is this a multi-input operator? */
    isMultiInput: boolean;
    /** Warning: needs specific setup (e.g., feedback target) */
    warnings: string[];
    /** Common combinations from the knowledge base */
    commonCombinations: Array<{
        operators: string[];
        description: string;
    }>;
}
/**
 * Input count inference by family and type.
 * Many operators accept unlimited inputs (maxInputs === -1 means "many").
 * This is conservative — assumes 1 unless we know otherwise.
 */
export declare const MULTI_INPUT_PATTERNS: Record<string, {
    min: number;
    max: number;
}>;
export declare const SINGLE_INPUT_PATTERNS: Set<string>;
/**
 * Infer topology data for a given operator from the knowledge base
 * and pattern tables.
 */
export declare function inferOpTopology(opType: string, opData: any): OpTopology;
/**
 * Build a full topology catalog from the knowledge base AND topology.json.
 * Returns a map of opType → OpTopology.
 * Priority: topology.json > knowledge base inference > pattern tables.
 */
export declare function buildTopologyCatalog(): Map<string, OpTopology>;
