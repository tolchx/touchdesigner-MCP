// Particle lifecycle: birth, age, death
// Variable: GLSL_LIFECYCLE
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float life = fract(float(id) / float(TDNumElements()) + u_time * 0.2);
    float scale = sin(life * 3.14159);
    p *= scale;
    p.y += life * 2.0 - 1.0;
    P[id] = p;
    Cd[id] = vec4(scale, 1.0 - life, life, 1.0);
}
