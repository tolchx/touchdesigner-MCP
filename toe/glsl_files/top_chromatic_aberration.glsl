// Chromatic aberration effect
// Variable: GLSL_CHROMAB
// Source: test_live_td_glsl_advanced.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
uniform float u_amount;
void main() {
    vec2 uv = vUV.st;
    vec2 center = vec2(0.5);
    vec2 dir = uv - center;
    float r = texture(sTD2DInputs[0], uv + dir * u_amount * 0.01).r;
    float g = texture(sTD2DInputs[0], uv).g;
    float b = texture(sTD2DInputs[0], uv - dir * u_amount * 0.01).b;
    fragColor = TDOutputSwizzle(vec4(r, g, b, 1.0));
}
