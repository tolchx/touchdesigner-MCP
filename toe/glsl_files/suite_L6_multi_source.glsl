// Level 6: Multiple noise sources blended
// Variable: GLSL_L6
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
    vec4 n1 = TDSimplexNoise(vec4(p * 1.0, u_time * 0.3));
    vec4 n2 = TDSimplexNoise(vec4(p * 3.0, u_time * 0.7));
    vec3 displacement = n1.xyz * 0.5 + n2.xyz * 0.15;
    p += displacement;
    P[id] = p;
    Cd[id] = vec4(displacement * 0.5 + 0.5, 1.0);
}
