// Strange attractor force field
// Variable: GLSL_ATTRACTOR
// Source: test_live_td_glslpop_10bases.py
// Use with: glslPOP / glsladvancedPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
uniform float u_strength;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    vec3 center = vec3(0.0, sin(u_time * 0.5) * 0.5, 0.0);
    vec3 dir = center - p;
    float dist = length(dir);
    float force = u_strength / (dist * dist + 0.5);
    p += normalize(dir) * force * 0.05;
    P[id] = p;
}
