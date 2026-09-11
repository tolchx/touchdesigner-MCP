// Noise-based particle displacement
// Variable: GLSL_NOISE_DISP
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
    vec4 noise = TDSimplexNoise(vec4(p * 2.0, u_time * 0.5));
    p += noise.xyz * 0.3;
    P[id] = p;
}
