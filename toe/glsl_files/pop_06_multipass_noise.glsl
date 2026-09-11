// Multi-pass noise accumulation
// Variable: GLSL_MULTIPASS_NOISE
// Source: test_live_td_glslpop_10bases.py
// Use with: glslPOP / glsladvancedPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    for (int i = 0; i < 3; i++) {
        vec4 n = TDSimplexNoise(vec4(p * 1.5, u_time + float(i) * 0.1));
        p += n.xyz * 0.1;
    }
    P[id] = p;
}
