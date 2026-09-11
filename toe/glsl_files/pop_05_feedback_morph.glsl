// Feedback-based morphing between two shapes
// Variable: GLSL_FEEDBACK_MORPH
// Source: test_live_td_glslpop_10bases.py
// Use with: glslPOP / glsladvancedPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
uniform float u_morph;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float t = u_time * 0.5;
    vec3 target = vec3(
        sin(p.x * 3.0 + t),
        cos(p.y * 3.0 + t),
        sin(p.z * 3.0 + t)
    ) * length(p);
    p = mix(p, target, u_morph);
    P[id] = p;
}
