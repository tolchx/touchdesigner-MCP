// Radial ripple from center
// Variable: GLSL_RIPPLE
// Source: test_live_td_glslpop_10bases.py
// Use with: glslPOP / glsladvancedPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float dist = length(p.xz);
    float wave = sin(dist * 5.0 - u_time * 3.0) * 0.3;
    p.y += wave * exp(-dist * 0.5);
    P[id] = p;
}
