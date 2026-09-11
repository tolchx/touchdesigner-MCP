// L-system growth pattern
// Variable: GLSL_GROWTH
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
    float growth = clamp(u_time * 0.3 - t, 0.0, 1.0);
    vec3 p = TDIn_P(0, id);
    p *= growth;
    p.y += sin(p.x * 3.0 + u_time) * 0.2 * growth;
    P[id] = p;
    Cd[id] = vec4(growth, 1.0 - t, t * 0.5, 1.0);
}
