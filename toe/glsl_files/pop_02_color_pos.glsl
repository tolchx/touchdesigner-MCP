// Map XYZ position to RGB color
// Variable: GLSL_COLOR_POS
// Source: test_live_td_glslpop_10bases.py
// Use with: glslPOP / glsladvancedPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 pos = TDIn_P(0, id);
    Cd[id] = vec4(pos.x * 0.25 + 0.5, pos.y * 0.25 + 0.5, pos.z * 0.25 + 0.5, 1.0);
}
