// Interference pattern from multiple wave sources
// Variable: GLSL_INTERFERENCE
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
    vec3 s1 = vec3(1.0, 0.0, 0.0);
    vec3 s2 = vec3(-1.0, 0.0, 0.0);
    float d1 = length(p - s1);
    float d2 = length(p - s2);
    float wave = sin(d1 * 5.0 - u_time * 3.0) + sin(d2 * 5.0 - u_time * 3.0);
    p.y += wave * 0.2;
    P[id] = p;
}
