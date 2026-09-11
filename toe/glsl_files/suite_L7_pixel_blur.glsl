// Level 7: Pixel blur pass-through (glslTOP pattern)
// Variable: GLSL_L7
// Source: test_live_td_glslpop_suite.py
// Use with: glslPOP (L1-L6) / glslTOP (L7)
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    fragColor = TDOutputSwizzle(color);
}
