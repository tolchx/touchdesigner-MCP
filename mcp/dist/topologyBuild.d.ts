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
export declare function detectFamily(name: string, opData?: any): string;
export interface InputInfo {
    index: number;
    name: string;
    accepts: string;
    description: string;
}
export interface OutputInfo {
    name: string;
    type: string;
}
export interface ConnectionPattern {
    operators: string[];
    description: string;
    frequency?: number;
}
export declare const MULTI_INPUT: Record<string, number>;
export declare const ZERO_INPUT: Set<string>;
export declare function getInputCount(opType: string, opData?: any): number;
export declare function isMultiInput(opType: string): boolean;
/**
 * Known common connection patterns from real TD projects.
 * Format: sourceFamily → targetFamily (typical flow direction)
 */
export declare const FAMILY_FLOW: Record<string, string[]>;
export declare function inferConnectsTo(opType: string, family: string, opData?: any): string[];
export declare function inferCommonCombinations(opType: string, family: string, connectsTo: string[], opData?: any): ConnectionPattern[];
export interface TopologyEntry {
    opType: string;
    family: string;
    label: string;
    inputCount: number;
    isMultiInput: boolean;
    inputs: InputInfo[];
    outputs: OutputInfo[];
    connectsTo: string[];
    commonCombinations: ConnectionPattern[];
    warnings: string[];
    /** The pageSlug from the operator doc for cross-referencing */
    pageSlug?: string;
}
export declare function main(): Promise<void>;
