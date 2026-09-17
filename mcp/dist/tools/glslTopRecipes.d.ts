/**
 * glslTopRecipes — 5 visual recipes for glslTOP derived from The Book of
 * Shaders (https://thebookofshaders.com/?lan=es) concepts, rewritten in the
 * TD-verified idioms of docs/GLSL_TOP_RULES.md (commit d3e3327, live on
 * TD 2025.31760):
 *
 *   T1:  explicit `layout(location = 0) out vec4 fragColor;`
 *   T2:  vUV.swizzle is .st / .xy — never .uv (probe G)
 *   T5:  uniforms bound via vec0name + vec0valuex/y/z/w (probe J)
 *   T6:  outputresolution 'custom' + resolutionw/h is deterministic
 *   T9:  compile errors live in `<name>_info`
 *   T10: feedback does NOT advance under scripted cook(force=True) — the
 *        feedback recipes below therefore verify wiring/compilation only and
 *        are marked realtime-only for content.
 *
 * Every shader passes analyzeGlslTopShader() (the offline safety net).
 */
export interface GlslTopRecipe {
    /** stable recipe id */
    id: string;
    title: string;
    /** Book of Shaders chapter the concept comes from */
    bosChapter: string;
    category: "shapes" | "noise" | "pattern" | "feedback";
    /** pixel-shader GLSL (TD idioms) */
    glsl: string;
    /** uniforms the shader declares, bound via vec0/const0 families */
    uniforms: Array<{
        /** python par name on glslTOP: vec0name | const0name */
        namePar: string;
        uniformName: string;
        /** python par carrying the value: vec0valuex | const0value */
        valuePar: string;
        value: number;
    }>;
    resolution: {
        w: number;
        h: number;
    };
    /** how to verify it live with numpyArray() */
    liveCheck: string;
    /** true when the visual needs real frames (T10 feedback limitation) */
    realtimeOnly?: boolean;
}
export declare const GLSL_TOP_RECIPES: GlslTopRecipe[];
/**
 * Build ONE Python script (client.execute → /exec) that creates the recipe
 * network: shader textDAT + glslTOP with verified params (pixeldat,
 * vec0-star / const0-star uniforms), custom resolution, optional feedbackTOP loop, cooks and
 * prints a JSON report with pixel samples for the live check.
 * Python 3.9-safe.
 */
export declare function buildGlslTopRecipeCode(recipe: GlslTopRecipe, parentPath: string, prefix: string): string;
/** Offline gate: every recipe must pass the TOP safety net. */
export declare function validateAllRecipes(): Array<{
    id: string;
    errors: string[];
}>;
/** TD node names: alphanumerics + underscore only. */
export declare function sanitizeNodeName(id: string): string;
