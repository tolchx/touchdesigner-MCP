// Level 4: Noise-based animation with TDSimplexNoise
// Variable: GLSL_L4
// Source: test_live_td_glslpop_suite.py
// Use with: glslPOP (L1-L6) / glslTOP (L7)
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
    Cd[id] = vec4(n.xyz * 0.5 + 0.5, 1.0);
}
