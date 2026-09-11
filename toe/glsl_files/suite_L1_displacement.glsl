// Level 1: Basic position displacement
// Variable: GLSL_L1
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
    p.y += sin(p.x * 3.0 + u_time) * 0.3;
    P[id] = p;
}
