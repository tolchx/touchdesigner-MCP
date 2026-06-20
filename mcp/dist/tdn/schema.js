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
// ─── Volatile Keys (stripped by git textconv) ────────────────────────────────
/** Keys that change without the network changing. Stripped for clean diffs. */
export const TDN_VOLATILE_KEYS = [
    "build",
    "generator",
    "td_build",
    "exported_at",
    "source_file",
];
