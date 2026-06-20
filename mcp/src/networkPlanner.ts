/**
 * @deprecated Use networkPlannerGraph.ts instead.
 * This module is a thin re-export wrapper for backward compatibility.
 * All logic has been moved to networkPlannerGraph.ts.
 */

// Re-export everything from networkPlannerGraph.ts
export {
  ensureKnowledgeLoaded,
  planNetworkGraph,
  levenshteinDistance,
  fuzzySearchOperators,
  type GraphPlanOptions,
  type NetworkGraph,
  type GraphNode,
  type GraphConnection,
  type PlanResult,
  type OpTopology,
  isFamilyCompatible,
  deterministicPlan,
  buildTopologyCatalog,
  inferOpTopology,
} from "./networkPlannerGraph.js";

// Re-export FuzzySearchResult type (defined in networkPlannerGraph.ts)
export type { FuzzySearchResult } from "./networkPlannerGraph.js";
