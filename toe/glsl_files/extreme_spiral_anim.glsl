// Animated spiral with color
// Variable: GLSL_SPIRAL_ANIM
// Source: test_live_td_glsl_extreme.py
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
    float radius = t * 1.5;
    vec3 pos = vec3(cos(angle) * radius, t * 2.0 - 1.0, sin(angle) * radius);
    P[id] = pos;
    Cd[id] = vec4(t, sin(u_time + t * 5.0) * 0.5 + 0.5, 1.0 - t, 1.0);
}
