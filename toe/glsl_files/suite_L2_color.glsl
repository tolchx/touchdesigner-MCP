// Level 2: Color output via Cd
// Variable: GLSL_L2
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
    P[id] = p;
    Cd[id] = vec4(sin(p.x + u_time) * 0.5 + 0.5, cos(p.z + u_time) * 0.5 + 0.5, 0.8, 1.0);
}
