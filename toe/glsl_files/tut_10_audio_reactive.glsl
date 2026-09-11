// Audio-reactive particle displacement
// Variable: GLSL_AUDIO
// Source: test_live_td_glslpop_tutorials.py
// Use with: glslPOP
//
// IMPORTANT: Wire source POP BEFORE setting computedat (see BUILD ORDER)
// ========================================================================

uniform float u_time;
uniform float u_bass;
uniform float u_treble;
void main() {
    uint id = TDIndex();
    if (id >= TDNumElements()) return;
    vec3 p = TDIn_P(0, id);
    float dist = length(p);
    p *= 1.0 + u_bass * sin(dist * 3.0 - u_time * 5.0) * 0.3;
    p.y += u_treble * cos(p.x * 5.0 + u_time * 3.0) * 0.2;
    P[id] = p;
}
