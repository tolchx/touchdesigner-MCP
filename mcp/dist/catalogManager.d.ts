/**
 * Catalog Manager — Unified Operator Catalog
 *
 * Manages a "catalog" of all available TouchDesigner operators:
 *   - creation defaults per operator type
 *   - parameter style mappings per family
 *   - POP-specific parameter handling
 *   - family metadata (class suffixes, palette types)
 *   - catalog search and listing
 *
 * Combines hardcoded family/parameter metadata with data from the
 * ops and pops knowledge bases (loaded via knowledgeCache).
 */
import { type TdFamily } from "./knowledgeCache.js";
export type { TdFamily };
/** Palette browser category for each family. */
export type PaletteType = "TOP" | "CHOP" | "SOP" | "DAT" | "POPs" | "COMP" | "MAT";
/**
 * How parameters are set for operators in a given family.
 *
 *   direct      — op.par.X = val  (TOP, CHOP, SOP, DAT, COMP, MAT)
 *   property    — op.par.X.val = val  (alternative style)
 *   pop-custom  — op.appendFloat/Int/String/Menu(...)  (POP)
 */
export type ParameterStyle = "direct" | "property" | "pop-custom";
/** Creation metadata for one operator family. */
export interface FamilyMeta {
    family: TdFamily;
    /** Python API class suffix (e.g. "top" for noiseTOP) */
    pythonSuffix: string;
    /** Palette browser tab name */
    paletteType: PaletteType;
    /** How this family sets primary parameters */
    parameterStyle: ParameterStyle;
    /** Python expression for creating an operator of this family */
    creationFn: string;
    /** Whether the family has experimental operators */
    hasExperimental: boolean;
}
/**
 * A single entry in the catalog — combines index data with family metadata
 * and sensible creation defaults.
 */
export interface CatalogEntry {
    opType: string;
    family: TdFamily;
    label: string;
    pageSlug: string;
    url: string;
    paletteType: PaletteType;
    parameterStyle: ParameterStyle;
    isExperimental: boolean;
    summary?: string;
    creationDefaults?: Record<string, unknown>;
}
/** Options for searching the catalog. */
export interface CatalogSearchOptions {
    query?: string;
    family?: TdFamily;
    includeExperimental?: boolean;
    limit?: number;
}
export declare const FAMILY_MAP: Record<TdFamily, FamilyMeta>;
/**
 * How each family sets parameters in Python.
 *
 *   direct:      op.par.X = value          (standard for TOP/CHOP/SOP/DAT/COMP/MAT)
 *   property:    op.par.X.val = value      (valid but verbose, rarely preferred)
 *   pop-custom:  op.appendFloat(name, ...) (POP custom parameters)
 *                op.appendInt(name, ...)
 *                op.appendString(name, ...)
 *                op.appendMenu(name, ...)
 */
export declare const PARAMETER_STYLE_MAP: Record<TdFamily, {
    style: ParameterStyle;
    description: string;
    setValueExample: string;
    setExpressionExample: string;
    /** For pop-custom: the methods used to append custom parameters. */
    appendMethods?: string[];
}>;
/**
 * POP family uses appendFloat(), appendInt(), appendString(), appendMenu()
 * for defining custom per-particle attributes.
 *
 * Unlike TOP/CHOP/SOP where parameters are static pages, POPs dynamically
 * register custom attributes that appear as parameters on the POP node.
 * Input management also differs: POPs chain sequentially (particle flow)
 * rather than having multiple distinct input connectors.
 */
export declare const POP_PARAMETER_STYLE: {
    /** Custom parameter appending methods on the POP Python object. */
    appendMethods: readonly ["appendFloat", "appendInt", "appendString", "appendMenu"];
    /**
     * Signature for each append method (Python).
     *
     * appendFloat(name: str, label: str, order: int = 0, size: int = 1,
     *             default: float = 0, min: float = -1, max: float = 1,
     *             clampMin: bool = False, clampMax: bool = False) -> None
     *
     * appendInt(name: str, label: str, order: int = 0, size: int = 1,
     *           default: int = 0, min: int = -1, max: int = 1,
     *           clampMin: bool = False, clampMax: bool = False) -> None
     *
     * appendString(name: str, label: str, order: int = 0,
     *              default: str = '') -> None
     *
     * appendMenu(name: str, label: str, order: int = 0,
     *            default: str = '', menuNames: list[str] = [],
     *            menuLabels: list[str] = []) -> None
     */
    signatures: {
        appendFloat: string;
        appendInt: string;
        appendString: string;
        appendMenu: string;
    };
    /**
     * POP inputs are managed differently from TOP/CHOP:
     * - POPs chain sequentially (output of one POP feeds into the next).
     * - A POP node typically has a single "Source" input (the upstream POP).
     * - Some POPs (like PopMerge) have multiple inputs.
     * - POP inputs are NOT indexed output connectors like TOP/CHOP — they
     *   carry entire particle streams.
     */
    inputManagement: {
        pattern: string;
        description: string;
        maxSourceInputs: number;
        multiInputPOPs: string[];
    };
};
/**
 * Sensible defaults when creating common operator types.
 * These are applied after the operator is created.
 *
 * Keyed by the Python opType string (lowercase).
 * Each entry is a map of parameter name → value.
 */
export declare const CREATION_DEFAULTS: Record<string, Record<string, unknown>>;
/** Load and build the unified catalog from knowledge bases. Idempotent. */
export declare function ensureCatalogLoaded(): void;
/**
 * Get creation defaults for a specific operator type.
 * Returns sensible default parameter values, or undefined if the type isn't known.
 */
export declare function getCreationDefaults(opType: string): Record<string, unknown> | undefined;
/**
 * Check whether an operator type is in the experimental POP family.
 * Returns true only for POP operators marked as experimental.
 */
export declare function isExperimental(opType: string): boolean;
/**
 * Get the Palette browser type for an operator.
 * Returns the palette tab name (TOP/CHOP/SOP/DAT/POPs/COMP/MAT)
 * or "UNKNOWN" if the operator isn't in the catalog.
 */
export declare function getPaletteType(opType: string): PaletteType | "UNKNOWN";
/**
 * Get the TdFamily for a given operator type (case-insensitive).
 * Returns undefined if the type can't be resolved.
 */
export declare function getFamily(opType: string): TdFamily | undefined;
/**
 * Get parameter style info for a specific family.
 */
export declare function getParameterStyle(familyOrOpType: TdFamily | string): (typeof PARAMETER_STYLE_MAP)[TdFamily] | undefined;
/**
 * List all operators belonging to a family.
 */
export declare function listByFamily(family: TdFamily, includeExperimental?: boolean): CatalogEntry[];
/**
 * Search the catalog by name, label, or opType.
 * Returns scored results sorted by relevance.
 */
export declare function searchCatalog(query: string, options?: CatalogSearchOptions): CatalogEntry[];
/**
 * Get a single catalog entry by opType (case-insensitive).
 * Returns undefined if not found.
 */
export declare function getCatalogEntry(opType: string): CatalogEntry | undefined;
/**
 * Get the full catalog as an array.
 */
export declare function getAllCatalogEntries(): CatalogEntry[];
/**
 * Get the total number of operators in the catalog.
 */
export declare function getCatalogCount(): number;
/**
 * Get catalog counts by family.
 */
export declare function getCatalogCountsByFamily(): Record<TdFamily, number>;
/**
 * Convenience: list all available TdFamily values.
 */
export declare function getAllFamilies(): TdFamily[];
/**
 * Convenience: get FamilyMeta for a family.
 */
export declare function getFamilyMeta(family: TdFamily): FamilyMeta;
