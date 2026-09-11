// Sinusoidal wave displacement on Y axis
// Variable: GLSL_WAVE
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
    float t = float(id) / float(TDNumElements() - 1);
    p.y = sin(t * 10.0 + u_time) * 0.5;
    P[id] = p;
}
