// Spring coil deformation
// Variable: GLSL_SPRING
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    float t = float(id) / float(TDNumElements());
    float angle = t * 20.0 + u_time;
    float radius = 0.3 + sin(u_time * 2.0) * 0.1;
    vec3 pos = vec3(
        cos(angle) * radius,
        t * 4.0 - 2.0,
        sin(angle) * radius
    );
    P[id] = pos;
}
