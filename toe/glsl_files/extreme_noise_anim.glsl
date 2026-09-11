// Animated noise with TDSimplexNoise
// Variable: GLSL_NOISE_ANIM
// Source: test_live_td_glsl_extreme.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    vec4 n = TDSimplexNoise(vec4(p * 2.0, u_time * 0.5));
    p += n.xyz * 0.3;
    P[id] = p;
}
