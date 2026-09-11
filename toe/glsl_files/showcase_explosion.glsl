// Showcase: Radial explosion + spiral
// Variable: SHADER_EXPLOSION
// Source: test_live_td_glsl_shaders.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    float force = sin(u_time * 1.5) * 0.5 + 0.5;
    vec3 dir = normalize(p + 0.001);
    float push = force * 2.0 + sin(dist * 2.0 - u_time * 3.0) * 0.3;
    p += dir * push;
    float a = u_time * 0.5 + dist * 0.3;
    float ct = cos(a), st = sin(a);
    p.xz = mat2(ct, -st, st, ct) * p.xz;
    P[id] = p;
}
