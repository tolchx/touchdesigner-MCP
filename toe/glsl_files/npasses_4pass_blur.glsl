// 4-pass progressive blur (glslTOP npasses=4)
// Variable: GLSL_4PASS_BLUR
// Source: test_live_td_glsl_npasses.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec2 texel = 1.0 / uTDOutputInfo.res;
    vec4 color = texture(sTD2DInputs[0], vUV.st);
    if (uTDPass > 0) {
        vec4 sum = vec4(0.0);
        for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
                vec2 offset = vec2(float(x), float(y)) * texel;
                sum += texture(sTD2DInputs[0], vUV.st + offset);
            }
        }
        color = sum / 9.0;
    }
    fragColor = TDOutputSwizzle(color);
}
