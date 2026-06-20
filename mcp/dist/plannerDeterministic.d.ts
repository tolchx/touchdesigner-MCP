/**
 * Deterministic Fallback Planner — Plans networks without LLM
 *
 * Extracted from networkPlannerGraph.ts. Provides a keyword-matching
 * topology-aware planner used when LLM is unavailable.
 */
import type { OpTopology, NetworkGraph } from "./topologyData.js";
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
export declare function isFamilyCompatible(sourceFamily: string, targetFamily: string): boolean;
/**
 * Deterministic network planner that understands basic topology.
 * Much better than the old linear chain — handles multi-input, branching, etc.
 */
export declare function deterministicPlan(prompt: string, catalog: Map<string, OpTopology>, targetPath: string): NetworkGraph;
