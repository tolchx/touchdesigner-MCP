// Extra output attribute (Cd on glsladvancedPOP)
// Variable: GLSL_EXTRAOUT
// Source: test_live_td_glsl_extreme.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    P[id] = p;
    Cd[id] = vec4(sin(u_time) * 0.5 + 0.5, 0.5, 0.8, 1.0);
}
