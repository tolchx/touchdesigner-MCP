// Magnetic field line deformation
// Variable: GLSL_MAGNETIC
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float field = sin(p.x * 2.0 + u_time) * cos(p.z * 2.0 + u_time);
    p.y += field * 0.5;
    p.x += cos(p.z * 3.0 + u_time) * 0.1;
    P[id] = p;
}
