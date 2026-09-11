// Single pass baseline: color invert
// Variable: GLSL_SINGLE_PASS
// Source: test_live_td_glsl_npasses.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    color.rgb = 1.0 - color.rgb;
    fragColor = TDOutputSwizzle(color);
}
