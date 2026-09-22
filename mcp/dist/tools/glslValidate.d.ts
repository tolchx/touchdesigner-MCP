/**
 * glslValidate — GLSL POP shader safety net for the MCP write path.
 *
 * Port of the verified Python analyzer (tests/test_glsl_pop_offline.py) plus
 * the apply flow from docs/GLSL_POP_RULES.md (all rules verified live on
 * TD 2025.32460 by toe/src/test_glsl_pops.py):
 *
 *   R1: the OUTPUT cannot be read in the same shader — `P[id] = P[id] * 1.001;`
 *       fails to compile; read the input instead: `TDIn_P(0, id)`.
 *   R2: canonical iteration: `const uint id = TDIndex(); if (id >= TDNumElements()) return;`
 *   R3: `outputattrs` only selects attributes that ALREADY exist on the input.
 *       A new attribute (Cd, N, custom) must be created via Create Attributes:
 *       attrNname='Custom', attrNcustomname='<attr>', attrNnumcomps=<comps>.
 *   R4: output attributes are WRITE-ONLY; reading one you also write requires
 *       outputaccess='readwrite'.
 *   R5: the real compiler error lives in the auto-generated infoDAT
 *       `<glsl_name>_info` — `errors()` only says "Compile failed".
 *   R6: POP numPoints/numPrims/bounds/points are METHODS.
 */
/** Component counts verified against the live build (docs/GLSL_POP_RULES.md R3). */
export declare const ATTR_COMPONENTS: Record<string, number>;
/** Attributes TD provides automatically on the input. */
export declare const BUILTIN_ATTRS: Set<string>;
export interface GlslAnalysis {
    writes: string[];
    reads: string[];
    /** Attributes written that don't exist on the input → must be created (R3). */
    needs_create_attrs: string[];
    /** Shader reads an attribute it also writes (other than P) → set readwrite (R4). */
    needs_readwrite: boolean;
    /** Blocking errors: shader reads the OUTPUT P (R1) — refuses before compile. */
    errors: string[];
    warnings: string[];
    has_tdindex_pattern: boolean;
    /** Create-Attributes parameter recipes for needs_create_attrs. */
    create_attr_params: Array<{
        attr: string;
        params: Record<string, string | number>;
    }>;
}
/**
 * Analyze a GLSL POP shader before it reaches TD (pure function, no I/O).
 * Mirrors GLSLSyntaxChecker.analyze()/validate_shader() in
 * tests/test_glsl_pop_offline.py — do not fork the semantics.
 */
export declare function analyzeGlslShader(code: string): GlslAnalysis;
/** R3 recipe: Create Attributes parameters for one attribute (None → builtin). */
export declare function buildCreateAttrParams(attr: string): Record<string, string | number>;
export interface GlslTopAnalysis {
    has_fragcolor_out: boolean;
    bad_uv_swizzles: string[];
    has_main: boolean;
    uses_uniform0name_risk: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Analyze a GLSL TOP pixel shader before it reaches TD (pure function).
 * Rules from docs/GLSL_TOP_RULES.md (all verified live on TD 2025.31760):
 *   T1: explicit `out vec4 fragColor` declaration.
 *   T2: vUV swizzles are .st/.xy — .uv/.uv1/.texcoord do NOT compile (probe G).
 *   T4: uniforms are bound via vec0-star/const0-star/matrix0/ac0 families — there is NO
 *       uniform0name on glslTOP (probe D); flag it when the creation code tries.
 *   T9: real compile errors live in `<name>_info` (probe A).
 */
export declare function analyzeGlslTopShader(code: string, creationCode?: string): GlslTopAnalysis;
/** TOP pre-validation: blocking errors or null when safe. */
export declare function preValidateTopShader(code: string, creationCode?: string): string[] | null;
/**
 * Pre-validation for the apply flow: returns blocking errors (R1 / no main)
 * that must stop the write, or null when safe to proceed.
 */
export declare function preValidateShader(code: string): string[] | null;
export interface GlslApplyArgs {
    /** Parent COMP path, e.g. "/project1". */
    parentPath: string;
    /** Name for the glslPOP (also derives the textDAT `<name>_code`). */
    name: string;
    /** Full GLSL shader source. */
    shader: string;
    /** Optional POP source path to wire into input 0 (GLSL POP needs an input). */
    sourcePath?: string;
    /** Override outputattrs (default 'P' — the verified recipe, R3). */
    outputattrs?: string;
}
/**
 * Generate ONE Python script (for client.execute) that:
 *   1. writes the shader to `<name>_code` textDAT,
 *   2. creates the glslPOP,
 *   3. applies Create Attributes for every new attribute the shader writes (R3),
 *   4. sets outputaccess='readwrite' when the shader reads what it writes (R4),
 *   5. wires the source (input 0) if given,
 *   6. cooks, checks errors() and on failure reads the infoDAT `<name>_info` (R5),
 *   7. prints a single JSON line report.
 * Every step is defensive: params are hasattr-guarded, failures are reported,
 * never thrown (the script must always print its JSON).
 */
export declare function buildGlslApplyCode(args: GlslApplyArgs): string;
export interface GlslApplyReport {
    ok: boolean;
    path: string | null;
    errors: string[];
    warnings: string[];
    skipped: string[];
    shader_info: string | null;
    num_points: number | null;
    num_prims: number | null;
    /** Embedded post-build wiring check (rule 16): source→glslPOP input 0, when
     *  a sourcePath was given and the wiring could be read inside the script. */
    wiring?: {
        ok: boolean;
        expected: string;
        actual: Array<{
            from: string;
            to: string;
            input: number;
        }>;
        error?: string;
    } | null;
}
export interface GlslApplyResult {
    isError?: boolean;
    preValidationErrors?: string[];
    report?: GlslApplyReport;
    message: string;
}
/**
 * Full safe apply: pre-validate (R1 blocking errors never reach TD), run the
 * generated script via client.execute, and surface the infoDAT compiler log
 * (R5) when TD still fails to compile. Never throws — returns a result object.
 */
export declare function applyGlslPop(client: {
    execute: (code: string) => Promise<{
        success: boolean;
        stdout?: string;
    }>;
}, args: GlslApplyArgs): Promise<GlslApplyResult>;
