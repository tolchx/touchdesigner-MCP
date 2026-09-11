// TD snippet glsl1: Simple pass-through
// Variable: GLSL_PASSTHROUGH
// Source: test_live_td_glsl_snippets.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

void main() {
    const uint id = TDIndex();
    if(id >= TDNumElements())
        return;
    P[id] = TDIn_P();
}
