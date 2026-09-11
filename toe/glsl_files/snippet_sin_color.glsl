// TD snippet glsl3: Sin wave + height-based color
// Variable: GLSL_SIN_COLOR
// Source: test_live_td_glsl_snippets.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements())
        return;
    vec3 pos = TDIn_P();
    pos.y += sin(uTime * 2.0 + pos.x);
    P[id] = pos;
    vec4 color = vec4(vec3(0.5) + 0.5 * normalize(pos),1.0);
    Color[id] = color;
}
