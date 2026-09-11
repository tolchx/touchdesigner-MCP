// Level 3: Multiple attribute output (P + Cd + custom)
// Variable: GLSL_L3
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
    float wave = sin(p.x * 2.0 + u_time) * 0.3;
    p.y += wave;
    P[id] = p;
    Cd[id] = vec4(abs(wave) * 3.0, 0.5, 1.0 - abs(wave) * 3.0, 1.0);
}
