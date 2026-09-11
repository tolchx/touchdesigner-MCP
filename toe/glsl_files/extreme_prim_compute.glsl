// Primitive compute: index-based position
// Variable: GLSL_PRIM_COMPUTE
// Source: test_live_td_glsl_extreme.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    P[id] = p;
}
