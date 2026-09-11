// Lissajous curve distribution
// Variable: GLSL_LISSAJOUS
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    float t = float(id) / float(TDNumElements()) * 6.2831853;
    vec3 pos = vec3(
        sin(3.0 * t + u_time),
        sin(2.0 * t + u_time * 0.7),
        sin(5.0 * t + u_time * 0.3)
    );
    P[id] = pos;
}
