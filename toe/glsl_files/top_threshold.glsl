// Threshold filter: above 0.5 white, below black
// Variable: GLSL_THRESHOLD
// Source: test_live_td_glsl_advanced.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = lum > 0.5 ? vec3(1.0) : vec3(0.0);
    fragColor = TDOutputSwizzle(color);
}
