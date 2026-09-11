// Soft glow bloom effect
// Variable: GLSL_GLOW
// Source: test_live_td_glsl_advanced.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec2 uv = vUV.st;
    vec4 sum = vec4(0.0);
    for (int x = -2; x <= 2; x++) {
        for (int y = -2; y <= 2; y++) {
            sum += texture(sTD2DInputs[0], uv + vec2(float(x), float(y)) * texel);
        }
    }
    vec4 blurred = sum / 25.0;
    vec4 original = texture(sTD2DInputs[0], uv);
    vec4 glow = original + blurred * 0.5;
    fragColor = TDOutputSwizzle(clamp(glow, 0.0, 1.0));
}
