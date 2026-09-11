// TD snippet glsl10: Multi-attribute passthrough
// Variable: GLSL_MULTI_ATTR
// Source: test_live_td_glsl_snippets.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements())
        return;
    float px = TDIn_P().x;
    vec4 c = TDIn_Color();
    Color[id] = c;
    Thing[id] = px;
    P[id] = TDIn_P();
}
