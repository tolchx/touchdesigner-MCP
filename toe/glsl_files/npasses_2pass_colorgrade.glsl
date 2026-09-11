// 2-pass color grading (glslTOP npasses=2)
// Variable: GLSL_2PASS_COLORGRADE
// Source: test_live_td_glsl_npasses.py
// Use with: glslTOP only
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

out vec4 fragColor;
void main() {
    vec2 uv = vUV.st;
    vec4 color = texture(sTD2DInputs[0], uv);
    if (uTDPass == 0) {
        vec3 lift = vec3(0.05, 0.02, 0.08);
        vec3 gamma = vec3(1.2, 1.0, 0.9);
        vec3 gain = vec3(1.1, 1.05, 1.0);
        vec3 graded = pow(color.rgb + lift, 1.0 / gamma) * gain;
        color = vec4(clamp(graded, 0.0, 1.0), color.a);
    } else {
        vec2 center = uv - vec2(0.5);
        float dist = length(center);
        float vignette = 1.0 - smoothstep(0.3, 0.8, dist);
        color.rgb *= vignette;
    }
    fragColor = TDOutputSwizzle(color);
}
