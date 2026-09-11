// Phyllotaxis spiral pattern (golden angle)
// Variable: GLSL_PHYLL
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

#define PHI 1.618033988749895
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    float n = float(id);
    float angle = n * 2.39996323;
    float r = sqrt(n) * 0.1;
    vec3 pos = vec3(cos(angle) * r, sin(angle) * r, 0.0);
    P[id] = pos;
}
