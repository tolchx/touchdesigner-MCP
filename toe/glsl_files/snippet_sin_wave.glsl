// TD snippet glsl2: Sin wave displacement
// Variable: GLSL_SIN
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
}
