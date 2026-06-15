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

import {
  ensureKnowledgeLoaded,
  getOpsIndex,
  getPopsIndex,
  type OpsIndex,
  type PopsIndex,
} from "./knowledgeCache.js";
import type { TdFamily as OpsTdFamily } from "./opsDb.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** All 7 TouchDesigner operator families. */
export type TdFamily = "TOP" | "CHOP" | "SOP" | "DAT" | "POP" | "COMP" | "MAT";

/** Palette browser category for each family. */
export type PaletteType =
  | "TOP"
  | "CHOP"
  | "SOP"
  | "DAT"
  | "POPs"
  | "COMP"
  | "MAT";

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
  creationFn: string; // e.g. "parent.create(type)" for most, special for COMP?
  /** Whether the family has experimental operators */
  hasExperimental: boolean;
}

/**
 * A single entry in the catalog — combines index data with family metadata
 * and sensible creation defaults.
 */
export interface CatalogEntry {
  opType: string;           // e.g. "noiseTOP", "constantCHOP"
  family: TdFamily;
  label: string;            // Display name (e.g. "Noise TOP")
  pageSlug: string;         // Wiki page slug
  url: string;              // Documentation URL
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

// ─── FAMILY_MAP — all 7 families with metadata ──────────────────────────────

export const FAMILY_MAP: Record<TdFamily, FamilyMeta> = {
  TOP: {
    family: "TOP",
    pythonSuffix: "top",
    paletteType: "TOP",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
  CHOP: {
    family: "CHOP",
    pythonSuffix: "chop",
    paletteType: "CHOP",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
  SOP: {
    family: "SOP",
    pythonSuffix: "sop",
    paletteType: "SOP",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
  DAT: {
    family: "DAT",
    pythonSuffix: "dat",
    paletteType: "DAT",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
  POP: {
    family: "POP",
    pythonSuffix: "pop",
    paletteType: "POPs",
    parameterStyle: "pop-custom",
    creationFn: "parent.create(type)",
    hasExperimental: true,
  },
  COMP: {
    family: "COMP",
    pythonSuffix: "comp",
    paletteType: "COMP",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
  MAT: {
    family: "MAT",
    pythonSuffix: "mat",
    paletteType: "MAT",
    parameterStyle: "direct",
    creationFn: "parent.create(type)",
    hasExperimental: false,
  },
};

// ─── PARAMETER_STYLE_MAP — detailed per-family parameter patterns ───────────

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
export const PARAMETER_STYLE_MAP: Record<
  TdFamily,
  {
    style: ParameterStyle;
    description: string;
    setValueExample: string;
    setExpressionExample: string;
    /** For pop-custom: the methods used to append custom parameters. */
    appendMethods?: string[];
  }
> = {
  TOP: {
    style: "direct",
    description:
      "Standard parameter access via op.par.X assignment. Both .par.X = val and .par.X.val = val work.",
    setValueExample: "op.par.Noiseamplitude = 0.5",
    setExpressionExample: "op.par.Noiseamplitude.expr = 'absTime.frame / 100'",
  },
  CHOP: {
    style: "direct",
    description:
      "Standard parameter access. CHOPs frequently use channel expressions on sample/value parameters.",
    setValueExample: "op.par.Value0v = 0.8",
    setExpressionExample: "op.par.Value0v.expr = 'op(\"wave1\")[\"chan1\"]'",
  },
  SOP: {
    style: "direct",
    description:
      "Standard parameter access. Multi-parameter attributes use .par.Tuplet, .par.Tuplet2, etc.",
    setValueExample: "op.par.tx = 2.5",
    setExpressionExample: "op.par.tx.expr = 'me.time.frame * 0.1'",
  },
  DAT: {
    style: "direct",
    description:
      "Standard parameter access. Text content set via .text property, not .par.",
    setValueExample: "op.par.file = '/path/to/file.txt'",
    setExpressionExample: "op.text = op('table1').text",
  },
  POP: {
    style: "pop-custom",
    description:
      "POP operators manage custom parameters via append* methods. " +
      "Standard attributes (position, velocity, color, etc.) follow the pattern: " +
      "op.addAttrib('P', (1,2,3)) or set via SOP parameters on the POP's geometry parameter.",
    setValueExample: "op.par.Emitters = 100",
    setExpressionExample: "op.par.Emitters.expr = 'op(\"chop1\")[\"count\"]'",
    appendMethods: ["appendFloat", "appendInt", "appendString", "appendMenu"],
  },
  COMP: {
    style: "direct",
    description:
      "Standard parameter access. Components can define custom parameter pages via extension scripts.",
    setValueExample: "op.par.W = 1280",
    setExpressionExample: "op.par.W.expr = 'me.parent().par.W * 0.5'",
  },
  MAT: {
    style: "direct",
    description:
      "Standard parameter access. Material parameters include color pickers, textures, and uniforms.",
    setValueExample: "op.par.Colorr = 1.0",
    setExpressionExample: "op.par.Colorr.expr = 'absTime.seconds % 1'",
  },
};

// ─── POP-specific parameter style details ───────────────────────────────────

/**
 * POP family uses appendFloat(), appendInt(), appendString(), appendMenu()
 * for defining custom per-particle attributes.
 *
 * Unlike TOP/CHOP/SOP where parameters are static pages, POPs dynamically
 * register custom attributes that appear as parameters on the POP node.
 * Input management also differs: POPs chain sequentially (particle flow)
 * rather than having multiple distinct input connectors.
 */
export const POP_PARAMETER_STYLE = {
  /** Custom parameter appending methods on the POP Python object. */
  appendMethods: [
    "appendFloat",
    "appendInt",
    "appendString",
    "appendMenu",
  ] as const,

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
    appendFloat:
      "appendFloat(name: str, label: str, order: int = 0, size: int = 1, " +
      "default: float = 0, min: float = -1, max: float = 1, " +
      "clampMin: bool = False, clampMax: bool = False) -> None",
    appendInt:
      "appendInt(name: str, label: str, order: int = 0, size: int = 1, " +
      "default: int = 0, min: int = -1, max: int = 1, " +
      "clampMin: bool = False, clampMax: bool = False) -> None",
    appendString:
      "appendString(name: str, label: str, order: int = 0, default: str = '') -> None",
    appendMenu:
      "appendMenu(name: str, label: str, order: int = 0, default: str = '', " +
      "menuNames: list[str] = [], menuLabels: list[str] = []) -> None",
  },

  /**
   * POP inputs are managed differently from TOP/CHOP:
   * - POPs chain sequentially (output of one POP feeds into the next).
   * - A POP node typically has a single "Source" input (the upstream POP).
   * - Some POPs (like PopMerge) have multiple inputs.
   * - POP inputs are NOT indexed output connectors like TOP/CHOP — they
   *   carry entire particle streams.
   */
  inputManagement: {
    pattern: "sequential_chain",
    description:
      "POP nodes chain sequentially: each POP outputs to the next POP's " +
      "source input. Multiple POP branches can be merged via PopMerge. " +
      "Inputs carry entire particle streams, not individual channels/layers.",
    maxSourceInputs: 1,
    multiInputPOPs: [
      "popmerge",
      "popinteract",
    ],
  },
};

// ─── Creation defaults for common operators ─────────────────────────────────

/**
 * Sensible defaults when creating common operator types.
 * These are applied after the operator is created.
 *
 * Keyed by the Python opType string (lowercase).
 * Each entry is a map of parameter name → value.
 */
export const CREATION_DEFAULTS: Record<string, Record<string, unknown>> = {
  // ── TOPs ──
  noisetop: {
    resolution: [1280, 720],
    type: "simplex",
    amplitude: 1,
    period: 5,
    monochrome: true,
  },
  constanttop: {
    resolution: [1280, 720],
    colorr: 0,
    colorg: 0,
    colorb: 0,
    colora: 1,
  },
  ramptop: { resolution: [1280, 720], type: "horizontal" },
  leveltop: { opacity: 1, brightness: 1, blacklevel: 0 },
  nulltop: {},
  comptop: { resolution: [1280, 720] },
  compositetop: {},
  transformtop: { scale: 1, rotate: 0, translate: [0, 0] },
  moviefileintop: { play: true },
  blurtop: { filter: "gaussian", radius: 5 },
  feedbacktop: {},

  // ── CHOPs ──
  constantchop: { value0v: 0 },
  noisychop: { amplitude: 1, frequency: 1, type: "random" },
  mathchop: { multiply: 1, preoff: 0 },
  lfochop: { frequency: 1, amplitude: 1, phase: 0, type: "sine" },
  wavechop: { frequency: 1, amplitude: 1, type: "sine" },
  nullchop: {},
  selectchop: {},
  mergechop: {},
  lagchop: { lag: 0.5 },
  speedchop: { speed: 1 },
  countchop: { limitmin: 0, limitmax: 1 },
  triggerchop: { attack: 0.1, decay: 0.5, peak: 1 },
  filterchop: { frequency: 1, width: 1, type: "lowpass" },

  // ── SOPs ──
  nullsop: {},
  boxsop: { size: [1, 1, 1], center: [0, 0, 0] },
  spheresop: { radius: 1, rows: 20, cols: 20 },
  gridsop: { size: [10, 10], rows: 20, cols: 20 },
  circlesop: { radius: 1, rows: 3, cols: 3 },
  textsop: { text: "Text", fontsize: 12 },
  linesop: { length: 1, points: 2 },
  transformsop: { translate: [0, 0, 0], rotate: [0, 0, 0], scale: [1, 1, 1] },
  mergesop: {},
  sortsop: {},
  switchsop: {},
  groupsop: {},
  extudesop: { depth: 1 },
  noise_fractalsop: { amplitude: 1, frequency: 1 },

  // ── DATs ──
  textdat: { text: "" },
  tabledat: { rows: 4, cols: 4 },
  nulldat: {},
  selectdat: {},
  scriptdat: { script: "" },
  mergedat: {},
  switchdat: {},
  evalutedat: { expr: "" },
  infodat: {},
  parameterdat: {},
  chopexecdat: {},
  execute_dat: { offon: "Off to On" },

  // ── COMPs ──
  containercomp: {},
  basecomp: {},
  nullcomp: {},
  geometrycomp: {},
  lightcomp: {},
  cameracomp: {},
  panelcomp: {},
  buttoncomp: { label: "Button" },
  slidercomp: { label: "Slider", default: 0.5 },
  selectcomp: {},
  scriptcomp: {},
  textcomp: {},

  // ── MATs ──
  phongmat: { diffuser: 0.7, diffuseg: 0.7, diffuseb: 0.7 },
  constantmat: {
    colorr: 0.5,
    colorg: 0.5,
    colorb: 0.5,
    colora: 1,
  },
  pbr_mat: { baser: 0.8, baseg: 0.8, baseb: 0.8, roughness: 0.5 },
  glslmat: {},
  line_mat: { width: 1, colorr: 1, colorg: 1, colorb: 1 },
  point_sprite: { pointscale: 1 },

  // ── POPs ──
  particle: {
    emittype: "line",
    lifexpect: 5,
    maxparticles: 1000,
    rate: 60,
    active: true,
  },
  force: { active: true, forcex: 0, forcey: -1, forcez: 0 },
  gravity: { gravityx: 0, gravityy: -9.8, gravityz: 0 },
  drag: { drag: 0.1 },
  turbulance: { magnitude: 1, scale: 1, active: true },
  colorpop: { colorr: 1, colorg: 1, colorb: 1, active: true },
  sprite: { texture: "", activesprites: true },
  popmerge: {},
  attractor: { strength: 1, active: true, range: 10 },
  lookat: {},
  speedlimit: { maxspeed: 10, minspeed: 0 },
};

// ─── Internal cache ─────────────────────────────────────────────────────────

let _catalogLoaded = false;
let _catalogEntries: CatalogEntry[] = [];
let _catalogByFamily: Map<TdFamily, CatalogEntry[]> = new Map();
let _catalogByType: Map<string, CatalogEntry> = new Map();

// ─── Initialization ─────────────────────────────────────────────────────────

/** Load and build the unified catalog from knowledge bases. Idempotent. */
export function ensureCatalogLoaded(): void {
  if (_catalogLoaded) return;

  ensureKnowledgeLoaded();

  const opsIndex: OpsIndex = getOpsIndex();
  const popsIndex: PopsIndex = getPopsIndex();

  const entries: CatalogEntry[] = [];

  // ── Build entries from ops index (TOP/CHOP/SOP/DAT) ──
  for (const op of opsIndex.operators) {
    const family = op.family as TdFamily;
    const familyMeta = FAMILY_MAP[family];
    if (!familyMeta) continue;

    const opType = op.tdOpTypeGuess ?? op.pageSlug;
    const entry: CatalogEntry = {
      opType,
      family,
      label: op.pageTitle ?? opType,
      pageSlug: op.pageSlug,
      url: op.url,
      paletteType: familyMeta.paletteType,
      parameterStyle: familyMeta.parameterStyle,
      isExperimental: false,
      summary: op.summary,
      creationDefaults: CREATION_DEFAULTS[opType.toLowerCase()],
    };
    entries.push(entry);
  }

  // ── Build entries from pops index (POP) ──
  for (const op of popsIndex.operators) {
    const family = "POP" as TdFamily;
    const familyMeta = FAMILY_MAP.POP;
    const opType = op.tdOpTypeGuess ?? op.pageSlug;
    const entry: CatalogEntry = {
      opType,
      family,
      label: op.pageTitle ?? opType,
      pageSlug: op.pageSlug,
      url: op.url,
      paletteType: familyMeta.paletteType,
      parameterStyle: familyMeta.parameterStyle,
      isExperimental: op.experimental ?? false,
      summary: op.summary,
      creationDefaults: CREATION_DEFAULTS[opType.toLowerCase()],
    };
    entries.push(entry);
  }

  // ── Build lookup maps ──
  _catalogEntries = entries;
  _catalogByType.clear();
  _catalogByFamily.clear();

  for (const entry of entries) {
    // Index by opType (case-insensitive)
    _catalogByType.set(entry.opType.toLowerCase(), entry);
    // Index by pageSlug as fallback
    _catalogByType.set(entry.pageSlug.toLowerCase(), entry);

    // Group by family
    let famEntries = _catalogByFamily.get(entry.family);
    if (!famEntries) {
      famEntries = [];
      _catalogByFamily.set(entry.family, famEntries);
    }
    famEntries.push(entry);
  }

  _catalogLoaded = true;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get creation defaults for a specific operator type.
 * Returns sensible default parameter values, or undefined if the type isn't known.
 */
export function getCreationDefaults(
  opType: string,
): Record<string, unknown> | undefined {
  ensureCatalogLoaded();
  return CREATION_DEFAULTS[opType.toLowerCase()];
}

/**
 * Check whether an operator type is in the experimental POP family.
 * Returns true only for POP operators marked as experimental.
 */
export function isExperimental(opType: string): boolean {
  ensureCatalogLoaded();
  const entry = _catalogByType.get(opType.toLowerCase());
  return entry?.isExperimental ?? false;
}

/**
 * Get the Palette browser type for an operator.
 * Returns the palette tab name (TOP/CHOP/SOP/DAT/POPs/COMP/MAT)
 * or "UNKNOWN" if the operator isn't in the catalog.
 */
export function getPaletteType(opType: string): PaletteType | "UNKNOWN" {
  ensureCatalogLoaded();
  const entry = _catalogByType.get(opType.toLowerCase());
  if (entry) return entry.paletteType;

  // Fallback: guess from opType suffix
  const upper = opType.toUpperCase();
  if (upper.endsWith("TOP")) return "TOP";
  if (upper.endsWith("CHOP")) return "CHOP";
  if (upper.endsWith("SOP")) return "SOP";
  if (upper.endsWith("DAT")) return "DAT";
  if (upper.endsWith("POP")) return "POPs";
  if (upper.endsWith("COMP")) return "COMP";
  if (upper.endsWith("MAT")) return "MAT";

  return "UNKNOWN";
}

/**
 * Get the TdFamily for a given operator type (case-insensitive).
 * Returns undefined if the type can't be resolved.
 */
export function getFamily(opType: string): TdFamily | undefined {
  ensureCatalogLoaded();
  const entry = _catalogByType.get(opType.toLowerCase());
  if (entry) return entry.family;

  // Fallback: guess from opType suffix
  const upper = opType.toUpperCase();
  if (upper.endsWith("TOP")) return "TOP";
  if (upper.endsWith("CHOP")) return "CHOP";
  if (upper.endsWith("SOP")) return "SOP";
  if (upper.endsWith("DAT")) return "DAT";
  if (upper.endsWith("POP")) return "POP";
  if (upper.endsWith("COMP")) return "COMP";
  if (upper.endsWith("MAT")) return "MAT";

  return undefined;
}

/**
 * Get parameter style info for a specific family.
 */
export function getParameterStyle(
  familyOrOpType: TdFamily | string,
): (typeof PARAMETER_STYLE_MAP)[TdFamily] | undefined {
  const family = familyOrOpType.length <= 4
    ? (familyOrOpType as TdFamily)
    : getFamily(familyOrOpType);
  if (!family) return undefined;
  return PARAMETER_STYLE_MAP[family];
}

/**
 * List all operators belonging to a family.
 */
export function listByFamily(
  family: TdFamily,
  includeExperimental = true,
): CatalogEntry[] {
  ensureCatalogLoaded();
  const entries = _catalogByFamily.get(family) ?? [];
  if (includeExperimental) return entries;
  return entries.filter((e) => !e.isExperimental);
}

/**
 * Search the catalog by name, label, or opType.
 * Returns scored results sorted by relevance.
 */
export function searchCatalog(
  query: string,
  options: CatalogSearchOptions = {},
): CatalogEntry[] {
  ensureCatalogLoaded();

  const {
    family,
    includeExperimental = true,
    limit = 50,
  } = options;

  const q = query.trim().toLowerCase();
  if (!q) {
    let results = _catalogEntries;
    if (family) {
      results = results.filter((e) => e.family === family);
    }
    if (!includeExperimental) {
      results = results.filter((e) => !e.isExperimental);
    }
    return results.slice(0, Math.max(1, Math.min(200, limit)));
  }

  // Score each entry against the query
  const scored: { entry: CatalogEntry; score: number }[] = [];

  for (const entry of _catalogEntries) {
    if (family && entry.family !== family) continue;
    if (!includeExperimental && entry.isExperimental) continue;

    const haystack = [
      entry.opType,
      entry.label,
      entry.pageSlug,
      entry.summary ?? "",
    ].join(" ").toLowerCase();

    // Exact match (opType)
    if (entry.opType.toLowerCase() === q) {
      scored.push({ entry, score: 2000 });
      continue;
    }

    // Starts with query
    const startIdx = haystack.indexOf(q);
    if (startIdx === 0) {
      scored.push({ entry, score: 1500 });
      continue;
    }

    // Contains query
    if (startIdx > 0) {
      scored.push({ entry, score: 1000 - startIdx });
      continue;
    }

    // Token-based partial matching: score each word
    const tokens = q.split(/\s+/);
    let tokenScore = 0;
    for (const token of tokens) {
      if (token.length < 2) continue;
      const ti = haystack.indexOf(token);
      if (ti >= 0) {
        tokenScore += 500 - ti;
      }
    }
    if (tokenScore > 0) {
      scored.push({ entry, score: tokenScore });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(200, limit))).map((s) => s.entry);
}

/**
 * Get a single catalog entry by opType (case-insensitive).
 * Returns undefined if not found.
 */
export function getCatalogEntry(opType: string): CatalogEntry | undefined {
  ensureCatalogLoaded();
  return _catalogByType.get(opType.toLowerCase());
}

/**
 * Get the full catalog as an array.
 */
export function getAllCatalogEntries(): CatalogEntry[] {
  ensureCatalogLoaded();
  return _catalogEntries;
}

/**
 * Get the total number of operators in the catalog.
 */
export function getCatalogCount(): number {
  ensureCatalogLoaded();
  return _catalogEntries.length;
}

/**
 * Get catalog counts by family.
 */
export function getCatalogCountsByFamily(): Record<TdFamily, number> {
  ensureCatalogLoaded();
  const counts: Record<string, number> = {};
  _catalogByFamily.forEach((entries, family) => {
    counts[family] = entries.length;
  });
  return counts as Record<TdFamily, number>;
}

/**
 * Convenience: list all available TdFamily values.
 */
export function getAllFamilies(): TdFamily[] {
  return Object.keys(FAMILY_MAP) as TdFamily[];
}

/**
 * Convenience: get FamilyMeta for a family.
 */
export function getFamilyMeta(family: TdFamily): FamilyMeta {
  return FAMILY_MAP[family];
}
