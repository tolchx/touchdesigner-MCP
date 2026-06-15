/**
 * TDN (TouchDesigner Network) v1.4 Type Definitions
 *
 * Based on the Embody TDN schema: a human-readable JSON format for
 * representing TouchDesigner operator networks, enabling version control
 * and git-friendly workflows for .toe projects.
 *
 * Key design principles:
 *   - Only non-default values are stored (minimal footprint)
 *   - Type defaults are compacted into type_defaults section
 *   - Custom parameter templates are deduplicated via par_templates
 *   - Expressions use '=' prefix, binds use '~' prefix
 *   - Volatile headers (build, timestamp) are stripped by git textconv
 */

// ─── Parameter Values ────────────────────────────────────────────────────────

/** A parameter value: constant, expression, bind, or legacy format. */
export type TdnParameterValue =
  | string
  | number
  | boolean
  | { expr: string }
  | { bind: string };

// ─── Flags ───────────────────────────────────────────────────────────────────

/** Operator flag names. Prefixed with '-' to set false. */
export type TdnFlagName =
  | "bypass"
  | "lock"
  | "display"
  | "render"
  | "viewer"
  | "expose"
  | "allowCooking";

export type TdnFlags = string[]; // e.g. ["display", "-bypass"]

// ─── Custom Parameters ───────────────────────────────────────────────────────

/** Custom parameter style enumeration. */
export type TdnParStyle =
  | "Float" | "Int" | "XY" | "XYZ" | "XYZW" | "WH" | "UV" | "UVW"
  | "RGB" | "RGBA" | "Str" | "Menu" | "StrMenu" | "Toggle"
  | "Pulse" | "Momentary" | "Header" | "File" | "FileSave" | "Folder"
  | "Python" | "OP" | "COMP" | "TOP" | "CHOP" | "SOP" | "DAT"
  | "MAT" | "POP" | "Object" | "PanelCOMP" | "Sequence";

/** Definition of a single custom parameter. */
export interface TdnCustomParDef {
  name: string;
  label?: string;
  style: TdnParStyle;
  size?: number;
  default?: TdnParameterValue;
  min?: number;
  max?: number;
  clampMin?: boolean;
  clampMax?: boolean;
  normMin?: number;
  normMax?: number;
  menuNames?: string[];
  menuLabels?: string[];
  menuSource?: string;
  startSection?: boolean;
  readOnly?: boolean;
  help?: string;
  value?: TdnParameterValue;
  values?: TdnParameterValue[];
}

/** Template reference with value overrides. */
export interface TdnTemplateRef {
  $t: string;
  [key: string]: TdnParameterValue;
}

/** Custom parameters grouped by page name. */
export type TdnCustomParsGrouped = Record<
  string,
  TdnCustomParDef[] | TdnTemplateRef
>;

// ─── Connections ─────────────────────────────────────────────────────────────

/** Connection array: position = input index, value = source name or null. */
export type TdnConnectionArray = (string | null)[];

// ─── Annotations ─────────────────────────────────────────────────────────────

export interface TdnAnnotation {
  name: string;
  mode: "annotate" | "comment" | "networkbox";
  title?: string;
  text?: string;
  position?: [number, number];
  size: [number, number];
  color?: [number, number, number];
  opacity?: number;
}

// ─── Operators ───────────────────────────────────────────────────────────────

/** Storage value: primitive, array, or object. */
export type TdnStorageValue =
  | string
  | number
  | boolean
  | null
  | TdnStorageValue[]
  | { [key: string]: TdnStorageValue };

export interface TdnOperator {
  name: string;
  type: string;
  position?: [number, number];
  size?: [number, number];
  color?: [number, number, number];
  comment?: string;
  tags?: string[];
  dock?: string;
  parameters?: Record<string, TdnParameterValue>;
  custom_pars?: TdnCustomParsGrouped | TdnCustomParDef[];
  flags?: TdnFlags;
  storage?: Record<string, TdnStorageValue>;
  startup_storage?: Record<string, TdnStorageValue>;
  inputs?: TdnConnectionArray;
  comp_inputs?: TdnConnectionArray;
  dat_content?: string | string[][];
  dat_content_format?: "text" | "table";
  children?: TdnOperator[];
  annotations?: TdnAnnotation[];
  sequences?: Record<string, Record<string, TdnParameterValue>[]>;
  dat_read_only?: boolean;
  palette_clone?: boolean;
  tdn_ref?: string;
  tox_ref?: string;
}

// ─── Type Defaults ───────────────────────────────────────────────────────────

export interface TdnTypeDefaults {
  parameters?: Record<string, TdnParameterValue>;
  flags?: TdnFlags;
  size?: [number, number];
  color?: [number, number, number];
  tags?: string[];
}

// ─── Root TDN Document ───────────────────────────────────────────────────────

export interface TdnDocument {
  format: "tdn";
  version: string;
  build?: number | null;
  generator: string;
  td_build: string;
  exported_at: string; // ISO 8601
  network_path: string;
  type?: string;
  options: {
    include_dat_content: boolean;
    include_storage?: boolean;
  };
  type_defaults?: Record<string, TdnTypeDefaults>;
  par_templates?: Record<string, TdnCustomParDef[]>;
  custom_pars?: TdnCustomParsGrouped | TdnCustomParDef[];
  parameters?: Record<string, TdnParameterValue>;
  flags?: TdnFlags;
  color?: [number, number, number];
  tags?: string[];
  comment?: string;
  storage?: Record<string, TdnStorageValue>;
  operators: TdnOperator[];
  annotations?: TdnAnnotation[];
}

// ─── Volatile Keys (stripped by git textconv) ────────────────────────────────

/** Keys that change without the network changing. Stripped for clean diffs. */
export const TDN_VOLATILE_KEYS = [
  "build",
  "generator",
  "td_build",
  "exported_at",
  "source_file",
] as const;

// ─── Export Options ──────────────────────────────────────────────────────────

export interface TdnExportOptions {
  /** Include DAT text/table content (default: true). */
  include_dat_content?: boolean;
  /** Include operator storage entries (default: true). */
  include_storage?: boolean;
  /** Output file path (if omitted, returns JSON string). */
  output_file?: string;
}

// ─── Diff Result ─────────────────────────────────────────────────────────────

export interface TdnDiffResult {
  /** Whether the networks are identical (ignoring volatile headers). */
  identical: boolean;
  /** Operators only in the live network. */
  only_live: string[];
  /** Operators only in the saved file. */
  only_saved: string[];
  /** Operators with parameter differences. */
  param_diffs: Array<{
    operator: string;
    parameter: string;
    live_value: TdnParameterValue;
    saved_value: TdnParameterValue;
  }>;
  /** Operators with connection differences. */
  connection_diffs: Array<{
    operator: string;
    input_index: number;
    live_source: string | null;
    saved_source: string | null;
  }>;
  /** Total number of differences. */
  total_differences: number;
  /** Human-readable summary. */
  summary: string;
}
