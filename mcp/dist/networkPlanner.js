/**
 * @deprecated Use networkPlannerGraph.ts instead.
 * This module is a thin re-export wrapper for backward compatibility.
 * All logic has been moved to networkPlannerGraph.ts.
 */
// Re-export everything from networkPlannerGraph.ts
export { ensureKnowledgeLoaded, planNetworkGraph, levenshteinDistance, fuzzySearchOperators, isFamilyCompatible, deterministicPlan, buildTopologyCatalog, inferOpTopology, } from "./networkPlannerGraph.js";
